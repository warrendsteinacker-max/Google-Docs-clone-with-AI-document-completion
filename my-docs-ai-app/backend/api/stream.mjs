/**
 * Streaming version of the page-by-page fill — same contract as
 * /api/fill/page, but the filled HTML streams back token-by-token
 * over SSE so the frontend can show it being written live.
 */
export const config = { runtime: 'edge' };

const GEMINI_STREAM_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse';

function buildPagePrompt(pageHtml, pageIndex, totalPages) {
  return `You will receive ONE page of an HTML document — page ${pageIndex + 1} of ${totalPages}.

This page may contain blanks, fill-in-the-blank lines (___), empty table cells next to questions, or open questions that need answers.

CRITICAL RULES — follow exactly:
1. Return ONLY the completed HTML for this page. No markdown fences, no commentary — raw HTML only.
2. Do NOT alter any existing HTML tags, attributes, inline styles, class names, or element order.
3. Do NOT add or remove any HTML elements except filling TEXT CONTENT into elements that are empty or contain blank/placeholder markers (___, [BLANK], empty <td>, etc).
4. Preserve every word of existing content exactly as written.
5. If this page has nothing to fill, return it completely unchanged.
6. Keep filled-in text concise and on-topic.

PAGE ${pageIndex + 1} OF ${totalPages} — HTML TO COMPLETE:
---
${pageHtml}
---

Return the completed HTML for this page now, and nothing else:`;
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { apiKey, pageHtml, pageIndex, totalPages, history } = body || {};
  const key = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY;

  if (!key) {
    return new Response(JSON.stringify({ error: 'No API key configured.' }), { status: 400 });
  }
  if (!pageHtml) {
    return new Response(JSON.stringify({ error: '"pageHtml" is required.' }), { status: 400 });
  }

  const priorHistory = Array.isArray(history) ? history : [];
  const prompt = buildPagePrompt(pageHtml, pageIndex ?? 0, totalPages ?? 1);
  const contents = [...priorHistory, { role: 'user', parts: [{ text: prompt }] }];

  const geminiRes = await fetch(`${GEMINI_STREAM_URL}&key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.25, maxOutputTokens: 2048 },
    }),
  });

  if (!geminiRes.ok || !geminiRes.body) {
    const errText = await geminiRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ error: `Gemini error ${geminiRes.status}: ${errText}` }),
      { status: 502 }
    );
  }

  return new Response(geminiRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
