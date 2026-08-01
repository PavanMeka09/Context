import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAndSaveMemories } from '../memory';
import { Storage } from '../storage';
import * as apiModule from '../api';

describe('src/utils/memory.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('does nothing if isMemoryEnabled is false', async () => {
    const spy = vi.spyOn(apiModule, 'generateTextCompletion');
    const settings = { provider: 'gemini' as const, apiKey: 'test', model: 'test', isMemoryEnabled: false };
    await extractAndSaveMemories(settings, 'I prefer dark mode', 'Noted!');
    expect(spy).not.toHaveBeenCalled();
  });

  it('extracts and saves new memories when response is valid JSON', async () => {
    const mockJson = JSON.stringify({
      new_memories: [
        { content: 'User prefers dark mode', category: 'preference' }
      ],
      deleted_memory_ids: []
    });

    vi.spyOn(apiModule, 'generateTextCompletion').mockResolvedValue(`\`\`\`json\n${mockJson}\n\`\`\``);

    const settings = { provider: 'gemini' as const, apiKey: 'test', model: 'test', isMemoryEnabled: true };
    await extractAndSaveMemories(settings, 'I prefer dark mode UI', 'Sure!');

    const memories = Storage.getMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('User prefers dark mode');
    expect(memories[0].category).toBe('preference');
  });

  it('removes deleted memories based on deleted_memory_ids', async () => {
    const initialMem = { id: 'mem-1', content: 'User likes JavaScript', category: 'preference' as const, createdAt: new Date().toISOString() };
    Storage.saveMemories([initialMem]);

    const mockJson = JSON.stringify({
      new_memories: [
        { content: 'User prefers TypeScript over JavaScript', category: 'preference' }
      ],
      deleted_memory_ids: ['mem-1']
    });

    vi.spyOn(apiModule, 'generateTextCompletion').mockResolvedValue(mockJson);

    const settings = { provider: 'gemini' as const, apiKey: 'test', model: 'test', isMemoryEnabled: true };
    await extractAndSaveMemories(settings, 'I stopped using JS, I now use TS', 'Awesome switch!');

    const memories = Storage.getMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('User prefers TypeScript over JavaScript');
    expect(memories.find(m => m.id === 'mem-1')).toBeUndefined();
  });
});
