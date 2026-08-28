import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callLLM } from '../llm.cjs';

describe('server/llm.cjs', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws error when API Key is missing for gemini provider', async () => {
    const settings = { provider: 'gemini' as const, apiKey: '', model: 'gemini-2.5-flash' };
    await expect(callLLM(settings, '', 'Hello')).rejects.toThrow(
      'API Key is not configured on the server'
    );
  });

  it('throws error for unsupported provider', async () => {
    const settings = { provider: 'unknown' as unknown as 'gemini', apiKey: 'test-key', model: 'test-model' };
    await expect(callLLM(settings, '', 'Hello')).rejects.toThrow('Unsupported provider: unknown');
  });

  it('calls Gemini REST API correctly', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Response from Gemini' }]
          }
        }
      ]
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const settings = { provider: 'gemini', apiKey: 'test-gemini-key', model: 'gemini-2.5-flash' };
    const result = await callLLM(settings, 'System prompt', 'User prompt');

    expect(result).toBe('Response from Gemini');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test-gemini-key'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
    );
  });


  it('handles API error status from LLM endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    } as Response);

    const settings = { provider: 'gemini', apiKey: 'invalid-key', model: 'gemini-2.5-flash' };
    await expect(callLLM(settings, '', 'Hello')).rejects.toThrow('Gemini API error: 401 - Unauthorized');
  });

  it('calls Ollama /api/chat correctly with text prompts', async () => {
    const mockResponse = {
      message: {
        role: 'assistant',
        content: 'Response from Ollama llama3.2'
      }
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const settings = { provider: 'ollama', model: 'llama3.2', localUrl: 'http://localhost:11434' };
    const result = await callLLM(settings, 'System instruction', 'Hello local model');

    expect(result).toBe('Response from Ollama llama3.2');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2',
          messages: [
            { role: 'system', content: 'System instruction' },
            { role: 'user', content: 'Hello local model' }
          ],
          stream: false
        })
      })
    );
  });

  it('calls Ollama /api/chat with base64 vision images', async () => {
    const mockResponse = {
      message: {
        role: 'assistant',
        content: 'I see a web page with a login button'
      }
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const settings = { provider: 'ollama', model: 'llava', localUrl: 'http://127.0.0.1:11434' };
    const screenshot = 'data:image/jpeg;base64,abc123visiondata';
    const result = await callLLM(settings, 'Vision System', 'Analyze this screen', screenshot);

    expect(result).toBe('I see a web page with a login button');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'llava',
          messages: [
            { role: 'system', content: 'Vision System' },
            { role: 'user', content: 'Analyze this screen', images: ['abc123visiondata'] }
          ],
          stream: false
        })
      })
    );
  });

  it('handles Ollama API error correctly', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'model "unknown-model" not found'
    } as Response);

    const settings = { provider: 'ollama', model: 'unknown-model', localUrl: 'http://localhost:11434' };
    await expect(callLLM(settings, '', 'Hello')).rejects.toThrow('Ollama API error: 500 - model "unknown-model" not found');
  });
});
