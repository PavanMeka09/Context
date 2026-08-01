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
    const settings = { provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash' };
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

  it('calls OpenAI compatible API correctly (OpenAI / OpenRouter / Ollama)', async () => {
    const mockResponse = {
      choices: [
        {
          message: { content: 'Response from OpenAI' }
        }
      ]
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    } as Response);

    const settings = { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' };
    const result = await callLLM(settings, 'System prompt', 'User prompt');

    expect(result).toBe('Response from OpenAI');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test',
          'Content-Type': 'application/json'
        })
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
});
