import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchModels, extractWebSearchQuery, webSearchToolParametersSchema, streamChatCompletion } from '../api';
import type { Settings, Message } from '../storage';
import * as aiModule from 'ai';
type AiModule = typeof aiModule;

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<AiModule>();
  return {
    ...actual,
    streamText: vi.fn()
  };
});
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
    it('returns fallback models for OpenAI, Anthropic, and OpenRouter when no API key is provided', async () => {
      const openaiModels = await fetchModels('openai');
      expect(openaiModels.some(m => m.id === 'gpt-4o')).toBe(true);

      const anthropicModels = await fetchModels('anthropic');
      expect(anthropicModels.some(m => m.id === 'claude-3-7-sonnet-20250219')).toBe(true);

      const openrouterModels = await fetchModels('openrouter');
      expect(openrouterModels.some(m => m.id === 'anthropic/claude-3.7-sonnet')).toBe(true);
    });

    it('fetches OpenAI dynamic models when provider and API key are provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4o' },
            { id: 'o3-mini' }
          ]
        })
      } as Response);

      const models = await fetchModels('openai', 'sk-test-openai');
      expect(models).toHaveLength(2);
      expect(models.map(m => m.id)).toEqual(['gpt-4o', 'o3-mini']);
    });
    it('supports FetchModelsOptions object signature', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-4o' }
          ]
        })
      } as Response);

      const models = await fetchModels({ provider: 'openai', apiKey: 'sk-test-openai' });
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('gpt-4o');
    });
  });
  describe('web_search parameter handling', () => {
    it.each([
      { input: { query: 'Kiara Advani photo' }, expected: 'Kiara Advani photo', label: 'single query string' },
      { input: { queries: ['Kiara Advani image hd', 'Kiara Advani photos'] }, expected: 'Kiara Advani image hd', label: 'queries string array' },
      { input: { queries: 'Kiara Advani photos' }, expected: 'Kiara Advani photos', label: 'queries string' },
      { input: { search_query: 'Kiara Advani' }, expected: 'Kiara Advani', label: 'search_query parameter' },
      { input: { q: 'Kiara Advani' }, expected: 'Kiara Advani', label: 'q parameter' },
    ])('validates schema and extracts query for $label', ({ input, expected }) => {
      expect(webSearchToolParametersSchema.safeParse(input).success).toBe(true);
      expect(extractWebSearchQuery(input)).toBe(expected);
    });
  });
  describe('streamChatCompletion', () => {
    it('passes stopWhen stepCountIs condition to streamText when web search is enabled', async () => {
      const mockStreamText = vi.mocked(aiModule.streamText);
      mockStreamText.mockReturnValue({
        fullStream: (async function* () {
          yield { type: 'text-delta', textDelta: 'Response after search' };
        })()
      } as unknown as ReturnType<typeof aiModule.streamText>);

      const settings: Settings = {
        apiKey: 'test-api-key',
        provider: 'gemini',
        model: 'gemini-3.6-flash',
        isWebSearchEnabled: true
      };

      const messages: Message[] = [{ id: '1', role: 'user', content: 'search kiara advani image', timestamp: new Date().toISOString() }];
      const callbacks = {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn()
      };
      const controller = new AbortController();

      await streamChatCompletion(settings, messages, 'system prompt', callbacks, controller.signal);

      expect(mockStreamText).toHaveBeenCalled();
      const options = mockStreamText.mock.calls[0][0];
      expect(options.tools).toBeDefined();
      expect(options.stopWhen).toBeDefined();
      expect(callbacks.onChunk).toHaveBeenCalledWith('Response after search');
      expect(callbacks.onDone).toHaveBeenCalledWith('Response after search');
    });
  });
});
