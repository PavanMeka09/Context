import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchModels, extractWebSearchQuery, webSearchToolParametersSchema } from '../api';

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
      const models = await fetchModels();
      expect(models.length).toBeGreaterThanOrEqual(2);
      expect(models[0].id).toBe('gemini-3.6-flash');
      expect(models.some(m => m.id === 'gemini-3.1-pro-preview')).toBe(true);
      expect(models.some(m => m.id === 'gemini-2.5-flash')).toBe(true);
    });

    it('fetches Gemini dynamic models when API key is provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', supportedGenerationMethods: ['generateContent'] }
          ]
        })
      } as Response);

      const models = await fetchModels('test-key');
      expect(models.length).toBe(2);
      expect(models.map(m => m.id)).toEqual(['gemini-2.5-flash', 'gemini-3.6-flash']);
    });

    it('returns fallback models when Gemini API call fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const models = await fetchModels('test-key');
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id === 'gemini-3.6-flash')).toBe(true);
    });
  });
  describe('web_search parameter handling', () => {
    it('validates schema and correctly extracts query when model sends string query, queries array, or search_query', () => {
      const input1 = { query: 'Kiara Advani photo' };
      const input2 = { queries: ['Kiara Advani image hd', 'Kiara Advani photos'] };
      const input3 = { queries: 'Kiara Advani photos' };
      const input4 = { search_query: 'Kiara Advani' };
      const input5 = { q: 'Kiara Advani' };

      expect(webSearchToolParametersSchema.safeParse(input1).success).toBe(true);
      expect(webSearchToolParametersSchema.safeParse(input2).success).toBe(true);
      expect(webSearchToolParametersSchema.safeParse(input3).success).toBe(true);
      expect(webSearchToolParametersSchema.safeParse(input4).success).toBe(true);
      expect(webSearchToolParametersSchema.safeParse(input5).success).toBe(true);

      expect(extractWebSearchQuery(input1)).toBe('Kiara Advani photo');
      expect(extractWebSearchQuery(input2)).toBe('Kiara Advani image hd');
      expect(extractWebSearchQuery(input3)).toBe('Kiara Advani photos');
      expect(extractWebSearchQuery(input4)).toBe('Kiara Advani');
      expect(extractWebSearchQuery(input5)).toBe('Kiara Advani');
    });
  });
});
