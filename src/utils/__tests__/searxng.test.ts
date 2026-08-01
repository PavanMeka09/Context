import { describe, it, expect } from 'vitest';
import { classifySearchHeuristically, formatSearxngResults, getFaviconUrl } from '../searxng';
import type { SearxngResult } from '../searxng';

describe('src/utils/searxng.ts', () => {
  describe('getFaviconUrl', () => {
    it('should generate valid Google favicon URLs for HTTP/HTTPS web addresses', () => {
      expect(getFaviconUrl('https://example.com/some/path')).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=32');
      expect(getFaviconUrl('http://news.ycombinator.com')).toBe('https://www.google.com/s2/favicons?domain=news.ycombinator.com&sz=32');
    });

    it('should return empty string for invalid URLs', () => {
      expect(getFaviconUrl('not-a-valid-url')).toBe('');
    });
  });

  describe('classifySearchHeuristically', () => {
    it('should bypass web search for simple greetings', () => {
      expect(classifySearchHeuristically('hello').shouldSearch).toBe(false);
      expect(classifySearchHeuristically('Good morning!').shouldSearch).toBe(false);
      expect(classifySearchHeuristically('Thank you very much').shouldSearch).toBe(false);
    });

    it('should bypass web search for AI identity questions', () => {
      expect(classifySearchHeuristically('who are you?').shouldSearch).toBe(false);
      expect(classifySearchHeuristically('what can you do').shouldSearch).toBe(false);
    });

    it('should bypass web search for code writing commands', () => {
      expect(classifySearchHeuristically('write a function to sort an array').shouldSearch).toBe(false);
      expect(classifySearchHeuristically('tell me a joke').shouldSearch).toBe(false);
    });

    it('should classify queries requiring external web info for search', () => {
      const res = classifySearchHeuristically('what is the latest stock price of Apple?');
      expect(res.shouldSearch).toBe(true);
      expect(res.searchQuery).toBe('what is the latest stock price of Apple');
    });
  });

  describe('formatSearxngResults', () => {
    it('should return fallback message if results array is empty', () => {
      expect(formatSearxngResults([])).toBe('No web search results found.');
    });

    it('should properly format search results into structured markdown text', () => {
      const results: SearxngResult[] = [
        { title: 'Test Title 1', url: 'https://example.com/1', content: 'Snippet 1 text' },
        { title: 'Test Title 2', url: 'https://example.com/2', content: 'Snippet 2 text' },
      ];

      const formatted = formatSearxngResults(results);
      expect(formatted).toContain('[Web Result #1]');
      expect(formatted).toContain('Title: Test Title 1');
      expect(formatted).toContain('URL: https://example.com/1');
      expect(formatted).toContain('[Web Result #2]');
    });
  });
});

