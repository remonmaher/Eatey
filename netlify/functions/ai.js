// Server-side function: keeps your free Gemini API key secret.
const MODELS = [process.env.GEMINI_MODEL, 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'].filter(Boolean);
const reply = (code, obj) => ({ statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) });

async function ask(model, key, parts, noThinking) {
  const generationConfig = { responseMimeType: 'application/json', maxOutputTokens: 4000 };
  if (noThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts }], generationConfig })
  });
  return { r, j: await r.json().catch(() => ({})) };
}

exports.handler = async (event) => {
  const key = process.env.GEMINI_API_KEY;

  // Open /.netlify/functions/ai in a browser to run this check.
  if (event.httpMethod === 'GET')
    return reply(200, { ok: true, keyIsSet: !!key, keyLength: key ? key.length : 0, models: MODELS });

  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!key) return reply(500, { error: 'GEMINI_API_KEY is not set in Netlify. Add it, then redeploy.' });

  try {
    const { prompt, images } = JSON.parse(event.body || '{}');
    if (!prompt || !Array.isArray(images) || images.length === 0 || images.length > 4)
      return reply(400, { error: 'Bad request (no photo received).' });

    const parts = [
      ...images.map(data => ({ inline_data: { mime_type: 'image/jpeg', data } })),
      { text: prompt }
    ];

    let lastErr = 'Unknown AI error';
    for (const model of MODELS) {
      for (const noThinking of [true, false]) {
        const { r, j } = await ask(model, key, parts, noThinking);
        if (r.ok) {
          const cand = j.candidates && j.candidates[0];
          const text = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
          const s = text.indexOf('{'), e = text.lastIndexOf('}');
          if (s < 0) { lastErr = 'AI gave no answer' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : ''); continue; }
          try { return reply(200, JSON.parse(text.slice(s, e + 1))); }
          catch (_) { lastErr = 'AI answer could not be read'; continue; }
        }
        lastErr = (j.error && j.error.message) || ('AI status ' + r.status);
        console.error('Gemini', model, r.status, lastErr);
        if (r.status === 429) return reply(429, { error: 'Free limit reached. Wait a minute. (' + lastErr + ')' });
        if (r.status === 401 || r.status === 403 || /API key/i.test(lastErr)) return reply(r.status, { error: 'Key problem: ' + lastErr });
        if (r.status !== 400) break; // 400 = retry without thinking option; others = next model
      }
    }
    return reply(502, { error: lastErr });
  } catch (err) {
    console.error(err);
    return reply(500, { error: 'Server error: ' + err.message });
  }
};
