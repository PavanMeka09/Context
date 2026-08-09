export interface Attachment {
  id: string;
  name: string;
  type: string;
  data: string;
  size: number;
}

export interface BrowserSessionData {
  url: string;
  title: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  steps: {
    id: string;
    thought?: string;
    action: string;
    targetId?: string;
    text?: string;
    url?: string;
    status: 'pending' | 'success' | 'error';
    logMessage?: string;
    timestamp: string;
  }[];
  screenshotTimestamp: number;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
}

export interface SearchExecutionResult {
  shouldSearch: boolean;
  query: string;
  contextText: string;
  results: SearchResultItem[];
  source: 'searxng' | 'wikipedia' | 'bypassed' | 'none';
  error?: string;
}

export interface MessageMetadata {
  search?: SearchExecutionResult;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  browserSession?: BrowserSessionData;
  metadata?: MessageMetadata;
}

export interface MessageNode {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  parentId: string | null;
  children: string[];
  attachments?: Attachment[];
  browserSession?: BrowserSessionData;
  metadata?: MessageMetadata;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  messageTree?: Record<string, MessageNode>;
  activeLeafId?: string | null;
}

export interface MemoryItem {
  id: string;
  content: string;
  category: 'preference' | 'project' | 'conversation' | 'other';
  createdAt: string;
}

export interface TaskSchedule {
  id: string;
  title: string;
  prompt: string;
  targetChatId: string; // 'new' or specific chat ID
  scheduleType: 'cron' | 'interval' | 'once';
  cronExpression?: string;
  intervalMinutes?: number;
  dateTime?: string;
  isActive: boolean;
  agentMode: 'standard' | 'browser';
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

export interface Settings {
  provider: 'gemini';
  apiKey: string;
  model: string;
  localUrl?: string;
  isWebSearchEnabled?: boolean;
  searxngUrl?: string;
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
  isMemoryEnabled?: boolean;
  isBrowserAgentEnabled?: boolean;
}


export interface SystemPrompt {
  id: string;
  name: string;
  content: string;
  isCustom?: boolean;
}

// Preset System Prompts
export const PRESET_PROMPTS: SystemPrompt[] = [
  {
    id: 'preset-general',
    name: 'General Assistant',
    content: 'You are a helpful, friendly, and knowledgeable assistant.',
    isCustom: false
  },
  {
    id: 'preset-engineer',
    name: 'Software Engineer',
    content: 'You are a senior software engineer. Write clean, well-commented, modular, and optimized code following best practices.',
    isCustom: false
  },
  {
    id: 'preset-reviewer',
    name: 'Code Reviewer',
    content: 'You are a senior software engineer reviewing code. Focus on readability, performance, potential bugs, security, and edge cases. Offer constructive criticism.',
    isCustom: false
  },
  {
    id: 'preset-writer',
    name: 'Technical Writer',
    content: 'You are an expert technical writer. Explain complex technical concepts simply, create structured, clear documentation, and use formatting effectively.',
    isCustom: false
  },
  {
    id: 'preset-pm',
    name: 'Product Manager',
    content: 'You are a principal product manager. Write crisp Product Requirements Documents (PRDs), structure feature specs, and organize tasks systematically.',
    isCustom: false
  }
];

// Fallback dynamic lists for offline/missing key scenarios
export const FALLBACK_GEMINI_MODELS = [
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (Default)' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' }
];


// Keys
const KEYS = {
  SETTINGS: 'context_settings',
  CHATS: 'context_chats',
  PROMPTS: 'context_custom_prompts',
  ACTIVE_CHAT: 'context_active_chat_id',
  ACTIVE_PROMPT: 'context_active_prompt_id',
  SIDEBAR_COLLAPSED: 'context_sidebar_collapsed',
  FONT_SIZE: 'context_font_size',
  THEME: 'context_theme',
  MEMORIES: 'context_memories',
  SCHEDULES: 'context_schedules'
};

// Debounce helper
export function debounce<A extends unknown[], R>(func: (...args: A) => R, wait: number): (...args: A) => void {
  let timeout: number | undefined;
  return function executedFunction(...args: A) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait) as unknown as number;
  };
}

