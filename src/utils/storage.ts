export interface Attachment {
  id: string;
  name: string;
  type: string;
  data: string;
  size: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: Attachment[];
}

export interface MessageNode {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  parentId: string | null;
  children: string[];
  attachments?: Attachment[];
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

export interface Settings {
  provider: 'gemini' | 'openrouter' | 'mock' | 'ollama';
  apiKey: string;
  model: string;
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
  speechToTextEngine?: 'native' | 'local';
  localUrl?: string;
  isRagEnabled?: boolean;
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
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
];

export const FALLBACK_OPENROUTER_MODELS = [
  { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash' },
  { id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro' },
  { id: 'meta-llama/llama-3-8b-instruct:free', name: 'Llama 3 8B Instruct (Free)' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Anthropic: Claude 3.5 Sonnet' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek: DeepSeek V3' }
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
  THEME: 'context_theme'
};

// Debounce helper
export function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: number | undefined;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait) as unknown as number;
  };
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
      attachments: node.attachments
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
      attachments: msg.attachments
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
        if (parsed && parsed.provider === 'anthropic') {
          parsed.provider = 'mock';
          parsed.model = 'mock-smart';
        }
        if (parsed && !parsed.thinkingLevel) {
          parsed.thinkingLevel = 'off';
        }
        if (parsed && !parsed.speechToTextEngine) {
          parsed.speechToTextEngine = 'native';
        }
        if (parsed && !parsed.localUrl) {
          parsed.localUrl = 'http://localhost:11434/v1';
        }
        if (parsed && parsed.isRagEnabled === undefined) {
          parsed.isRagEnabled = false;
        }
        return parsed;
      }
    } catch (e) {
      console.error('Error reading settings from localStorage', e);
    }
    return {
      provider: 'mock',
      apiKey: '',
      model: 'mock-smart',
      thinkingLevel: 'off',
      speechToTextEngine: 'native',
      localUrl: 'http://localhost:11434/v1',
      isRagEnabled: false
    };
  },

  saveSettings(settings: Settings): void {
    try {
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving settings to localStorage', e);
    }
  },

  getChats(): Chat[] {
    try {
      const data = localStorage.getItem(KEYS.CHATS);
      if (data) {
        const rawChats = JSON.parse(data);
        if (Array.isArray(rawChats)) {
          return rawChats.map(c => upgradeChatToTree(c));
        }
      }
    } catch (e) {
      console.error('Error reading chats from localStorage', e);
    }
    return [];
  },

  saveChats: debounce((chats: Chat[]): void => {
    try {
      localStorage.setItem(KEYS.CHATS, JSON.stringify(chats));
    } catch (e) {
      console.error('Error saving chats to localStorage', e);
    }
  }, 300),

  saveChatsImmediately(chats: Chat[]): void {
    try {
      localStorage.setItem(KEYS.CHATS, JSON.stringify(chats));
    } catch (e) {
      console.error('Error saving chats to localStorage immediately', e);
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

  getTheme(): 'dark' | 'light' | 'system' {
    const theme = localStorage.getItem(KEYS.THEME);
    if (theme === 'dark' || theme === 'light' || theme === 'system') return theme;
    return 'dark';
  },

  saveTheme(theme: 'dark' | 'light' | 'system'): void {
    localStorage.setItem(KEYS.THEME, theme);
  }
};

