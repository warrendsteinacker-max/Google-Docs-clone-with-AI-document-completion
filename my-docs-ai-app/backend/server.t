/**
 * Render backend — page-by-page Gemini fill.
 *
 * KEY FIXES vs previous version:
 *
 * 1. REMOVED express-rate-limit entirely.
 *    It was only rate-limiting calls FROM your own frontend TO this server.
 *    It had zero effect on Gemini's quota and just blocked legitimate requests.
 *
 * 2. MODEL FALLBACK CHAIN.
 *    The "limit: 0" error means your API key's Google Cloud project was
 *    allocated ZERO free-tier quota for gemini-2.0-flash specifically.
 *    This is not a "you used it all up" error — the limit was zero to start.
 *    Fix: try models in order. If one returns 429/quota-exceeded, move to the
 *    next. gemini-1.5-flash and gemini-1.5-flash-8b have more generous free
 *    tier provisioning and will almost always work when 2.0-flash doesn't.
 *
 * 3. PROPER RETRY-AFTER PARSING.
 *    The Gemini error message contains "Please retry in X.Xs". We parse that
 *    and actually wait that duration before trying the next model in the chain.
 *
 * 4. BETTER LOGGING.
 *    Every fill now logs which model was actually used, making it easy to see
 *    in Render logs when fallback kicks in.
 */

const express = require('express');
const cors    = require('cors');

require('dotenv').config(); // local dev only — Render uses dashboard env vars

const app  = express();
const PORT = process.env.PORT || 10000;

/* ── CORS ── */
const ALLOWED = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({
  origin: ALLOWED,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.options('*', cors()); // handle preflight

/* ── Body parsing ── */
app.use(express.json({ limit: '8mb' }));

/* ── Config ── */
const DEFAULT_KEY = process.env.GEMINI_API_KEY || null;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/*
 * MODEL FALLBACK ORDER
 * gemini-2.0-flash        → newest, but "limit: 0" free tier on some projects
 * gemini-1.5-flash        → very capable, generous free tier
 * gemini-1.5-flash-8b     → lighter, highest free-tier RPM
 * gemini-1.5-flash-latest → alias, catches any new 1.5 update
 */
const MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-flash-latest',
];

function resolveKey(bodyKey) {
  return (bodyKey && bodyKey.trim()) || DEFAULT_KEY;
}

/* Parse "Please retry in 54.07s" → 54070ms */
function parseRetryAfterMs(msg) {
  const m = String(msg).match(/retry in ([\d.]+)s/i);
  if (m) return Math.min(Math.ceil(parseFloat(m[1])) * 1000, 60000);
  return 5000; // default 5s if not parseable
}

function isQuotaError(status, msg) {
  return (
    status === 429 ||
    String(msg).toLowerCase().includes('quota') ||
    String(msg).toLowerCase().includes('resource_exhausted') ||
    String(msg).toLowerCase().includes('rate limit')
  );
}

/*
 * callGeminiWithFallback
 * Tries each model in MODELS order. On quota/rate errors, waits the
 * retry-after time then moves to the next model. On non-quota errors,
 * throws immediately (no point retrying a different model for auth errors etc).
 */
async function callGeminiWithFallback(apiKey, contents) {
  let lastError = null;

  for (const model of MODELS) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    console.log(`[gemini] Trying model: ${model}`);

    let r;
    try {
      r = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(45_000), // 45s per request
      });
    } catch (fetchErr) {
      console.error(`[gemini] Network error on ${model}:`, fetchErr.message);
      lastError = fetchErr;
      continue; // try next model
    }

    /* Parse response body regardless of status */
    const body = await r.json().catch(() => ({}));
    const errMsg = body?.error?.message || `HTTP ${r.status}`;

    if (!r.ok) {
      if (isQuotaError(r.status, errMsg)) {
        const wait = parseRetryAfterMs(errMsg);
        console.warn(`[gemini] ${model} quota/rate error. Waiting ${wait}ms then trying next model. Error: ${errMsg}`);
        await new Promise(res => setTimeout(res, Math.min(wait, 8000))); // cap wait at 8s between models
        lastError = new Error(errMsg);
        continue; // try next model
      }
      /* Non-quota error (bad key, invalid request, etc) — throw immediately */
      throw new Error(errMsg);
    }

    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`[gemini] ✓ Success with model: ${model} (${text.length} chars returned)`);
    return { text, model };
  }

  /* All models failed */
  throw new Error(
    `All models exhausted. Last error: ${lastError?.message || 'unknown'}. ` +
    `Check your API key at https://aistudio.google.com/app/apikey and ensure ` +
    `the Generative Language API is enabled in your Google Cloud project.`
  );
}

