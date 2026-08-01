import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchModels } from '../api';

describe('src/utils/api.ts', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchModels', () => {
    it('returns fallback models for Gemini when no API key is provided', async () => {
      const models = await fetchModels('gemini');
      expect(models.length).toBeGreaterThanOrEqual(2);
      expect(models[0].id).toBe('gemini-3.6-flash');
      expect(models.some(m => m.id === 'gemini-3.1-pro-preview')).toBe(true);
      expect(models.some(m => m.id === 'gemini-2.5-flash')).toBe(true);
    });

    it('fetches OpenAI dynamic models when URL and key are valid', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4o' },
            { id: 'gpt-4o-mini' }
          ]
        })
      } as Response);

      const models = await fetchModels('openai', 'sk-test', 'https://api.openai.com/v1');
      expect(models).toHaveLength(2);
      expect(models.map(m => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini']);
    });

    it('returns fallback models when OpenAI API call fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const models = await fetchModels('openai', 'sk-test');
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id === 'gpt-4o-mini')).toBe(true);
    });

    it('returns fallback models for Ollama when endpoint is unavailable', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Ollama offline'));
      const models = await fetchModels('ollama');
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id === 'llama3')).toBe(true);
    });
  });
});
