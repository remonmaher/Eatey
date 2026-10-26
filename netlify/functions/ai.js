// Server-side function: keeps your API key secret.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const { prompt, images } = JSON.parse(event.body || '{}');
    if (!prompt || !Array.isArray(images) || images.length === 0 || images.length > 4)
      return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            ...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
            { type: 'text', text: prompt }
          ]
        }]
      })
    });
    const j = await r.json();
    if (!r.ok) return { statusCode: 502, body: JSON.stringify({ error: j.error?.message || 'AI error' }) };

    const text = j.content.map(c => c.text || '').join('');
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    const json = JSON.parse(text.slice(start, end + 1));
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
