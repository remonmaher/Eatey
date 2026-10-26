// Server-side function: keeps your free Gemini API key secret.
// Set GEMINI_API_KEY in Netlify. (Optional: GEMINI_MODEL to change the model.)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { prompt, images } = JSON.parse(event.body || '{}');
    if (!prompt || !Array.isArray(images) || images.length === 0 || images.length > 4)
      return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            ...images.map(data => ({ inline_data: { mime_type: 'image/jpeg', data } })),
            { text: prompt }
          ]
        }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4000 }
      })
    });
    const j = await r.json();
    if (!r.ok) {
      console.error('Gemini error', JSON.stringify(j));
      return { statusCode: r.status === 429 ? 429 : 502, body: JSON.stringify({ error: j.error?.message || 'AI error' }) };
    }

    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    const json = JSON.parse(text.slice(start, end + 1));
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
