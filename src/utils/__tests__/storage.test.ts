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
      expect(settings.profiles).toHaveLength(1);
      expect(settings.profiles![0].name).toBe('Default Profile');
      expect(settings.activeProfileId).toBe('profile-default');
    });

    it('saves and retrieves updated settings', () => {
      const updated = {
        provider: 'gemini' as const,
        apiKey: 'test-api-key',
        model: 'gemini-2.5-flash',
        isWebSearchEnabled: false,
        searxngUrl: 'http://localhost:8082',
        thinkingLevel: 'medium' as const,
        isMemoryEnabled: true,
        isBrowserAgentEnabled: true,
        isWebContextEnabled: true
      };

      Storage.saveSettings(updated);
      const retrieved = Storage.getSettings();
      expect(retrieved.provider).toBe('gemini');
      expect(retrieved.model).toBe('gemini-2.5-flash');
      expect(retrieved.isWebContextEnabled).toBe(true);
    });
    it('auto-migrates legacy settings into a default ProviderProfile', () => {
      localStorage.setItem(
        'context_settings',
        JSON.stringify({ provider: 'gemini', apiKey: 'legacy-key', model: 'gemini-2.5-flash' })
      );
      const settings = Storage.getSettings();
      expect(settings.profiles).toBeDefined();
      expect(settings.profiles).toHaveLength(1);
      expect(settings.profiles![0].name).toBe('Default Profile');
      expect(settings.profiles![0].apiKey).toBe('legacy-key');
      expect(settings.activeProfileId).toBe(settings.profiles![0].id);
    });

    it('switches active profiles and syncs active profile credentials', () => {
      const initialSettings = {
        provider: 'gemini' as const,
        apiKey: 'key-1',
        model: 'gemini-3.6-flash',
        profiles: [
          { id: 'p1', name: 'Personal', provider: 'gemini' as const, apiKey: 'key-1', model: 'gemini-3.6-flash' },
          { id: 'p2', name: 'Work', provider: 'gemini' as const, apiKey: 'key-2', model: 'gemini-2.5-pro' }
        ],
        activeProfileId: 'p2'
      };
      Storage.saveSettings(initialSettings);
      const retrieved = Storage.getSettings();
      expect(retrieved.activeProfileId).toBe('p2');
      expect(retrieved.apiKey).toBe('key-2');
      expect(retrieved.model).toBe('gemini-2.5-pro');
    });

    it('switches profile using Storage.switchProfile method', () => {
      const settings = {
        provider: 'gemini' as const,
        apiKey: 'key-1',
        model: 'gemini-3.6-flash',
        profiles: [
          { id: 'p1', name: 'Personal', provider: 'gemini' as const, apiKey: 'key-1', model: 'gemini-3.6-flash' },
          { id: 'p2', name: 'Work', provider: 'anthropic' as const, apiKey: 'key-2', model: 'claude-3-7-sonnet-20250219' }
        ],
        activeProfileId: 'p1'
      };
      const switched = Storage.switchProfile(settings, 'p2');
      expect(switched.activeProfileId).toBe('p2');
      expect(switched.provider).toBe('anthropic');
      expect(switched.apiKey).toBe('key-2');
      expect(switched.model).toBe('claude-3-7-sonnet-20250219');
    });
    it('preserves unique provider per profile when switching profiles', () => {
      const settingsWithProviders = {
        provider: 'anthropic' as const,
        apiKey: 'sk-ant-123',
        model: 'claude-3-7-sonnet-20250219',
        profiles: [
          { id: 'p1', name: 'Gemini Profile', provider: 'gemini' as const, apiKey: 'g-key', model: 'gemini-3.6-flash' },
          { id: 'p2', name: 'Claude Profile', provider: 'anthropic' as const, apiKey: 'sk-ant-123', model: 'claude-3-7-sonnet-20250219' },
          { id: 'p3', name: 'OpenAI Profile', provider: 'openai' as const, apiKey: 'sk-openai-456', model: 'gpt-4o' }
        ],
        activeProfileId: 'p2'
      };
      Storage.saveSettings(settingsWithProviders);
      let retrieved = Storage.getSettings();
      expect(retrieved.activeProfileId).toBe('p2');
      expect(retrieved.provider).toBe('anthropic');
      expect(retrieved.apiKey).toBe('sk-ant-123');
      expect(retrieved.model).toBe('claude-3-7-sonnet-20250219');

      retrieved.activeProfileId = 'p3';
      Storage.saveSettings(retrieved);
      retrieved = Storage.getSettings();
      expect(retrieved.activeProfileId).toBe('p3');
      expect(retrieved.provider).toBe('openai');
      expect(retrieved.apiKey).toBe('sk-openai-456');
      expect(retrieved.model).toBe('gpt-4o');
    });
    it('saves updated model per profile independently when model is updated', () => {
      const initial = {
        provider: 'gemini' as const,
        apiKey: 'key-1',
        model: 'gemini-3.6-flash',
        profiles: [
          { id: 'p1', name: 'Profile 1', provider: 'gemini' as const, apiKey: 'key-1', model: 'gemini-3.6-flash' },
          { id: 'p2', name: 'Profile 2', provider: 'openai' as const, apiKey: 'key-2', model: 'gpt-4o' }
        ],
        activeProfileId: 'p1'
      };
      Storage.saveSettings(initial);

      let s = Storage.getSettings();
      const p1 = s.profiles?.find(p => p.id === 'p1');
      if (p1) p1.model = 'gemini-2.5-pro';
      s.model = 'gemini-2.5-pro';
      Storage.saveSettings(s);

      s = Storage.getSettings();
      expect(s.model).toBe('gemini-2.5-pro');
      expect(s.profiles?.find(p => p.id === 'p1')?.model).toBe('gemini-2.5-pro');
      expect(s.profiles?.find(p => p.id === 'p2')?.model).toBe('gpt-4o');

      s.activeProfileId = 'p2';
      const p2 = s.profiles?.find(p => p.id === 'p2');
      if (p2) p2.model = 'gpt-4o-mini';
      s.model = 'gpt-4o-mini';
      Storage.saveSettings(s);

      s = Storage.getSettings();
      expect(s.activeProfileId).toBe('p2');
      expect(s.model).toBe('gpt-4o-mini');
      expect(s.profiles?.find(p => p.id === 'p2')?.model).toBe('gpt-4o-mini');

      s.activeProfileId = 'p1';
      Storage.saveSettings(s);
      s = Storage.getSettings();
      expect(s.activeProfileId).toBe('p1');
      expect(s.model).toBe('gemini-2.5-pro');
    });

    it('ensures at least one profile remains when saving empty profiles', () => {
      const invalidSettings = {
        provider: 'gemini' as const,
        apiKey: 'test-key',
        model: 'gemini-3.6-flash',
        profiles: [],
        activeProfileId: ''
      };
      Storage.saveSettings(invalidSettings);
      const retrieved = Storage.getSettings();
      expect(retrieved.profiles).toHaveLength(1);
      expect(retrieved.profiles![0].name).toBe('Default Profile');
    });

    it('correctly handles Ollama provider profiles with localUrl', () => {
      const ollamaSettings = {
        provider: 'ollama' as const,
        apiKey: '',
        model: 'llama3.2',
        localUrl: 'http://127.0.0.1:11434',
        profiles: [
          { id: 'p-ollama', name: 'Local Ollama', provider: 'ollama' as const, apiKey: '', model: 'llama3.2', localUrl: 'http://127.0.0.1:11434' },
          { id: 'p-cloud', name: 'Google Cloud', provider: 'gemini' as const, apiKey: 'g-key', model: 'gemini-3.6-flash' }
        ],
        activeProfileId: 'p-ollama'
      };
      Storage.saveSettings(ollamaSettings);
      const retrieved = Storage.getSettings();
      expect(retrieved.provider).toBe('ollama');
      expect(retrieved.model).toBe('llama3.2');
      expect(retrieved.localUrl).toBe('http://127.0.0.1:11434');

      const switched = Storage.switchProfile(retrieved, 'p-cloud');
      expect(switched.provider).toBe('gemini');
      expect(switched.apiKey).toBe('g-key');

      const switchedBack = Storage.switchProfile(switched, 'p-ollama');
      expect(switchedBack.provider).toBe('ollama');
      expect(switchedBack.localUrl).toBe('http://127.0.0.1:11434');
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
        settings: { provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.5-flash' },
        memories: [{ id: 'imported-m1', content: 'Imported Memory', category: 'preference', createdAt: '2026-01-01' }],
        customPrompts: [{ id: 'imported-p1', name: 'Imported Prompt', content: 'Test', isCustom: true }]
      });

      const result = await Storage.importData(backupData);
      expect(result.success).toBe(true);

      const settings = Storage.getSettings();
      expect(settings.provider).toBe('gemini');
      expect(settings.apiKey).toBe('test-key');

      const memories = Storage.getMemories();
      expect(memories.some(m => m.id === 'imported-m1')).toBe(true);
    });
    it('retains provider profiles structure during export and import', async () => {
      Storage.saveSettings({
        provider: 'gemini',
        apiKey: 'work-key',
        model: 'gemini-2.5-pro',
        profiles: [
          { id: 'prof-1', name: 'Personal', provider: 'gemini', apiKey: 'personal-key', model: 'gemini-3.6-flash' },
          { id: 'prof-2', name: 'Work', provider: 'gemini', apiKey: 'work-key', model: 'gemini-2.5-pro' }
        ],
        activeProfileId: 'prof-2'
      });

      const exportedJson = await Storage.exportData();
      expect(exportedJson).toContain('prof-1');
      expect(exportedJson).toContain('Work');

      localStorage.clear();

      const importResult = await Storage.importData(exportedJson);
      expect(importResult.success).toBe(true);

      const importedSettings = Storage.getSettings();
      expect(importedSettings.profiles).toHaveLength(2);
      expect(importedSettings.activeProfileId).toBe('prof-2');
      expect(importedSettings.apiKey).toBe('work-key');
    });

    it('returns error on invalid JSON import', async () => {
      const result = await Storage.importData('invalid json {{{');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
