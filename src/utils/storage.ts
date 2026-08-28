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
export function getChatBrowserSession(chat: Chat | null | undefined): BrowserSessionData | undefined {
  if (!chat?.messages) return undefined;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].browserSession) {
      return chat.messages[i].browserSession;
    }
  }
  return undefined;
}

export function isChatBrowserSessionActive(chat: Chat | null | undefined): boolean {
  const session = getChatBrowserSession(chat);
  return session?.status === 'running' || session?.status === 'paused';
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

export type ProviderType = 'gemini' | 'anthropic' | 'openai' | 'openrouter' | 'ollama';

export interface ProviderInfo {
  id: ProviderType;
  name: string;
  defaultModel: string;
  keyPlaceholder: string;
}

export const PROVIDERS: Record<ProviderType, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'gemini-3.6-flash',
    keyPlaceholder: 'Enter Gemini API Key...'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    defaultModel: 'claude-3-7-sonnet-20250219',
    keyPlaceholder: 'Enter Anthropic API Key...'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    keyPlaceholder: 'Enter OpenAI API Key...'
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultModel: 'anthropic/claude-3.7-sonnet',
    keyPlaceholder: 'Enter OpenRouter API Key...'
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    defaultModel: 'llama3.2',
    keyPlaceholder: 'Not required for local Ollama'
  }
};

export interface ProviderProfile {
  id: string;
  name: string;
  provider: ProviderType;
  apiKey: string;
  model: string;
  localUrl?: string;
}

export interface Settings {
  provider: ProviderType;
  apiKey: string;
  model: string;
  profiles?: ProviderProfile[];
  activeProfileId?: string;
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
export interface ModelOption {
  id: string;
  name: string;
}

export const FALLBACK_MODELS: Record<ProviderType, ModelOption[]> = {
  gemini: [
    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (Default)' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview)' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Default)' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Default)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'o1', name: 'o1' },
    { id: 'o3-mini', name: 'o3-mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
  ],
  openrouter: [
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet (Default)' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'openai/gpt-4o', name: 'GPT-4o' },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' }
  ],
  ollama: [
    { id: 'llama3.2', name: 'Llama 3.2 (3B) (Default)' },
    { id: 'llama3.1', name: 'Llama 3.1 (8B)' },
    { id: 'deepseek-r1', name: 'DeepSeek R1 (Local)' },
    { id: 'qwen2.5', name: 'Qwen 2.5 (7B)' },
    { id: 'mistral', name: 'Mistral (7B)' },
    { id: 'phi4', name: 'Phi-4 (14B)' },
    { id: 'gemma2', name: 'Gemma 2 (9B)' },
    { id: 'codellama', name: 'Code Llama (7B)' },
    { id: 'llava', name: 'LLaVA (Vision)' }
  ]
};

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
  SCHEDULES: 'context_schedules',
  WORKSPACE_OPEN: 'context_workspace_open',
  WORKSPACE_TAB: 'context_workspace_tab',
  WORKSPACE_WIDTH: 'context_workspace_width'
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

// Profile & Settings Sanitization Helpers
export function sanitizeProfile(
  p: Partial<ProviderProfile>,
  fallbackProvider: ProviderType = 'gemini'
): ProviderProfile {
  const provider: ProviderType =
    p.provider && PROVIDERS[p.provider] ? p.provider : fallbackProvider;
  const defaultModel = PROVIDERS[provider]?.defaultModel || 'gemini-3.6-flash';
  return {
    id: p.id || `profile-${Date.now()}`,
    name: p.name || 'Profile',
    provider,
    apiKey: p.apiKey ?? '',
    model: p.model || defaultModel,
    localUrl: p.localUrl ?? (provider === 'ollama' ? 'http://localhost:11434' : undefined)
  };
}

export function normalizeSettings(raw: Partial<Settings>): Settings {
  const fallbackProvider: ProviderType =
    raw.provider && PROVIDERS[raw.provider] ? raw.provider : 'gemini';
  const fallbackModel = raw.model || PROVIDERS[fallbackProvider].defaultModel;
  const fallbackApiKey = raw.apiKey ?? '';
  const fallbackLocalUrl = raw.localUrl ?? (fallbackProvider === 'ollama' ? 'http://localhost:11434' : undefined);

  let profiles: ProviderProfile[] = Array.isArray(raw.profiles)
    ? raw.profiles.map(p => sanitizeProfile(p, fallbackProvider))
    : [];

  if (profiles.length === 0) {
    profiles = [
      sanitizeProfile(
        {
          id: 'profile-default',
          name: 'Default Profile',
          provider: fallbackProvider,
          apiKey: fallbackApiKey,
          model: fallbackModel,
          localUrl: fallbackLocalUrl
        },
        fallbackProvider
      )
    ];
  }
  let activeProfileId = raw.activeProfileId;
  if (!activeProfileId || !profiles.some(p => p.id === activeProfileId)) {
    activeProfileId = profiles[0].id;
  }
  const activeIdx = profiles.findIndex(p => p.id === activeProfileId);
  if (activeIdx !== -1) {
    const currentActive = profiles[activeIdx];
    profiles[activeIdx] = sanitizeProfile(
      {
        ...currentActive,
        provider: currentActive.provider || fallbackProvider,
        apiKey: currentActive.apiKey || fallbackApiKey,
        model: currentActive.model || fallbackModel,
        localUrl: currentActive.localUrl || fallbackLocalUrl
      },
      fallbackProvider
    );
  }

  const activeProfile = profiles[activeIdx] || profiles[0];
  const activeProvider = activeProfile.provider && PROVIDERS[activeProfile.provider]
    ? activeProfile.provider
    : 'gemini';

  return {
    provider: activeProvider,
    apiKey: activeProfile.apiKey ?? '',
    model: activeProfile.model || PROVIDERS[activeProvider]?.defaultModel || 'gemini-3.6-flash',
    profiles,
    activeProfileId: activeProfile.id,
    localUrl: activeProfile.localUrl || raw.localUrl || (activeProvider === 'ollama' ? 'http://localhost:11434' : undefined),
    isWebSearchEnabled: raw.isWebSearchEnabled ?? false,
    searxngUrl: raw.searxngUrl ?? '',
    thinkingLevel: raw.thinkingLevel ?? 'off',
    isMemoryEnabled: raw.isMemoryEnabled ?? true,
    isBrowserAgentEnabled: raw.isBrowserAgentEnabled ?? false
  };
}

