import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-expect-error CommonJS module import in TypeScript test file
import { searchAndFormat, testConnection, classifyQuery } from '../webSearchEngine.cjs';

describe('server/webSearchEngine.cjs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('classifyQuery (heuristic intent classification)', () => {
    it('should bypass search for basic greetings', () => {
      expect(classifyQuery('hello').shouldSearch).toBe(false);
      expect(classifyQuery('good morning!').shouldSearch).toBe(false);
      expect(classifyQuery('thanks a lot').shouldSearch).toBe(false);
    });

    it('should bypass search for AI self-identity questions', () => {
      expect(classifyQuery('who are you?').shouldSearch).toBe(false);
      expect(classifyQuery('what can you do?').shouldSearch).toBe(false);
    });

    it('should bypass search for static programming/math commands', () => {
      expect(classifyQuery('write a function to sort an array').shouldSearch).toBe(false);
      expect(classifyQuery('what is 2 + 2').shouldSearch).toBe(false);
    });

    it('should trigger search for factual queries', () => {
      const res = classifyQuery('latest news on space exploration');
      expect(res.shouldSearch).toBe(true);
      expect(res.searchQuery).toBe('latest news on space exploration');
    });
  });

  describe('searchAndFormat (module interface)', () => {
    it('should return bypassed status when intent classification decides search is unnecessary', async () => {
      const result = await searchAndFormat('hello there');
      expect(result.shouldSearch).toBe(false);
      expect(result.source).toBe('bypassed');
      expect(result.contextText).toBe('');
      expect(result.results).toEqual([]);
    });

    it('should force search when forceSearch option is enabled', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.includes('searxng') || urlStr.includes(':8082')) {
          return {
            ok: true,
            json: async () => ({
              results: [
                { title: 'Hello World Page', url: 'https://example.com/hello', content: 'Greeting content snippet.' }
              ]
            })
          } as unknown as Response;
        }
        return { ok: false } as unknown as Response;
      });

      const result = await searchAndFormat('hello', { forceSearch: true });
      expect(result.shouldSearch).toBe(true);
      expect(result.source).toBe('searxng');
      expect(result.results.length).toBe(1);
      expect(result.results[0].title).toBe('Hello World Page');
      expect(result.contextText).toContain('[REAL-TIME WEB SEARCH CONTEXT]');
    });

    it('should cascade to Wikipedia fallback if SearXNG throws or returns empty', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.includes('wikipedia')) {
          return {
            ok: true,
            json: async () => ({
              query: {
                search: [
                  { title: 'Quantum Computing', snippet: 'Quantum computing is a rapidly expanding field.', pageid: 123 }
                ]
              }
            })
          } as unknown as Response;
        }
        // SearXNG fails
        return { ok: false, status: 500 } as unknown as Response;
      });

      const result = await searchAndFormat('quantum computing developments', { forceSearch: true });
      expect(result.shouldSearch).toBe(true);
      expect(result.source).toBe('wikipedia');
      expect(result.results.length).toBe(1);
      expect(result.results[0].title).toBe('Quantum Computing');
      expect(result.results[0].url).toContain('https://en.wikipedia.org/wiki/Quantum_Computing');
      expect(result.contextText).toContain('Quantum computing is a rapidly expanding field');
    });

    it('should return source="none" with clear error message if all providers fail', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network offline'));

      const result = await searchAndFormat('some obscure topic', { forceSearch: true });
      expect(result.shouldSearch).toBe(true);
      expect(result.source).toBe('none');
      expect(result.results).toEqual([]);
      expect(result.error).toContain('Web search returned no results');
    });
  });

  describe('testConnection', () => {
    it('should return success: true when SearXNG returns results', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          results: [{ title: 'Ping Test', url: 'https://example.com/ping', content: 'pong' }]
        })
      }) as unknown as Response);

      const conn = await testConnection();
      expect(conn.success).toBe(true);
      expect(conn.count).toBe(1);
      expect(conn.source).toBe('searxng');
    });

    it('should return success: false when SearXNG is unreachable even if fallback succeeds', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown) => {
        const urlStr = String(url);
        if (urlStr.includes('wikipedia.org')) {
          return {
            ok: true,
            json: async () => ({
              query: {
                search: [{ title: 'Ping (networking)', snippet: 'Ping network tool' }]
              }
            })
          } as unknown as Response;
        }
        return {
          ok: false,
          status: 502
        } as unknown as Response;
      });

      const conn = await testConnection();
      expect(conn.success).toBe(false);
      expect(conn.source).toBe('wikipedia');
      expect(conn.error).toBeDefined();
    });
  });
});