const CHAT_DB_NAME = 'context_chats_db';
const CHAT_DB_VERSION = 1;

function getChatDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }
    const request = indexedDB.open(CHAT_DB_NAME, CHAT_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('chats')) {
        db.createObjectStore('chats', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}


// Helper: Reconstruct linear path from tree and active leaf
export function reconstructActivePath(
  tree: Record<string, MessageNode> | undefined,
  leafId: string | null | undefined
): Message[] {
  if (!tree || !leafId) return [];
  const path: Message[] = [];
  let currentId: string | null = leafId;
  const visited = new Set<string>(); // Prevent cycles
  
  while (currentId && tree[currentId]) {
    if (visited.has(currentId)) {
      console.error('Cycle detected in message tree path reconstruction at ID:', currentId);
      break;
    }
    visited.add(currentId);
    
    const node: MessageNode = tree[currentId];
    path.push({
      id: node.id,
      role: node.role,
      content: node.content,
      timestamp: node.timestamp,
      attachments: node.attachments,
      browserSession: node.browserSession
    });
    currentId = node.parentId;
  }
  
  return path.reverse();
}

// Helper: Upgrade legacy linear chat to tree-based chat
export function upgradeChatToTree(chat: Chat): Chat {
  if (chat.messageTree && chat.activeLeafId !== undefined) {
    return chat;
  }

  const tree: Record<string, MessageNode> = {};
  const messages = chat.messages || [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const parentId = i > 0 ? messages[i - 1].id : null;
    const nextMsgId = i < messages.length - 1 ? messages[i + 1].id : null;
    
    tree[msg.id] = {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      parentId: parentId,
      children: nextMsgId ? [nextMsgId] : [],
      attachments: msg.attachments,
      browserSession: msg.browserSession
    };
  }

  const activeLeafId = messages.length > 0 ? messages[messages.length - 1].id : null;

  return {
    ...chat,
    messageTree: tree,
    activeLeafId: activeLeafId
  };
}

// Storage Helpers
export const Storage = {
  getSettings(): Settings {
    try {
      const data = localStorage.getItem(KEYS.SETTINGS);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed) {
          parsed.provider = 'gemini';
          if (!parsed.model || !parsed.model.includes('gemini')) {
            parsed.model = 'gemini-3.6-flash';
          }
        }
        if (parsed && parsed.searxngUrl === undefined) {
          parsed.searxngUrl = '';
        }
        if (parsed && parsed.thinkingLevel === undefined) {
          parsed.thinkingLevel = 'off';
        }
        if (parsed && parsed.isMemoryEnabled === undefined) {
          parsed.isMemoryEnabled = true;
        }
        if (parsed && parsed.isBrowserAgentEnabled === undefined) {
          parsed.isBrowserAgentEnabled = false;
        }
        return parsed;
      }
    } catch (e) {
      console.error('Error reading settings from localStorage', e);
    }
    return {
      provider: 'gemini',
      apiKey: '',
      model: 'gemini-3.6-flash',
      isWebSearchEnabled: false,
      searxngUrl: '',
      thinkingLevel: 'off',
      isMemoryEnabled: true,
      isBrowserAgentEnabled: false
    };
  },

  saveSettings(settings: Settings): void {
    try {
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving settings to localStorage', e);
    }
  },

  getMemories(): MemoryItem[] {
    try {
      const data = localStorage.getItem(KEYS.MEMORIES);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading memories from localStorage', e);
    }
    return [];
  },

  saveMemories(memories: MemoryItem[]): void {
    try {
      localStorage.setItem(KEYS.MEMORIES, JSON.stringify(memories));
    } catch (e) {
      console.error('Error saving memories to localStorage', e);
    }
  },

  getSchedules(): TaskSchedule[] {
    try {
      const data = localStorage.getItem(KEYS.SCHEDULES);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading schedules from localStorage', e);
    }
    return [];
  },

  saveSchedules(schedules: TaskSchedule[]): void {
    try {
      localStorage.setItem(KEYS.SCHEDULES, JSON.stringify(schedules));
    } catch (e) {
      console.error('Error saving schedules to localStorage', e);
    }
  },

  async getChats(): Promise<Chat[]> {
    if (typeof indexedDB === 'undefined') {
      try {
        const raw = localStorage.getItem(KEYS.CHATS);
        const legacyChats = raw ? JSON.parse(raw) : [];
        return Array.isArray(legacyChats) ? legacyChats.map(c => upgradeChatToTree(c)) : [];
      } catch {
        return [];
      }
    }

    try {
      const db = await getChatDb();
      
      const dbChats = await new Promise<Chat[]>((resolve, reject) => {
        const tx = db.transaction('chats', 'readonly');
        const store = tx.objectStore('chats');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });

      if (dbChats.length > 0) {
        return dbChats.map(c => upgradeChatToTree(c));
      }

      // Fallback & automatic migration from localStorage
      const legacyData = localStorage.getItem(KEYS.CHATS);
      if (legacyData) {
        const legacyChats = JSON.parse(legacyData);
        if (Array.isArray(legacyChats) && legacyChats.length > 0) {
          console.log('[Storage] Migrating legacy localStorage chats to IndexedDB...');
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('chats', 'readwrite');
            const store = tx.objectStore('chats');
            for (const chat of legacyChats) {
              store.put(chat);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          localStorage.removeItem(KEYS.CHATS);
          return legacyChats.map(c => upgradeChatToTree(c));
        }
      }
    } catch (e) {
      console.error('Error reading chats from IndexedDB / migrating from localStorage', e);
    }
    return [];
  },

  saveChats: debounce(async (chats: Chat[]): Promise<void> => {
    await Storage.saveChatsImmediately(chats);
  }, 300),

  async saveChat(chat: Chat): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      try {
        const raw = localStorage.getItem(KEYS.CHATS);
        const chats: Chat[] = raw ? JSON.parse(raw) : [];
        const idx = chats.findIndex(c => c.id === chat.id);
        if (idx >= 0) chats[idx] = chat;
        else chats.push(chat);
        localStorage.setItem(KEYS.CHATS, JSON.stringify(chats));
      } catch (e) {
        console.error('Error saving chat to localStorage', e);
      }
      return;
    }

    try {
      const db = await getChatDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('chats', 'readwrite');
        const store = tx.objectStore('chats');
        store.put(chat);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('Error saving single chat to IndexedDB', e);
    }
  },

  async deleteChat(chatId: string): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      try {
        const raw = localStorage.getItem(KEYS.CHATS);
        const chats: Chat[] = raw ? JSON.parse(raw) : [];
        const filtered = chats.filter(c => c.id !== chatId);
        localStorage.setItem(KEYS.CHATS, JSON.stringify(filtered));
      } catch (e) {
        console.error('Error deleting chat from localStorage', e);
      }
      return;
    }

    try {
      const db = await getChatDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('chats', 'readwrite');
        const store = tx.objectStore('chats');
        store.delete(chatId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('Error deleting chat from IndexedDB', e);
    }
  },

  async saveChatsImmediately(chats: Chat[]): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      try {
        localStorage.setItem(KEYS.CHATS, JSON.stringify(chats));
      } catch (e) {
        console.error('Error saving chats to localStorage', e);
      }
      return;
    }

    try {
      const db = await getChatDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('chats', 'readwrite');
        const store = tx.objectStore('chats');
        
        store.clear();
        for (const chat of chats) {
          store.put(chat);
        }
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('Error saving chats to IndexedDB', e);
    }
  },

  getCustomPrompts(): SystemPrompt[] {
    try {
      const data = localStorage.getItem(KEYS.PROMPTS);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading prompts from localStorage', e);
    }
    return [];
  },

  saveCustomPrompts(prompts: SystemPrompt[]): void {
    try {
      localStorage.setItem(KEYS.PROMPTS, JSON.stringify(prompts));
    } catch (e) {
      console.error('Error saving prompts to localStorage', e);
    }
  },

  saveCustomPrompt(prompt: SystemPrompt): void {
    const existing = Storage.getCustomPrompts();
    const idx = existing.findIndex(p => p.id === prompt.id);
    if (idx >= 0) {
      existing[idx] = prompt;
    } else {
      existing.push(prompt);
    }
    Storage.saveCustomPrompts(existing);
  },

  deleteCustomPrompt(id: string): void {
    const existing = Storage.getCustomPrompts();
    const filtered = existing.filter(p => p.id !== id);
    Storage.saveCustomPrompts(filtered);
  },

  getActiveChatId(): string | null {
    return localStorage.getItem(KEYS.ACTIVE_CHAT);
  },

  saveActiveChatId(id: string | null): void {
    if (id) {
      localStorage.setItem(KEYS.ACTIVE_CHAT, id);
    } else {
      localStorage.removeItem(KEYS.ACTIVE_CHAT);
    }
  },

  getActivePromptId(): string {
    return localStorage.getItem(KEYS.ACTIVE_PROMPT) || 'preset-general';
  },

  saveActivePromptId(id: string): void {
    localStorage.setItem(KEYS.ACTIVE_PROMPT, id);
  },

  getSidebarCollapsed(): boolean {
    return localStorage.getItem(KEYS.SIDEBAR_COLLAPSED) === 'true';
  },

  saveSidebarCollapsed(collapsed: boolean): void {
    localStorage.setItem(KEYS.SIDEBAR_COLLAPSED, String(collapsed));
  },

  getFontSize(): 'sm' | 'base' | 'lg' {
    const size = localStorage.getItem(KEYS.FONT_SIZE);
    if (size === 'sm' || size === 'base' || size === 'lg') return size;
    return 'base';
  },

  saveFontSize(size: 'sm' | 'base' | 'lg'): void {
    localStorage.setItem(KEYS.FONT_SIZE, size);
  },

  getTheme(): 'dark' | 'light' {
    const theme = localStorage.getItem(KEYS.THEME);
    if (theme === 'dark' || theme === 'light') return theme;
    return 'dark';
  },

  saveTheme(theme: 'dark' | 'light'): void {
    localStorage.setItem(KEYS.THEME, theme);
  },

  async exportData(): Promise<string> {
    const chats = await Storage.getChats();
    const settings = Storage.getSettings();
    const prompts = Storage.getCustomPrompts();
    const memories = Storage.getMemories();
    const schedules = Storage.getSchedules();

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      chats,
      settings,
      customPrompts: prompts,
      memories,
      schedules
    };

    return JSON.stringify(payload, null, 2);
  },

  async importData(jsonContent: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const parsed = JSON.parse(jsonContent);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, count: 0, error: 'Invalid JSON format' };
      }

      let count = 0;

      if (Array.isArray(parsed.chats) && parsed.chats.length > 0) {
        const existingChats = await Storage.getChats();
        const chatMap = new Map(existingChats.map(c => [c.id, c]));
        for (const chat of parsed.chats) {
          if (chat && chat.id) {
            chatMap.set(chat.id, upgradeChatToTree(chat));
            count++;
          }
        }
        await Storage.saveChatsImmediately(Array.from(chatMap.values()));
      }

      if (parsed.settings && typeof parsed.settings === 'object') {
        Storage.saveSettings({ ...Storage.getSettings(), ...parsed.settings });
      }

      if (Array.isArray(parsed.customPrompts)) {
        const existingPrompts = Storage.getCustomPrompts();
        const promptMap = new Map(existingPrompts.map(p => [p.id, p]));
        for (const p of parsed.customPrompts) {
          if (p && p.id) promptMap.set(p.id, p);
        }
        Storage.saveCustomPrompts(Array.from(promptMap.values()));
      }

      if (Array.isArray(parsed.memories)) {
        const existingMemories = Storage.getMemories();
        const memoryMap = new Map(existingMemories.map(m => [m.id, m]));
        for (const m of parsed.memories) {
          if (m && m.id) memoryMap.set(m.id, m);
        }
        Storage.saveMemories(Array.from(memoryMap.values()));
      }

      if (Array.isArray(parsed.schedules)) {
        const existingSchedules = Storage.getSchedules();
        const scheduleMap = new Map(existingSchedules.map(s => [s.id, s]));
        for (const s of parsed.schedules) {
          if (s && s.id) scheduleMap.set(s.id, s);
        }
        Storage.saveSchedules(Array.from(scheduleMap.values()));
      }

      return { success: true, count };
    } catch (e) {
      return { success: false, count: 0, error: e instanceof Error ? e.message : 'Import failed' };
    }
  }
};

