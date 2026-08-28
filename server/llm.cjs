// Helper: Call LLM API (Google Gemini, Ollama, OpenAI, Anthropic, OpenRouter) from the backend
async function callLLM(settings, systemPrompt, userPrompt, screenshotBase64 = '', abortSignal = null) {
  const { provider = 'gemini', apiKey, model, localUrl } = settings || {};

  if (provider === 'ollama') {
    const baseUrl = (localUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const url = `${baseUrl}/api/chat`;
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    const userMsg = { role: 'user', content: userPrompt };
    if (screenshotBase64) {
      const cleanBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
      userMsg.images = [cleanBase64];
    }
    messages.push(userMsg);

    const body = {
      model: model || 'llama3.2',
      messages,
      stream: false
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortSignal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    return data.message?.content || data.response || '';
  }

  if (provider === 'gemini') {
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

  if (provider === 'openai' || provider === 'openrouter') {
    if (!apiKey) {
      throw new Error(`API Key is not configured for ${provider}. Please save settings in Context.`);
    }
    const endpoint = provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    if (screenshotBase64) {
      const mimeMatch = screenshotBase64.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const cleanBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${cleanBase64}` } }
        ]
      });
    } else {
      messages.push({ role: 'user', content: userPrompt });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || (provider === 'openrouter' ? 'anthropic/claude-3.7-sonnet' : 'gpt-4o'),
        messages
      }),
      signal: abortSignal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${provider} API error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'anthropic') {
    if (!apiKey) {
      throw new Error('API Key is not configured for Anthropic. Please save settings in Context.');
    }
    const messages = [];
    if (screenshotBase64) {
      const mimeMatch = screenshotBase64.match(/^data:(image\/\w+);base64,/);
      const mediaType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const cleanBase64 = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: cleanBase64
            }
          },
          { type: 'text', text: userPrompt }
        ]
      });
    } else {
      messages.push({ role: 'user', content: userPrompt });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-3-7-sonnet-20250219',
        system: systemPrompt || undefined,
        messages,
        max_tokens: 4096
      }),
      signal: abortSignal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    return data.content?.[0]?.text || '';
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

const { executeCrawl, crawlWebPage, getCrawl4AIToolDefinition } = require('./crawl4ai.cjs');

module.exports = {
  callLLM,
  crawlWebPage,
  crawlWebPageTool: crawlWebPage,
  getCrawl4AIToolDefinition
};
