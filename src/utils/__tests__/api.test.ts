import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchModels, testOllamaConnection, fetchOllamaRunningModels, unloadOllamaModel, formatShutdownCountdown, extractWebSearchQuery, webSearchToolParametersSchema, streamChatCompletion } from '../api';
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

    it('returns fallback models for Ollama when offline or fetch fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const models = await fetchModels({ provider: 'ollama' });
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.id === 'llama3.2')).toBe(true);
      expect(models.some(m => m.id === 'deepseek-r1')).toBe(true);
    });

    it('fetches dynamic models from local Ollama endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama3.2:latest', details: { parameter_size: '3.2B' } },
            { name: 'deepseek-r1:14b', details: { parameter_size: '14B' } },
            { name: 'qwen2.5:7b', details: { parameter_size: '7B' } }
          ]
        })
      } as Response);

      const models = await fetchModels({ provider: 'ollama', localUrl: 'http://127.0.0.1:11434' });
      expect(models).toHaveLength(3);
      expect(models.map(m => m.id)).toEqual(['deepseek-r1:14b', 'llama3.2:latest', 'qwen2.5:7b']);
      expect(models.find(m => m.id === 'llama3.2:latest')?.name).toBe('llama3.2:latest (3.2B)');
    });
  });

  describe('testOllamaConnection', () => {
    it('returns success and models when direct fetch succeeds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }, { name: 'mistral:latest' }]
        })
      } as Response);

      const result = await testOllamaConnection('http://localhost:11434');
      expect(result.success).toBe(true);
      expect(result.models).toEqual(['llama3.2:latest', 'mistral:latest']);
      expect(result.message).toContain('Found 2 model(s)');
    });

    it('falls back to backend proxy /api/ollama/test when direct fetch fails', async () => {
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('CORS error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            message: 'Connected to Ollama via proxy',
            models: ['llama3.2:latest']
          })
        } as Response);

      const result = await testOllamaConnection('http://localhost:11434');
      expect(result.success).toBe(true);
      expect(result.models).toEqual(['llama3.2:latest']);
    });
  });

  describe('fetchOllamaRunningModels', () => {
    it('fetches running models via direct fetch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'llama3.2:latest',
              model: 'llama3.2:latest',
              size_vram: 2048000000,
              expires_at: '2026-08-30T05:00:00.000Z'
            }
          ]
        })
      } as Response);

      const result = await fetchOllamaRunningModels('http://localhost:11434');
      expect(result.success).toBe(true);
      expect(result.models).toHaveLength(1);
      expect(result.models[0].name).toBe('llama3.2:latest');
      expect(result.models[0].expires_at).toBe('2026-08-30T05:00:00.000Z');
    });

    it('falls back to proxy when direct fetch fails', async () => {
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Direct fetch failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            models: [{ name: 'mistral:latest', expires_at: '2026-08-30T05:10:00.000Z' }]
          })
        } as Response);

      const result = await fetchOllamaRunningModels('http://localhost:11434');
      expect(result.success).toBe(true);
      expect(result.models).toHaveLength(1);
      expect(result.models[0].name).toBe('mistral:latest');
    });

    it('returns empty models array on error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await fetchOllamaRunningModels('http://localhost:11434');
      expect(result.success).toBe(false);
      expect(result.models).toEqual([]);
    });
  });

  describe('unloadOllamaModel', () => {
    it('unloads model via direct fetch', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
      const result = await unloadOllamaModel('llama3.2:latest', 'http://localhost:11434');
      expect(result.success).toBe(true);
      expect(result.message).toContain('unloaded');
    });

    it('falls back to proxy when direct fetch fails', async () => {
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Direct fail'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, message: 'Unloaded via proxy' })
        } as Response);

      const result = await unloadOllamaModel('llama3.2:latest', 'http://localhost:11434');
      expect(result.success).toBe(true);
    });
  });

  describe('formatShutdownCountdown', () => {
    const fixedNow = new Date('2026-08-30T04:30:00.000Z').getTime();

    it('formats remaining minutes and seconds accurately', () => {
      // 4 minutes 30 seconds ahead
      const targetTime = new Date('2026-08-30T04:34:30.000Z').toISOString();
      const result = formatShutdownCountdown(targetTime, fixedNow);
      expect(result.isExpired).toBe(false);
      expect(result.isIndefinite).toBe(false);
      expect(result.countdownText).toBe('4m 30s');
      expect(result.remainingSeconds).toBe(270);
    });

    it('formats remaining seconds when less than a minute', () => {
      const targetTime = new Date('2026-08-30T04:30:45.000Z').toISOString();
      const result = formatShutdownCountdown(targetTime, fixedNow);
      expect(result.isExpired).toBe(false);
      expect(result.countdownText).toBe('45s');
      expect(result.remainingSeconds).toBe(45);
    });

    it('formats hours and minutes when more than an hour', () => {
      const targetTime = new Date('2026-08-30T05:45:00.000Z').toISOString();
      const result = formatShutdownCountdown(targetTime, fixedNow);
      expect(result.isExpired).toBe(false);
      expect(result.countdownText).toBe('1h 15m');
      expect(result.remainingSeconds).toBe(4500);
    });

    it('identifies expired shutdown times', () => {
      const pastTime = new Date('2026-08-30T04:29:00.000Z').toISOString();
      const result = formatShutdownCountdown(pastTime, fixedNow);
      expect(result.isExpired).toBe(true);
      expect(result.countdownText).toBe('Expired / Unloading now');
      expect(result.remainingSeconds).toBe(0);
    });

    it('handles indefinite keep_alive (year < 1970 or missing)', () => {
      const zeroTime = '0001-01-01T00:00:00Z';
      const result = formatShutdownCountdown(zeroTime, fixedNow);
      expect(result.isIndefinite).toBe(true);
      expect(result.countdownText).toContain('Indefinite');

      const undefinedResult = formatShutdownCountdown(undefined, fixedNow);
      expect(undefinedResult.isIndefinite).toBe(true);
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

    it('passes crawl_web_page tool to streamText when web context is enabled', async () => {
      const mockStreamText = vi.mocked(aiModule.streamText);
      mockStreamText.mockReturnValue({
        fullStream: (async function* () {
          yield { type: 'text-delta', textDelta: 'Response with web context' };
        })()
      } as unknown as ReturnType<typeof aiModule.streamText>);

      const settings: Settings = {
        apiKey: 'test-api-key',
        provider: 'gemini',
        model: 'gemini-3.6-flash',
        isWebContextEnabled: true
      };

      const messages: Message[] = [{ id: '1', role: 'user', content: 'read https://example.com', timestamp: new Date().toISOString() }];
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
      expect(options.tools?.crawl_web_page).toBeDefined();
      expect(options.stopWhen).toBeDefined();
      expect(callbacks.onChunk).toHaveBeenCalledWith('Response with web context');
      expect(callbacks.onDone).toHaveBeenCalledWith('Response with web context');
    });

    it('successfully initiates stream for Ollama without requiring an API key', async () => {
      const mockStreamText = vi.mocked(aiModule.streamText);
      mockStreamText.mockReturnValue({
        fullStream: (async function* () {
          yield { type: 'text-delta', textDelta: 'Local Ollama Response' };
        })()
      } as unknown as ReturnType<typeof aiModule.streamText>);

      const settings: Settings = {
        apiKey: '',
        provider: 'ollama',
        model: 'llama3.2',
        localUrl: 'http://localhost:11434'
      };

      const messages: Message[] = [{ id: '1', role: 'user', content: 'Hello local llama', timestamp: new Date().toISOString() }];
      const callbacks = {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn()
      };
      const controller = new AbortController();

      await streamChatCompletion(settings, messages, 'You are a local assistant', callbacks, controller.signal);

      expect(mockStreamText).toHaveBeenCalled();
      expect(callbacks.onError).not.toHaveBeenCalled();
      expect(callbacks.onChunk).toHaveBeenCalledWith('Local Ollama Response');
      expect(callbacks.onDone).toHaveBeenCalledWith('Local Ollama Response');
    });
  });
});
