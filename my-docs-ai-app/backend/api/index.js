/**
 * Page-by-page Gemini fill API.
 *
 * The client sends ONE page of HTML at a time. Gemini is instructed
 * to return that SAME page — identical tags, order, and wording —
 * with only the blanks/questions filled in. The client never sends
 * the next page until this one's filled HTML comes back.
 *
 * Stateless on the server: the growing conversation history is
 * passed in by the client each call (and grown again in the
 * response), so Gemini still "remembers" every prior page without
 * the server needing to persist anything between requests.
 */
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true }));

const DEFAULT_KEY = process.env.GEMINI_API_KEY || null;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash';

function resolveKey(k) {
  return (k && k.trim()) || DEFAULT_KEY;
}

/** The exact instruction sent with every page — keep this identical
 *  between index.js and stream.mjs so behavior matches in both modes. */
function buildPagePrompt(pageHtml, pageIndex, totalPages) {
  return `You will receive ONE page of an HTML document — page ${pageIndex + 1} of ${totalPages}.

This page may contain blanks, fill-in-the-blank lines (___), empty table cells next to questions, or open questions that need answers.

CRITICAL RULES — follow exactly:
1. Return ONLY the completed HTML for this page. No markdown fences, no commentary — raw HTML only.
2. Do NOT alter any existing HTML tags, attributes, inline styles, class names, or element order.
3. Do NOT add or remove any HTML elements except filling TEXT CONTENT into elements that are empty or contain blank/placeholder markers (___, [BLANK], empty <td>, etc).
4. Preserve every word of existing content exactly as written — you are only adding answers, never rewriting questions or surrounding text.
5. If this page has nothing to fill, return it completely unchanged.
6. Keep filled-in text concise and on-topic for the document's subject matter.

PAGE ${pageIndex + 1} OF ${totalPages} — HTML TO COMPLETE:
---
${pageHtml}
---

Return the completed HTML for this page now, and nothing else:`;
}

async function callGemini(apiKey, contents) {
  const url = `${GEMINI_BASE}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.25, maxOutputTokens: 2048 },
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${r.status}`);
  }
  return r.json();
}

function extractText(resp) {
  return resp?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
function stripFences(t) {
  return t.replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasDefaultKey: !!DEFAULT_KEY, time: new Date().toISOString() });
});

/**
 * POST /api/fill/page
 * Body: {
 *   apiKey?: string,
 *   pageHtml: string,     // HTML of exactly ONE page
 *   pageIndex: number,    // 0-based
 *   totalPages: number,
 *   history?: [...]       // prior {role,parts} turns from earlier pages
 * }
 * Returns: {
 *   filledHtml: string,       // same page, same structure, blanks filled
 *   historyAppend: [...]      // 2 turns to append client-side before next page
 * }
 */
app.post('/api/fill/page', async (req, res) => {
  const { apiKey, pageHtml, pageIndex, totalPages, history } = req.body || {};
  const key = resolveKey(apiKey);

  if (!key) {
    return res.status(400).json({ error: 'No API key provided and no default GEMINI_API_KEY configured.' });
  }
  if (typeof pageHtml !== 'string' || !pageHtml.trim()) {
    return res.status(400).json({ error: '"pageHtml" is required.' });
  }
  if (typeof pageIndex !== 'number' || typeof totalPages !== 'number') {
    return res.status(400).json({ error: '"pageIndex" and "totalPages" must be numbers.' });
  }

  const priorHistory = Array.isArray(history) ? history : [];
  const prompt = buildPagePrompt(pageHtml, pageIndex, totalPages);
  const contents = [...priorHistory, { role: 'user', parts: [{ text: prompt }] }];

  try {
    const resp = await callGemini(key, contents);
    const raw = extractText(resp);
    const filledHtml = stripFences(raw);

    res.json({
      filledHtml,
      historyAppend: [
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'model', parts: [{ text: raw }] },
      ],
      usedDefaultKey: !apiKey,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = app;