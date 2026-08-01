import { describe, it, expect } from 'vitest';
import { chunkText, computeKeywordScore } from '../vectorDb';

describe('src/utils/vectorDb.ts', () => {
  describe('chunkText', () => {
    it('should return empty array for empty input string', () => {
      expect(chunkText('')).toEqual([]);
      expect(chunkText('   ')).toEqual([]);
    });

    it('should return single chunk if text is smaller than maxChunkLength', () => {
      const text = 'This is a short paragraph for testing vector database text chunking.';
      const chunks = chunkText(text, 600);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('should split multiple paragraphs into separate chunks when exceeding limit', () => {
      const para1 = 'A'.repeat(400);
      const para2 = 'B'.repeat(400);
      const fullText = `${para1}\n\n${para2}`;
      const chunks = chunkText(fullText, 500);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe(para1);
      expect(chunks[1]).toBe(para2);
    });

    it('should break down oversized paragraph by sentence bounds', () => {
      const sentence1 = 'First sentence of the long paragraph. ';
      const sentence2 = 'Second sentence of the long paragraph. ';
      const sentence3 = 'Third sentence of the long paragraph. ';
      const fullText = sentence1 + sentence2 + sentence3;
      
      const chunks = chunkText(fullText, 45);
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(55);
      });
    });
  });

  describe('computeKeywordScore', () => {
    it('should return 0 for empty or whitespace query', () => {
      expect(computeKeywordScore('', 'Some text')).toBe(0);
      expect(computeKeywordScore('   ', 'Some text')).toBe(0);
    });

    it('should score matches based on query terms', () => {
      const scoreHigh = computeKeywordScore('vector search', 'vector search algorithm performance');
      const scoreLow = computeKeywordScore('vector search', 'completely unrelated topic');
      expect(scoreHigh).toBeGreaterThan(0);
      expect(scoreLow).toBe(0);
    });
  });

  describe('importDatabaseJSON validation', () => {
    it('should throw error for null or missing arrays', async () => {
      const { vectorDb } = await import('../vectorDb');
      await expect(vectorDb.importDatabaseJSON(null as unknown as Parameters<typeof vectorDb.importDatabaseJSON>[0])).rejects.toThrow('Invalid database backup format');
      await expect(vectorDb.importDatabaseJSON({ documents: [] } as unknown as Parameters<typeof vectorDb.importDatabaseJSON>[0])).rejects.toThrow('Invalid database backup format');
    });
  });
});