// Storage Helpers
export const Storage = {
  getSettings(): Settings {
    try {
      const data = localStorage.getItem(KEYS.SETTINGS);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') {
          return normalizeSettings(parsed);
        }
      }
    } catch (e) {
      console.error('Error reading settings from localStorage', e);
    }
    return normalizeSettings({});
  },

  saveSettings(settings: Settings): void {
    try {
      const normalized = normalizeSettings(settings);
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(normalized));
    } catch (e) {
      console.error('Error saving settings to localStorage', e);
    }
  },
  getActiveProfile(settings: Settings): ProviderProfile {
    const active = settings.profiles?.find(p => p.id === settings.activeProfileId);
    return active || settings.profiles?.[0] || sanitizeProfile({});
  },

  updateActiveProfile(settings: Settings, changes: Partial<ProviderProfile>): Settings {
    const profiles = settings.profiles ? [...settings.profiles] : [];
    const activeId = settings.activeProfileId || profiles[0]?.id;
    const activeIdx = profiles.findIndex(p => p.id === activeId);
    if (activeIdx !== -1) {
      profiles[activeIdx] = sanitizeProfile({
        ...profiles[activeIdx],
        ...changes
      });
    }
    return normalizeSettings({
      ...settings,
      profiles,
      activeProfileId: activeId
    });
  },

  switchProfile(settings: Settings, profileId: string): Settings {
    const target = settings.profiles?.find(p => p.id === profileId);
    if (!target) return settings;
    return normalizeSettings({
      ...settings,
      activeProfileId: profileId,
      provider: target.provider,
      apiKey: target.apiKey,
      model: target.model,
      localUrl: target.localUrl
    });
  },

  addProfile(settings: Settings, newProfile?: Partial<ProviderProfile>): Settings {
    const created = sanitizeProfile(
      newProfile || {
        id: `profile-${Date.now()}`,
        name: 'New Profile',
        provider: settings.provider || 'gemini'
      }
    );
    const profiles = [...(settings.profiles || []), created];
    return normalizeSettings({
      ...settings,
      profiles,
      activeProfileId: created.id
    });
  },

  deleteProfile(settings: Settings, profileId: string): Settings {
    const profiles = settings.profiles || [];
    if (profiles.length <= 1) return settings;
    const remaining = profiles.filter(p => p.id !== profileId);
    const nextActiveId = settings.activeProfileId === profileId ? remaining[0].id : settings.activeProfileId;
    return normalizeSettings({
      ...settings,
      profiles: remaining,
      activeProfileId: nextActiveId
    });
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
  getWorkspaceOpen(): boolean {
    return localStorage.getItem(KEYS.WORKSPACE_OPEN) === 'true';
  },

  saveWorkspaceOpen(open: boolean): void {
    localStorage.setItem(KEYS.WORKSPACE_OPEN, String(open));
  },

  getWorkspaceTab(): 'browser' | 'schedules' | 'artifacts' | 'crawl4ai' {
    const tab = localStorage.getItem(KEYS.WORKSPACE_TAB);
    if (tab === 'browser' || tab === 'schedules' || tab === 'artifacts' || tab === 'crawl4ai') return tab;
    return 'browser';
  },

  saveWorkspaceTab(tab: 'browser' | 'schedules' | 'artifacts' | 'crawl4ai'): void {
    localStorage.setItem(KEYS.WORKSPACE_TAB, tab);
  },

  getWorkspaceWidth(): number {
    const val = localStorage.getItem(KEYS.WORKSPACE_WIDTH);
    if (val) {
      const num = parseInt(val, 10);
      if (!isNaN(num) && num >= 280 && num <= 1200) return num;
    }
    return 420;
  },

  saveWorkspaceWidth(width: number): void {
    localStorage.setItem(KEYS.WORKSPACE_WIDTH, String(width));
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
        const currentSettings = Storage.getSettings();
        const importedSettings = parsed.settings;

        let mergedProfiles = currentSettings.profiles ? [...currentSettings.profiles] : [];

        if (Array.isArray(importedSettings.profiles) && importedSettings.profiles.length > 0) {
          if (
            mergedProfiles.length === 1 &&
            mergedProfiles[0].id === 'profile-default' &&
            !mergedProfiles[0].apiKey
          ) {
            mergedProfiles = [];
          }
          const profileMap = new Map(mergedProfiles.map(p => [p.id, p]));
          for (const p of importedSettings.profiles) {
            if (p && p.id) {
              profileMap.set(p.id, sanitizeProfile(p));
            }
          }
          mergedProfiles = Array.from(profileMap.values());
        }

        const activeProfileId =
          importedSettings.activeProfileId ||
          currentSettings.activeProfileId ||
          mergedProfiles[0]?.id;

        const mergedSettings: Settings = {
          ...currentSettings,
          ...importedSettings,
          profiles: mergedProfiles,
          activeProfileId
        };

        Storage.saveSettings(mergedSettings);
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

