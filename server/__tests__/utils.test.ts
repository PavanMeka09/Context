import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { safeJsonParse, readJSON, writeJSON } from '../utils.cjs';

describe('server/utils.cjs', () => {
  describe('safeJsonParse', () => {
    it('should parse standard clean JSON strings', () => {
      const input = '{"name": "test", "value": 123}';
      const result = safeJsonParse(input);
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should parse JSON wrapped in markdown code blocks', () => {
      const input = '```json\n{"action": "navigate", "url": "https://example.com"}\n```';
      const result = safeJsonParse(input);
      expect(result).toEqual({ action: 'navigate', url: 'https://example.com' });
    });

    it('should extract JSON when surrounded by conversational text', () => {
      const input = 'Here is the response:\n{"result": "success", "count": 5}\nHope that helps!';
      const result = safeJsonParse(input);
      expect(result).toEqual({ result: 'success', count: 5 });
    });

    it('should throw an error on completely invalid or empty text', () => {
      expect(() => safeJsonParse('')).toThrow('Empty response');
      expect(() => safeJsonParse('    ')).toThrow('Empty response');
    });
  });

  describe('readJSON and writeJSON', () => {
    const testFile = path.join(os.tmpdir(), `test-db-${Date.now()}.json`);

    afterEach(() => {
      if (fs.existsSync(testFile)) {
        try { fs.unlinkSync(testFile); } catch { /* ignore */ }
      }
      if (fs.existsSync(testFile + '.tmp')) {
        try { fs.unlinkSync(testFile + '.tmp'); } catch { /* ignore */ }
      }
    });

    it('should return default value if file does not exist', () => {
      const data = readJSON(testFile, [{ default: true }]);
      expect(data).toEqual([{ default: true }]);
    });

    it('should atomically write and read JSON data', () => {
      const mockData = { items: [1, 2, 3], status: 'ok' };
      writeJSON(testFile, mockData);
      const readBack = readJSON(testFile, null);
      expect(readBack).toEqual(mockData);
    });
  });
});