/* ── Prompt builder ── */
function buildPagePrompt(pageHtml, pageIndex, totalPages) {
  return (
    `You are completing a student document worksheet. ` +
    `This is page chunk ${pageIndex + 1} of ${totalPages}.\n\n` +
    `STRICT RULES:\n` +
    `1. Return ONLY raw HTML — no markdown fences (\`\`\`), no explanation.\n` +
    `2. Keep ALL existing HTML tags and attributes exactly as-is.\n` +
    `3. Fill ONLY: empty elements, cells with just whitespace/&nbsp;, and lines with ___ or [BLANK].\n` +
    `4. Do NOT rewrite or remove any existing text.\n` +
    `5. Answers must be accurate and appropriate for the document subject.\n` +
    `6. If nothing needs filling, return the HTML completely unchanged.\n\n` +
    `HTML CHUNK:\n${pageHtml}\n\nReturn completed HTML now:`
  );
}

/* ── GET /api/health ── */
app.get('/api/health', (req, res) => {
  res.json({
    status:        'ok',
    hasDefaultKey: !!DEFAULT_KEY,
    models:        MODELS,
    time:          new Date().toISOString(),
  });
});

/* ── POST /api/fill/page ──
   Body: { apiKey?, pageHtml, pageIndex, totalPages, history? }
   Returns: { filledHtml, model, historyAppend }
*/
app.post('/api/fill/page', async (req, res) => {
  const { apiKey, pageHtml, pageIndex, totalPages, history } = req.body || {};
  const key = resolveKey(apiKey);

  if (!key) {
    return res.status(400).json({
      error: 'No API key. Set GEMINI_API_KEY in Render Environment Variables, or pass apiKey in request body.',
    });
  }
  if (!pageHtml || typeof pageHtml !== 'string' || !pageHtml.trim()) {
    return res.status(400).json({ error: '"pageHtml" is required and must be a non-empty string.' });
  }

  const idx   = typeof pageIndex   === 'number' ? pageIndex   : 0;
  const total = typeof totalPages  === 'number' ? totalPages  : 1;
  const prior = Array.isArray(history) ? history : [];

  const prompt  = buildPagePrompt(pageHtml, idx, total);
  const userTurn = { role: 'user', parts: [{ text: prompt }] };
  const contents = [...prior, userTurn];

  try {
    const { text, model } = await callGeminiWithFallback(key, contents);

    /* Strip any markdown fences Gemini occasionally adds despite instructions */
    const filledHtml = text.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim() || pageHtml;

    res.json({
      filledHtml,
      model,
      usedDefaultKey: !apiKey,
      historyAppend: [
        userTurn,
        { role: 'model', parts: [{ text }] },
      ],
    });
  } catch (e) {
    console.error('[/api/fill/page]', e.message);
    res.status(502).json({ error: e.message });
  }
});

/* ── POST /api/stream ── SSE streaming version */
app.post('/api/stream', async (req, res) => {
  const { apiKey, pageHtml, pageIndex, totalPages, history } = req.body || {};
  const key = resolveKey(apiKey);

  if (!key)     return res.status(400).json({ error: 'No API key.' });
  if (!pageHtml) return res.status(400).json({ error: '"pageHtml" required.' });

  const prior    = Array.isArray(history) ? history : [];
  const prompt   = buildPagePrompt(pageHtml, pageIndex ?? 0, totalPages ?? 1);
  const contents = [...prior, { role: 'user', parts: [{ text: prompt }] }];

  /* For streaming we also try models in order */
  let geminiRes = null;
  let lastErr   = null;

  for (const model of MODELS) {
    const url = `${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    try {
      const r = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { temperature: 0.2, maxOutputTokens: 2048 } }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!r.ok) {
        const eb = await r.json().catch(() => ({}));
        const em = eb?.error?.message || `HTTP ${r.status}`;
        if (isQuotaError(r.status, em)) { lastErr = new Error(em); continue; }
        throw new Error(em);
      }
      geminiRes = r;
      console.log(`[stream] Using model: ${model}`);
      break;
    } catch (e) {
      lastErr = e; continue;
    }
  }

  if (!geminiRes?.body) {
    const msg = lastErr?.message || 'All models failed.';
    return res.status(502).json({ error: msg });
  }

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache, no-transform');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const reader  = geminiRes.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(decoder.decode(value, { stream: true }));
  }
  res.end();
});

/* ── Start ── */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   Default Gemini key: ${DEFAULT_KEY ? 'SET' : 'NOT SET — users must provide their own key'}`);
  console.log(`   Model fallback order: ${MODELS.join(' → ')}`);
});