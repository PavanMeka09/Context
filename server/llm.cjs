// Helper: Call LLM API (Google Gemini) from the backend
async function callLLM(settings, systemPrompt, userPrompt, screenshotBase64 = '', abortSignal = null) {
  const { provider = 'gemini', apiKey, model } = settings || {};
  if (provider && provider !== 'gemini') {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  if (!apiKey) {
    throw new Error('API Key is not configured on the server. Please save settings in Context.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-3.6-flash'}:generateContent?key=${apiKey}`;
  const userParts = [{ text: userPrompt }];
  if (screenshotBase64) {
    const mimeMatch = screenshotBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const cleanBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
    userParts.push({
      inlineData: {
        mimeType,
        data: cleanBase64
      }
    });
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: userParts
      }
    ]
  };

  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abortSignal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = {
  callLLM
};
