/**
 * Render backend — persistent Express server.
 * All routes in one file. No serverless split needed.
 * 
 * Routes:
 *   GET  /api/health       status check
 *   POST /api/fill/page    one page of HTML → Gemini → filled HTML back
 *   POST /api/stream       SSE streaming version of fill/page
 */
require('dotenv').config(); // loads .env locally; Render uses dashboard env vars

const express     = require('express');
const cors        = require('cors');
// const rateLimit   = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 10000;

/* ── CORS ── */
const allowedOrigin = '*';
app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

/* ── Body parsing ── */
app.use(express.json({ limit: '5mb' }));

/* ── Rate limiting ── */
// app.use('/api/', rateLimit({
//   windowMs: 60_000,
//   max: 60,
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { error: 'Too many requests, please wait a minute.' },
// }));

/* ── Config ── */
const DEFAULT_KEY    = process.env.GEMINI_API_KEY || null;
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash';
const GEMINI_URL     = `${GEMINI_BASE}:generateContent`;
const GEMINI_STREAM  = `${GEMINI_BASE}:streamGenerateContent?alt=sse`;

function resolveKey(bodyKey) {
  return (bodyKey && bodyKey.trim()) || DEFAULT_KEY;
}

/* ─────────────────────────────────────────────────────────────────
   PROMPT BUILDER
   Same rules used by both /api/fill/page and /api/stream so the
   filled HTML is always structurally identical to the original.
───────────────────────────────────────────────────────────────── */
function buildPagePrompt(pageHtml, pageIndex, totalPages) {
  return `You are filling in a student document. This is page chunk ${pageIndex + 1} of ${totalPages}.

RULES — follow exactly:
1. Return ONLY the completed HTML. No markdown fences, no explanation — raw HTML only.
2. Do NOT change any HTML tags, attributes, inline styles, class names, or element order.
3. Only add text content inside elements that are empty, contain "___ " blanks, contain "[BLANK]", or are empty <td>/<li> cells adjacent to a question.
4. Fill answers accurately and concisely, appropriate to the document subject.
5. Every word that already exists must stay exactly as written.
6. If nothing needs filling on this chunk, return it completely unchanged.

PAGE CHUNK HTML:
${pageHtml}

Return the completed HTML now, and nothing else:`;
}

/* ─────────────────────────────────────────────────────────────────
   GET /api/health
───────────────────────────────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasDefaultKey: !!DEFAULT_KEY,
    time: new Date().toISOString(),
  });
});

app.get('/send', (req, res) => {
    res.send("hello")
})

/* ─────────────────────────────────────────────────────────────────
   POST /api/fill/page   (non-streaming)
   Body: {
     apiKey?:    string   — optional; falls back to GEMINI_API_KEY env var
     pageHtml:   string   — outerHTML of one page chunk
     pageIndex:  number   — 0-based
     totalPages: number
     history?:   array    — prior conversation turns for context
   }
   Returns: {
     filledHtml:    string  — same structure, blanks filled
     historyAppend: array   — 2 turns the client appends before next page
     usedDefaultKey: bool
   }
───────────────────────────────────────────────────────────────── */
app.post('/api/fill/page', async (req, res) => {
  const { apiKey, pageHtml, pageIndex, totalPages, history } = req.body || {};
  const key = resolveKey(apiKey);

  if (!key) {
    return res.status(400).json({
      error: 'No API key provided and no default GEMINI_API_KEY set on the server.',
    });
  }
  if (!pageHtml || typeof pageHtml !== 'string') {
    return res.status(400).json({ error: '"pageHtml" is required.' });
  }
  if (typeof pageIndex !== 'number' || typeof totalPages !== 'number') {
    return res.status(400).json({ error: '"pageIndex" and "totalPages" must be numbers.' });
  }

  const priorHistory = Array.isArray(history) ? history : [];
  const prompt       = buildPagePrompt(pageHtml, pageIndex, totalPages);
  const userTurn     = { role: 'user', parts: [{ text: prompt }] };
  const contents     = [...priorHistory, userTurn];

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `Gemini HTTP ${geminiRes.status}`);
    }

    const data      = await geminiRes.json();
    const rawText   = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const filledHtml = rawText.replace(/```html\s*/gi, '').replace(/```/g, '').trim();

    res.json({
      filledHtml,
      historyAppend: [
        userTurn,
        { role: 'model', parts: [{ text: rawText }] },
      ],
      usedDefaultKey: !apiKey,
    });

  } catch (e) {
    console.error('[/api/fill/page]', e.message);
    res.status(502).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────────────────────────────
   POST /api/stream   (SSE streaming)
   Same body as /api/fill/page.
   Streams the filled HTML back token-by-token so the frontend
   can show it being written live. On Render (persistent server)
   we can pipe Gemini's response stream directly — no Edge runtime needed.
───────────────────────────────────────────────────────────────── */
app.post('/api/stream', async (req, res) => {
  const { apiKey, pageHtml, pageIndex, totalPages, history } = req.body || {};
  const key = resolveKey(apiKey);

  if (!key) {
    return res.status(400).json({ error: 'No API key provided.' });
  }
  if (!pageHtml) {
    return res.status(400).json({ error: '"pageHtml" is required.' });
  }

  const priorHistory = Array.isArray(history) ? history : [];
  const prompt       = buildPagePrompt(pageHtml, pageIndex ?? 0, totalPages ?? 1);
  const contents     = [...priorHistory, { role: 'user', parts: [{ text: prompt }] }];

  try {
    const geminiRes = await fetch(`${GEMINI_STREAM}&key=${encodeURIComponent(key)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    });

    if (!geminiRes.ok || !geminiRes.body) {
      const errText = await geminiRes.text().catch(() => '');
      return res.status(502).json({ error: `Gemini error ${geminiRes.status}: ${errText}` });
    }

    /* Set SSE headers BEFORE any data is written */
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disables Nginx buffering on Render
    res.flushHeaders();

    /* Pipe Gemini's SSE stream directly to the client */
    const reader  = geminiRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      /* Forward the raw SSE chunk — client parses data: lines */
      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();

  } catch (e) {
    console.error('[/api/stream]', e.message);
    /* If headers not sent yet we can still send JSON error */
    if (!res.headersSent) {
      res.status(502).json({ error: e.message });
    } else {
      res.end();
    }
  }
});

/* ── Start ── */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   Default Gemini key: ${DEFAULT_KEY ? 'SET' : 'NOT SET'}`);
});



