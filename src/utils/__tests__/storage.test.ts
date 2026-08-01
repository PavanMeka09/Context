import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Storage, reconstructActivePath, upgradeChatToTree } from '../storage';
import type { Chat, MessageNode, MemoryItem } from '../storage';

describe('src/utils/storage.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('reconstructActivePath', () => {
    it('returns empty array when tree or leafId is missing', () => {
      expect(reconstructActivePath(undefined, null)).toEqual([]);
      expect(reconstructActivePath({}, 'node-1')).toEqual([]);
    });

    it('reconstructs linear message path from leaf to root', () => {
      const tree: Record<string, MessageNode> = {
        'msg-1': { id: 'msg-1', role: 'user', content: 'Hello', timestamp: '1', parentId: null, children: ['msg-2'] },
        'msg-2': { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: '2', parentId: 'msg-1', children: [] }
      };

      const path = reconstructActivePath(tree, 'msg-2');
      expect(path).toHaveLength(2);
      expect(path[0].id).toBe('msg-1');
      expect(path[1].id).toBe('msg-2');
      expect(path[1].content).toBe('Hi there!');
    });

    it('prevents infinite loop on cycle in tree', () => {
      const tree: Record<string, MessageNode> = {
        'msg-1': { id: 'msg-1', role: 'user', content: 'Node 1', timestamp: '1', parentId: 'msg-2', children: ['msg-2'] },
        'msg-2': { id: 'msg-2', role: 'assistant', content: 'Node 2', timestamp: '2', parentId: 'msg-1', children: ['msg-1'] }
      };

      const path = reconstructActivePath(tree, 'msg-2');
      expect(path.length).toBeLessThanOrEqual(2);
    });
  });

  describe('upgradeChatToTree', () => {
    it('returns chat untouched if messageTree already exists', () => {
      const existingChat: Chat = {
        id: 'chat-1',
        title: 'Tree Chat',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        messages: [],
        messageTree: {
          'm1': { id: 'm1', role: 'user', content: 'hi', timestamp: '1', parentId: null, children: [] }
        },
        activeLeafId: 'm1'
      };

      expect(upgradeChatToTree(existingChat)).toEqual(existingChat);
    });

    it('converts linear chat messages into message tree', () => {
      const legacyChat: Chat = {
        id: 'chat-2',
        title: 'Legacy Chat',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        messages: [
          { id: 'm1', role: 'user', content: 'Hello', timestamp: '1' },
          { id: 'm2', role: 'assistant', content: 'World', timestamp: '2' }
        ]
      };

      const upgraded = upgradeChatToTree(legacyChat);
      expect(upgraded.messageTree).toBeDefined();
      expect(upgraded.messageTree!['m1'].parentId).toBeNull();
      expect(upgraded.messageTree!['m1'].children).toEqual(['m2']);
      expect(upgraded.messageTree!['m2'].parentId).toBe('m1');
      expect(upgraded.activeLeafId).toBe('m2');
    });
  });

  describe('Storage - Settings', () => {
    it('returns default settings if localStorage is empty', () => {
      const settings = Storage.getSettings();
      expect(settings).toBeDefined();
      expect(settings.provider).toBe('gemini');
      expect(settings.isMemoryEnabled).toBe(true);
    });

    it('saves and retrieves updated settings', () => {
      const updated = {
        provider: 'ollama' as const,
        apiKey: '',
        model: 'llama3:latest',
        localUrl: 'http://localhost:11434/v1',
        isRagEnabled: true,
        isWebSearchEnabled: false,
        searxngUrl: 'http://localhost:8082',
        thinkingLevel: 'medium' as const,
        isMemoryEnabled: true,
        isBrowserAgentEnabled: true
      };

      Storage.saveSettings(updated);
      const retrieved = Storage.getSettings();
      expect(retrieved.provider).toBe('ollama');
      expect(retrieved.model).toBe('llama3:latest');
      expect(retrieved.isRagEnabled).toBe(true);
    });
  });

  describe('Storage - Memories', () => {
    it('saves and retrieves memories', () => {
      expect(Storage.getMemories()).toEqual([]);

      const memories: MemoryItem[] = [
        { id: 'm1', content: 'User prefers TypeScript', category: 'preference', createdAt: '2026-01-01' }
      ];
      Storage.saveMemories(memories);
      expect(Storage.getMemories()).toHaveLength(1);
      expect(Storage.getMemories()[0].content).toBe('User prefers TypeScript');
    });
  });

  describe('Storage - System Prompts', () => {
    it('loads and manages custom prompts', () => {
      expect(Storage.getCustomPrompts()).toEqual([]);

      const customPrompt = { id: 'p1', name: 'Custom Code Reviewer', content: 'Be strict', isCustom: true };
      Storage.saveCustomPrompt(customPrompt);
      const updatedPrompts = Storage.getCustomPrompts();
      expect(updatedPrompts.find(p => p.id === 'p1')).toBeDefined();

      Storage.deleteCustomPrompt('p1');
      expect(Storage.getCustomPrompts().find(p => p.id === 'p1')).toBeUndefined();
    });
  });

  describe('Storage - Export and Import', () => {
    it('exports data to structured JSON string', async () => {
      Storage.saveMemories([{ id: 'm1', content: 'Test Memory', category: 'other', createdAt: '2026-01-01' }]);
      Storage.saveCustomPrompt({ id: 'p1', name: 'Prompt 1', content: 'Content', isCustom: true });

      const exportedJson = await Storage.exportData();
      expect(exportedJson).toContain('exportedAt');
      expect(exportedJson).toContain('Test Memory');
      expect(exportedJson).toContain('Prompt 1');
    });

    it('imports valid backup JSON successfully', async () => {
      const backupData = JSON.stringify({
        version: 1,
        settings: { provider: 'openrouter', apiKey: 'test-key', model: 'gpt-4o' },
        memories: [{ id: 'imported-m1', content: 'Imported Memory', category: 'preference', createdAt: '2026-01-01' }],
        customPrompts: [{ id: 'imported-p1', name: 'Imported Prompt', content: 'Test', isCustom: true }]
      });

      const result = await Storage.importData(backupData);
      expect(result.success).toBe(true);

      const settings = Storage.getSettings();
      expect(settings.provider).toBe('openrouter');
      expect(settings.apiKey).toBe('test-key');

      const memories = Storage.getMemories();
      expect(memories.some(m => m.id === 'imported-m1')).toBe(true);
    });

    it('returns error on invalid JSON import', async () => {
      const result = await Storage.importData('invalid json {{{');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
