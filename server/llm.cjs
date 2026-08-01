// Helper: Call LLM API (Gemini / OpenRouter / Ollama) from the backend
async function callLLM(settings, systemPrompt, userPrompt, screenshotBase64 = '', abortSignal = null) {
  const { provider, apiKey, model, localUrl } = settings;
  if (!apiKey && provider !== 'ollama' && provider !== 'openai') {
    throw new Error('API Key is not configured on the server. Please save settings in Context.');
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const userParts = [{ text: userPrompt }];
    if (screenshotBase64) {
      const cleanBase64 = screenshotBase64.split(',')[1] || screenshotBase64;
      userParts.push({
        inlineData: {
          mimeType: 'image/png',
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
  } else if (provider === 'openrouter' || provider === 'ollama' || provider === 'openai') {
    const baseURL = provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : provider === 'openai'
        ? `${localUrl || 'https://api.openai.com/v1'}/chat/completions`
        : `${localUrl || 'http://localhost:11434/v1'}/chat/completions`;

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://context.ai';
      headers['X-Title'] = 'Context AI Chat';
    }

    let userContent = userPrompt;
    if (screenshotBase64) {
      userContent = [
        { type: 'text', text: userPrompt },
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64.startsWith('data:') ? screenshotBase64 : `data:image/png;base64,${screenshotBase64}`
          }
        }
      ];
    }

    const response = await fetch(baseURL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: userContent }
        ]
      }),
      signal: abortSignal
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${provider.toUpperCase()} API error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

module.exports = {
  callLLM
};
