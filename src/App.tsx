import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Composer } from './components/Composer';
import { PRESET_PROMPTS, Storage, reconstructActivePath, upgradeChatToTree } from './utils/storage';
import type { Chat, Message, MessageNode, Settings, SystemPrompt, Attachment, BrowserSessionData } from './utils/storage';
import { streamChatCompletion } from './utils/api';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AlertCircle, X, Loader2 } from 'lucide-react';

// Code splitting for modal components to optimize initial chunk size
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const ShortcutsModal = lazy(() => import('./components/ShortcutsModal').then(m => ({ default: m.ShortcutsModal })));
const CommandPalette = lazy(() => import('./components/CommandPalette').then(m => ({ default: m.CommandPalette })));
const SchedulesPanel = lazy(() => import('./components/SchedulesPanel').then(m => ({ default: m.SchedulesPanel })));
const BrowserModal = lazy(() => import('./components/BrowserModal').then(m => ({ default: m.BrowserModal })));

const ModalFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
    <div className="flex items-center gap-3 px-6 py-4 bg-popover border border-border rounded-xl text-foreground shadow-2xl">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
      <span className="text-sm font-medium">Loading component...</span>
    </div>
  </div>
);
interface SyncEvent {
  id: string;
  chatId: string;
  isNewChat: boolean;
  chatTitle: string;
  userMsg: Message;
  assistantMsg: Message;
  timestamp: string;
}



function addMessageToTree(chat: Chat, message: Message, parentId: string | null): Chat {
  const upgradedChat = upgradeChatToTree(chat);
  const tree = { ...upgradedChat.messageTree };
  
  const newNode: MessageNode = {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    parentId: parentId,
    children: [],
    attachments: message.attachments,
    browserSession: message.browserSession
  };
  
  tree[newNode.id] = newNode;
  
  if (parentId && tree[parentId]) {
    const parentNode = { ...tree[parentId] };
    if (!parentNode.children.includes(newNode.id)) {
      parentNode.children = [...parentNode.children, newNode.id];
      tree[parentId] = parentNode;
    }
  }
  
  const activeLeafId = newNode.id;
  const messages = reconstructActivePath(tree, activeLeafId);
  
  return {
    ...upgradedChat,
    messageTree: tree,
    activeLeafId,
    messages,
    updatedAt: new Date().toISOString()
  };
}

function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [settings, setSettings] = useState<Settings>(() => Storage.getSettings());
  const [customPrompts, setCustomPrompts] = useState<SystemPrompt[]>(() => Storage.getCustomPrompts());
  const [activePromptId, setActivePromptId] = useState<string>(() => Storage.getActivePromptId());
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isChatsLoaded, setIsChatsLoaded] = useState(false);
  
  // Composer states
  const [composerInput, setComposerInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [browserModalOpen, setBrowserModalOpen] = useState(false);
  const [browserModalSessionId, setBrowserModalSessionId] = useState<string>('interactive');

  // Preference and accessibility states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => Storage.getSidebarCollapsed());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => Storage.getTheme());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Elegant Toast alerts state
  const [toast, setToast] = useState<{ message: React.ReactNode; type: 'error' | 'success' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Refs for abort controllers and focus management
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const deletedChatsMapRef = useRef<Map<string, { chat: Chat; index: number }>>(new Map());

  const handleRestoreChat = (id: string) => {
    const entry = deletedChatsMapRef.current.get(id);
    if (!entry) return;

    const { chat: restoredChat, index } = entry;

    setChats(prev => {
      if (prev.some(c => c.id === id)) return prev;
      const next = [...prev];
      const targetIndex = Math.min(index, next.length);
      next.splice(targetIndex, 0, restoredChat);
      return next;
    });

    Storage.saveChat(restoredChat);
    setActiveChatId(restoredChat.id);
    Storage.saveActiveChatId(restoredChat.id);

    deletedChatsMapRef.current.delete(id);
    showToast(`Restored "${restoredChat.title}".`, 'success');
  };

  // Load chats asynchronously on mount
  useEffect(() => {
    const initChats = async () => {
      const savedChats = await Storage.getChats();
      setChats(savedChats);
      
      const savedActiveChatId = Storage.getActiveChatId();
      if (savedActiveChatId && savedChats.some(c => c.id === savedActiveChatId)) {
        setActiveChatId(savedActiveChatId);
      } else if (savedChats.length > 0) {
        setActiveChatId(savedChats[0].id);
        Storage.saveActiveChatId(savedChats[0].id);
      }
      setIsChatsLoaded(true);
    };
    initChats();
  }, []);

  // Theme Sync Effect
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (t: 'dark' | 'light') => {
      root.setAttribute('data-theme', t);
      if (t === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(theme);
  }, [theme]);

  const handleNewChat = useCallback(() => {
    // If an empty chat session already exists, select it instead of creating duplicates
    const emptyChat = chats.find(c => !c.messages || c.messages.length === 0);
    if (emptyChat) {
      setActiveChatId(emptyChat.id);
      Storage.saveActiveChatId(emptyChat.id);
      setComposerInput('');
      setTimeout(() => textareaRef.current?.focus(), 50);
      return;
    }

    // Generate new chat session
    const newChat: Chat = {
      id: `chat-${Date.now()}`,
      title: `New Conversation`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      messageTree: {},
      activeLeafId: null
    };

    const updatedChats = [newChat, ...chats];
    setChats(updatedChats);
    setActiveChatId(newChat.id);
    Storage.saveChat(newChat);
    Storage.saveActiveChatId(newChat.id);
    setComposerInput('');
    
    // Focus composer
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [chats]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );

      // New Chat: Ctrl+Shift+N or Cmd+Shift+N
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewChat();
      }
      
      // Focus Input: Ctrl+/ or Cmd+/
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        textareaRef.current?.focus();
      }

      // Command Palette Toggle: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }

      // Sidebar Toggle: Ctrl+B or Cmd+B
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed(prev => {
          const next = !prev;
          Storage.saveSidebarCollapsed(next);
          return next;
        });
      }

      // Help Shortcut: ?
      if (e.key === '?' && !isInputFocused) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }

      // Escape key to dismiss modals
      if (e.key === 'Escape') {
        if (confirmDialog) {
          setConfirmDialog(null);
          return;
        }
        setSettingsOpen(false);
        setShortcutsOpen(false);
        setCommandPaletteOpen(false);
        setBrowserModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat, confirmDialog]);

  // Listen to global open browser sandbox events
  useEffect(() => {
    const handleOpenSandbox = (e: Event) => {
      const customEvent = e as CustomEvent<{ sessionId?: string }>;
      const sid = customEvent.detail?.sessionId || 'interactive';
      setBrowserModalSessionId(sid);
      setBrowserModalOpen(true);
    };

    window.addEventListener('open-browser-sandbox-modal', handleOpenSandbox);
    return () => window.removeEventListener('open-browser-sandbox-modal', handleOpenSandbox);
  }, []);

  const showToast = (message: React.ReactNode, type: 'error' | 'success' = 'error') => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    
    setToast({ message, type });
    
    // Auto-dismiss after 6 seconds
    const timer = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 6000);
    
    toastTimerRef.current = timer;
  };

  // Toast unmount cleanup
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Sync settings to schedules backend whenever they change
  useEffect(() => {
    fetch('/api/schedules/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }).catch(err => console.error('Failed to sync settings to schedules backend', err));
  }, [settings]);


  // Background EventSource connection for real-time schedules sync and logs
  useEffect(() => {
    const fetchSchedulesSyncOnce = async () => {
      try {
        const res = await fetch('/api/schedules/sync');
        if (!res.ok) return;
        const events: SyncEvent[] = await res.json();
        if (events.length === 0) return;

        let finalChats: Chat[] = [];
        setChats(prevChats => {
          let updatedChats = [...prevChats];

          events.forEach((event: SyncEvent) => {
            const chatIndex = updatedChats.findIndex(c => c.id === event.chatId);
            
            if (chatIndex !== -1) {
              const existingChat = updatedChats[chatIndex];
              let chat = upgradeChatToTree(existingChat);
              const parentId = chat.activeLeafId || null;
              chat = addMessageToTree(chat, event.userMsg, parentId);
              chat = addMessageToTree(chat, event.assistantMsg, event.userMsg.id);
              updatedChats[chatIndex] = chat;
            } else {
              const emptyChat: Chat = {
                id: event.chatId,
                title: event.chatTitle || 'Scheduled Task',
                createdAt: event.timestamp || new Date().toISOString(),
                updatedAt: event.timestamp || new Date().toISOString(),
                messages: [],
                messageTree: {},
                activeLeafId: null
              };
              let chat = upgradeChatToTree(emptyChat);
              chat = addMessageToTree(chat, event.userMsg, null);
              chat = addMessageToTree(chat, event.assistantMsg, event.userMsg.id);
              updatedChats = [chat, ...updatedChats];
            }
          });

          finalChats = updatedChats;
          return updatedChats;
        });

        if (finalChats.length > 0) {
          for (const event of events) {
            const updatedChat = finalChats.find(c => c.id === event.chatId);
            if (updatedChat) {
              await Storage.saveChat(updatedChat);
            }
          }
        }

        showToast(`Synced ${events.length} background task execution results!`, 'success');
      } catch (err) {
        console.error('Error polling schedules sync:', err);
      }
    };

    // Run initial catch-up poll immediately on mount
    fetchSchedulesSyncOnce();

    // Establish Server-Sent Events connection
    const eventSource = new EventSource('/api/schedules/events');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === 'schedule-sync') {
          const syncEvent = data as SyncEvent;
          let updatedChat: Chat | undefined;
          setChats(prevChats => {
            let updatedChats = [...prevChats];
            const chatIndex = updatedChats.findIndex(c => c.id === syncEvent.chatId);
            
            if (chatIndex !== -1) {
              const existingChat = updatedChats[chatIndex];
              let chat = upgradeChatToTree(existingChat);
              const parentId = chat.activeLeafId || null;
              chat = addMessageToTree(chat, syncEvent.userMsg, parentId);
              chat = addMessageToTree(chat, syncEvent.assistantMsg, syncEvent.userMsg.id);
              updatedChats[chatIndex] = chat;
              updatedChat = chat;
            } else {
              const emptyChat: Chat = {
                id: syncEvent.chatId,
                title: syncEvent.chatTitle || 'Scheduled Task',
                createdAt: syncEvent.timestamp || new Date().toISOString(),
                updatedAt: syncEvent.timestamp || new Date().toISOString(),
                messages: [],
                messageTree: {},
                activeLeafId: null
              };
              let chat = upgradeChatToTree(emptyChat);
              chat = addMessageToTree(chat, syncEvent.userMsg, null);
              chat = addMessageToTree(chat, syncEvent.assistantMsg, syncEvent.userMsg.id);
              updatedChats = [chat, ...updatedChats];
              updatedChat = chat;
            }

            return updatedChats;
          });
          if (updatedChat) {
            Storage.saveChat(updatedChat);
          }

          showToast(`Synced background task execution results!`, 'success');
        } else if (type === 'browser-agent-update') {
          const update = data as {
            sessionId: string;
            messageId: string;
            url: string;
            title: string;
            status: 'running' | 'paused' | 'completed' | 'failed';
            steps: BrowserSessionData['steps'];
            screenshotTimestamp: number;
            text?: string;
          };

          let updatedChat: Chat | undefined;
          setChats(prevChats => {
            const finalChats = prevChats.map(c => {
              if (c.id === update.sessionId) {
                const upgraded = upgradeChatToTree(c);
                const tree = { ...upgraded.messageTree };
                if (tree[update.messageId]) {
                  tree[update.messageId] = {
                    ...tree[update.messageId],
                    content: update.text || '',
                    browserSession: {
                      url: update.url,
                      title: update.title,
                      status: update.status,
                      steps: update.steps,
                      screenshotTimestamp: update.screenshotTimestamp
                    }
                  };
                }
                const messages = reconstructActivePath(tree, upgraded.activeLeafId);
                updatedChat = {
                  ...upgraded,
                  messageTree: tree,
                  messages,
                  updatedAt: new Date().toISOString()
                };
                return updatedChat;
              }
              return c;
            });
            return finalChats;
          });
          if (updatedChat) {
            Storage.saveChat(updatedChat);
          }

          if (update.status === 'completed' || update.status === 'failed') {
            setIsGenerating(false);
          }
        }

        // Dispatch events globally so other components (e.g. BrowserModal, SchedulesPanel) can listen in
        const customEvent = new CustomEvent('context-live-event', {
          detail: { type, data }
        });
        window.dispatchEvent(customEvent);
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('SSE stream disconnected or failed. Browser EventSource will auto-reconnect.', err);
    };

    // 30 seconds slow fallback sync interval
    const interval = setInterval(fetchSchedulesSyncOnce, 30000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, []);

  const handleSelectChat = (id: string) => {
    setActiveChatId(id);
    Storage.saveActiveChatId(id);
    setComposerInput('');
    // Focus composer
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleDeleteChat = (id: string) => {
    const chatIndex = chats.findIndex(c => c.id === id);
    const chatToDelete = chats[chatIndex];
    if (!chatToDelete) return;

    deletedChatsMapRef.current.set(id, { chat: chatToDelete, index: chatIndex });

    const updatedChats = chats.filter(c => c.id !== id);
    setChats(updatedChats);
    Storage.deleteChat(id);

    if (activeChatId === id) {
      if (updatedChats.length > 0) {
        setActiveChatId(updatedChats[0].id);
        Storage.saveActiveChatId(updatedChats[0].id);
      } else {
        setActiveChatId(null);
        Storage.saveActiveChatId(null);
      }
    }

    showToast(
      <div className="flex items-center gap-3">
        <span>Deleted "{chatToDelete.title}".</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleRestoreChat(id);
          }}
          className="rounded bg-primary/20 hover:bg-primary/30 text-primary font-semibold px-2 py-0.5 text-xs transition cursor-pointer"
        >
          Undo
        </button>
      </div>,
      'success'
    );
  };

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
    const activeChat = chats.find(c => c.id === activeChatId);
    if (activeChat && activeChat.messages.some(m => m.browserSession && (m.browserSession.status === 'running' || m.browserSession.status === 'paused'))) {
      fetch('/api/browser/agent/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeChatId })
      }).catch(err => console.error('Failed to abort backend browser agent:', err));
    }
  };

  const getSystemPromptText = () => {
    const all = [...PRESET_PROMPTS, ...customPrompts];
    const basePrompt = all.find(p => p.id === activePromptId)?.content || '';
    
    const workspaceCapabilities = `\n\n[WORKSPACE CAPABILITIES]\nYou are running inside Context, a premium local-first AI workspace. The user has access to the following integrated tools directly in the interface:\n1. **Interactive Code Execution (JS/TS/Python)**: Every JavaScript, TypeScript, or Python code block you generate has a "Run" button next to it. The user can execute the script locally in a sandbox. When writing scripts, use console.log (JS/TS) or print (Python) to output results so they display in their console drawer.\n2. **Auto-Fix Self-Healing Loop**: If their script throws an execution error, the user can click "Fix with AI" to automatically send the code and terminal stack trace back to you. When you receive an execution error report, focus on providing a revised, corrected, and clean script.\n3. **Web Search (SearXNG)**: A toggle to search the web in real-time. If search is enabled, relevant web results are injected into your system context automatically.\n4. **Local Document Context (RAG)**: A toggle to index local documents. Excerpts of matching text files are injected into your context.\nIf the user asks you to run a code block, search the web, or read their documents, remind them that they can toggle/use these features in the bottom toolbar of their composer input box.`;

    const questionInstructions = `\n\n[INTERACTIVE QUESTIONS CAPABILITY]\nIf you need to ask the user a clarifying question, gather preferences, choose a topic/option, or conduct an interactive quiz/test, you can render a beautiful interactive multiple-choice Question Card by outputting a custom XML-style tag in this format at the END of your message:\n\n<ask_question question="What topic should I test you on?">\n  <option>DSA / Algorithms</option>\n  <option>JavaScript / TypeScript</option>\n  <option>System Design</option>\n</ask_question>\n\nGuidelines:\n1. Keep the "question" attribute short and clear.\n2. Write between 2 to 5 standard choices, each wrapped in a <option> tag.\n3. The interactive card automatically supports custom write-in answers ("Something else") and "Skip" features by default. Use it when you want the user to pick an option rather than typing it. DO NOT output the XML tag in the middle of code blocks.`;

    let memoryContext = '';
    if (settings.isMemoryEnabled) {
      try {
        const memoryItems = Storage.getMemories();
        if (memoryItems.length > 0) {
          const preferences = memoryItems.filter(m => m.category === 'preference').map(m => `- ${m.content}`).join('\n');
          const projects = memoryItems.filter(m => m.category === 'project').map(m => `- ${m.content}`).join('\n');
          const conversations = memoryItems.filter(m => m.category === 'conversation').map(m => `- ${m.content}`).join('\n');
          const others = memoryItems.filter(m => m.category === 'other').map(m => `- ${m.content}`).join('\n');
          
          memoryContext = `\n\n[USER PERSONAL MEMORY]\nYou have the following details stored in your long-term memory about the user. Use this information to personalize your responses, remember their projects, and reference relevant context from previous conversations:`;
          if (preferences) {
            memoryContext += `\n* Preferences:\n${preferences}`;
          }
          if (projects) {
            memoryContext += `\n* Projects:\n${projects}`;
          }
          if (conversations) {
            memoryContext += `\n* Conversations:\n${conversations}`;
          }
          if (others) {
            memoryContext += `\n* General:\n${others}`;
          }
        }
      } catch (err) {
        console.error('Failed to retrieve memories for system prompt:', err);
      }
    }

    const screenshotInstructions = `\n\n[BROWSER SCREENSHOT CAPABILITY]\nIf the user asks you to show, send, or capture a screenshot of the current page, or if they ask "what do you see in the browser?" or "show me the browser", you can include the tag \`<show_screenshot />\` anywhere in your response. The system will automatically render a live visual screenshot of the current Puppeteer browser sandbox. Make sure to tell the user what page you are displaying.`;

    return `${basePrompt}${workspaceCapabilities}${questionInstructions}${screenshotInstructions}${memoryContext}`;
  };

  // Main streaming loop
  const triggerStreamingResponse = async (chatList: Chat[], targetChatId: string) => {
    const activeChatIndex = chatList.findIndex(c => c.id === targetChatId);
    if (activeChatIndex === -1) return;

    const activeChat = upgradeChatToTree(chatList[activeChatIndex]);
    setIsGenerating(true);
    
    // Setup AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Retrieve the user query (the last message in the active path)
    const userQuery = activeChat.messages[activeChat.messages.length - 1]?.content || '';

    // Create stream message placeholder
    const streamMessageId = `msg-stream-${Date.now()}`;

    const placeholderMessage: Message = {
      id: streamMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };

    // Add placeholder to tree
    const parentId = activeChat.activeLeafId || null;
    const chatWithPlaceholder = addMessageToTree(activeChat, placeholderMessage, parentId);
    
    const chatsWithPlaceholder = chatList.map(c =>
      c.id === targetChatId ? chatWithPlaceholder : c
    );
    setChats(chatsWithPlaceholder);

    let searchTagPrefix = '';
    const systemInstruction = getSystemPromptText();
    const apiHistory = activeChat.messages;
    let accumulatedContent = '';

    const updateStreamedContent = (newContent: string) => {
      setChats(prevChats =>
        prevChats.map(c => {
          if (c.id === targetChatId) {
            const upgraded = upgradeChatToTree(c);
            const tree = { ...upgraded.messageTree };
            if (tree[streamMessageId]) {
              tree[streamMessageId] = {
                ...tree[streamMessageId],
                content: newContent
              };
            }
            const messages = reconstructActivePath(tree, upgraded.activeLeafId);
            return { ...upgraded, messageTree: tree, messages };
          }
          return c;
        })
      );
    };

    await streamChatCompletion(
      settings,
      apiHistory,
      systemInstruction,
      {
        onToolCall: ({ query }: { toolName: string; query: string }) => {
          searchTagPrefix = `<search_status query="${query.replace(/"/g, '&quot;')}" status="searching" />`;
          updateStreamedContent(searchTagPrefix + accumulatedContent);
        },
        onToolResult: ({ query, results }: { toolName: string; query: string; results: unknown[]; source: string }) => {
          if (results && results.length > 0) {
            searchTagPrefix = `<search_status query="${query.replace(/"/g, '&quot;')}" status="done">${JSON.stringify(results)}</search_status>\n\n`;
          } else {
            searchTagPrefix = `<search_status query="${query.replace(/"/g, '&quot;')}" status="failed" error="No search results found"></search_status>\n\n`;
          }
          updateStreamedContent(searchTagPrefix + accumulatedContent);
        },
        onChunk: (chunk: string) => {
          accumulatedContent += chunk;
          updateStreamedContent(searchTagPrefix + accumulatedContent);
        },
        onDone: (finalText: string) => {
          setIsGenerating(false);
          let updatedChat: Chat | undefined;
          setChats(prevChats => {
            const finalChats = prevChats.map(c => {
              if (c.id === targetChatId) {
                const upgraded = upgradeChatToTree(c);
                const tree = { ...upgraded.messageTree };
                if (tree[streamMessageId]) {
                  tree[streamMessageId] = {
                    ...tree[streamMessageId],
                    content: searchTagPrefix + finalText,
                    timestamp: new Date().toISOString()
                  };
                }
                const messages = reconstructActivePath(tree, upgraded.activeLeafId);
                updatedChat = {
                  ...upgraded,
                  messageTree: tree,
                  messages,
                  updatedAt: new Date().toISOString()
                };
                return updatedChat;
              }
              return c;
            });
            return finalChats;
          });

          if (updatedChat) {
            Storage.saveChat(updatedChat);
          }

          if (settings.isMemoryEnabled) {
            import('./utils/memory').then(({ extractAndSaveMemories }) => {
              extractAndSaveMemories(settings, userQuery, finalText).catch(err => {
                console.error('Failed to extract memories in background:', err);
              });
            });
          }

          abortControllerRef.current = null;
        },
        onError: (errorMsg: string) => {
          setIsGenerating(false);
          showToast(errorMsg, 'error');
          
          let updatedChat: Chat | undefined;
          setChats(prevChats => {
            const finalChats = prevChats.map(c => {
              if (c.id === targetChatId) {
                const upgraded = upgradeChatToTree(c);
                const tree = { ...upgraded.messageTree };
                if (tree[streamMessageId]) {
                  tree[streamMessageId] = {
                    ...tree[streamMessageId],
                    content: searchTagPrefix + (accumulatedContent ? accumulatedContent + `\n\n⚠️ ${errorMsg}` : `⚠️ ${errorMsg}`),
                    timestamp: new Date().toISOString()
                  };
                }
                const messages = reconstructActivePath(tree, upgraded.activeLeafId);
                updatedChat = {
                  ...upgraded,
                  messageTree: tree,
                  messages,
                  updatedAt: new Date().toISOString()
                };
                return updatedChat;
              }
              return c;
            });
            return finalChats;
          });
          if (updatedChat) {
            Storage.saveChat(updatedChat);
          }
          abortControllerRef.current = null;
        }
      },
      controller.signal
    );
  };

  const triggerBrowserAgentLoop = async (chatList: Chat[], targetChatId: string, userGoal: string) => {
    const activeChatIndex = chatList.findIndex(c => c.id === targetChatId);
    if (activeChatIndex === -1) return;

    const activeChat = upgradeChatToTree(chatList[activeChatIndex]);
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const streamMessageId = `msg-browser-${Date.now()}`;
    const initialSession: BrowserSessionData = {
      url: '',
      title: 'Launching local sandbox browser...',
      status: 'running',
      steps: [],
      screenshotTimestamp: 0
    };

    const placeholderMessage: Message = {
      id: streamMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      browserSession: initialSession
    };

    // Add placeholder to tree
    const parentId = activeChat.activeLeafId || null;
    const currentChat = addMessageToTree(activeChat, placeholderMessage, parentId);
    
    setChats(prevChats =>
      prevChats.map(c => (c.id === targetChatId ? currentChat : c))
    );

    try {
      const response = await fetch('/api/browser/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: targetChatId,
          messageId: streamMessageId,
          userGoal,
          settings
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to start browser agent on backend');
      }
    } catch (e) {
      const error = e as Error;
      console.error('Failed to start browser agent on backend:', error);
      setIsGenerating(false);
      showToast(error.message || 'Browser companion server failed to start the agent loop.', 'error');
      
      let updatedChat: Chat | undefined;
      // Rollback chat session (remove placeholder message)
      setChats(prevChats => {
        const rolledBackChats = prevChats.map(c => {
          if (c.id === targetChatId) {
            const upgraded = upgradeChatToTree(c);
            const tree = { ...upgraded.messageTree };
            
            const nodeToDelete = tree[streamMessageId];
            if (nodeToDelete && nodeToDelete.parentId && tree[nodeToDelete.parentId]) {
              const parentNode = { ...tree[nodeToDelete.parentId] };
              parentNode.children = parentNode.children.filter(id => id !== streamMessageId);
              tree[nodeToDelete.parentId] = parentNode;
            }
            
            delete tree[streamMessageId];
            const activeLeaf = parentId;
            const messages = reconstructActivePath(tree, activeLeaf);
            
            updatedChat = {
              ...upgraded,
              messageTree: tree,
              activeLeafId: activeLeaf,
              messages
            };
            return updatedChat;
          }
          return c;
        });
        return rolledBackChats;
      });
      if (updatedChat) {
        Storage.saveChat(updatedChat);
      }
    }
  };

  const handleSendMessage = async (textToSend?: string, attachmentsToSend?: Attachment[]) => {
    const text = (textToSend || composerInput).trim();
    if (!text && (!attachmentsToSend || attachmentsToSend.length === 0)) return;

    let currentChatId = activeChatId;
    let currentChats = [...chats];

    // Create session if none is active or history is empty
    if (!currentChatId) {
      const firstFewWords = text ? text.split(' ').slice(0, 4).join(' ') : 'New Conversation';
      const newChat: Chat = {
        id: `chat-${Date.now()}`,
        title: firstFewWords || 'New Conversation',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        messageTree: {},
        activeLeafId: null
      };
      currentChats = [newChat, ...currentChats];
      currentChatId = newChat.id;
      setActiveChatId(newChat.id);
      Storage.saveActiveChatId(newChat.id);
    }

    // Append User message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      attachments: attachmentsToSend
    };

    // Update active chat title if it's default
    const chatIndex = currentChats.findIndex(c => c.id === currentChatId);
    let updatedChat: Chat | undefined;
    if (chatIndex !== -1) {
      const activeChat = currentChats[chatIndex];
      if (activeChat.messages.length === 0 && activeChat.title.startsWith('New Conversation')) {
        const firstFewWords = text ? text.split(' ').slice(0, 4).join(' ') : 'New Conversation';
        activeChat.title = firstFewWords || 'New Conversation';
      }
      
      const upgraded = upgradeChatToTree(activeChat);
      const parentId = upgraded.activeLeafId || null;
      updatedChat = addMessageToTree(upgraded, userMessage, parentId);
      currentChats[chatIndex] = updatedChat;
    }

    setChats(currentChats);
    if (updatedChat) {
      Storage.saveChat(updatedChat);
    }
    setComposerInput('');

    // Trigger completion stream
    if (currentChatId) {
      if (settings.isBrowserAgentEnabled) {
        await triggerBrowserAgentLoop(currentChats, currentChatId, text);
      } else {
        await triggerStreamingResponse(currentChats, currentChatId);
      }
    }
  };

  // Message Editing: Re-trigger completion from that point onward (or save assistant in-place)
  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeChatId) return;

    const chatIndex = chats.findIndex(c => c.id === activeChatId);
    if (chatIndex === -1) return;

    const activeChat = upgradeChatToTree(chats[chatIndex]);
    const tree = { ...activeChat.messageTree };
    const targetNode = tree[messageId];
    if (!targetNode) return;

    if (targetNode.role === 'assistant') {
      // In-place edit for Assistant response
      tree[messageId] = {
        ...targetNode,
        content: newContent,
        timestamp: new Date().toISOString()
      };
      
      const messages = reconstructActivePath(tree, activeChat.activeLeafId);
      const updatedChat = {
        ...activeChat,
        messageTree: tree,
        messages,
        updatedAt: new Date().toISOString()
      };
      
      const updatedChats = chats.map(c =>
        c.id === activeChatId ? updatedChat : c
      );
      
      setChats(updatedChats);
      Storage.saveChat(updatedChat);
      return;
    }

    // Create a NEW user message node (the branch sibling)
    const newMsgId = `msg-${Date.now()}`;
    const parentId = targetNode.parentId; // It responds to the same parent!
    const newMsg: Message = {
      id: newMsgId,
      role: 'user',
      content: newContent,
      timestamp: new Date().toISOString()
    };

    const upgradedChat = addMessageToTree(activeChat, newMsg, parentId);

    const updatedChats = chats.map(c =>
      c.id === activeChatId ? upgradedChat : c
    );

    setChats(updatedChats);
    Storage.saveChat(upgradedChat);

    // Re-trigger streaming response
    await triggerStreamingResponse(updatedChats, activeChatId);
  };

  // Message Deletion: Remove message from tree, clean up subtrees, and update active path
  const handleDeleteMessage = (messageId: string) => {
    if (!activeChatId) return;

    setConfirmDialog({
      title: 'Delete message',
      message: 'Delete this message and any replies in its branch? This cannot be undone.',
      onConfirm: () => {
        performDeleteMessage(messageId);
        setConfirmDialog(null);
      }
    });
  };

  const performDeleteMessage = (messageId: string) => {
    if (!activeChatId) return;

    const chatIndex = chats.findIndex(c => c.id === activeChatId);
    if (chatIndex === -1) return;

    const activeChat = upgradeChatToTree(chats[chatIndex]);
    const tree = { ...activeChat.messageTree };
    
    const nodeToDelete = tree[messageId];
    if (!nodeToDelete) return;

    // 1. Gather all descendants of this node to delete them as well (sub-branch deletion)
    const idsToDelete = new Set<string>([messageId]);
    const queue = [...(nodeToDelete.children || [])];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (tree[currentId]) {
        idsToDelete.add(currentId);
        queue.push(...(tree[currentId].children || []));
      }
    }

    // 2. Remove this node's reference from its parent's children list
    const parentId = nodeToDelete.parentId;
    if (parentId && tree[parentId]) {
      const parentNode = { ...tree[parentId] };
      parentNode.children = parentNode.children.filter(id => id !== messageId);
      tree[parentId] = parentNode;
    }

    // 3. Delete all gathered nodes from the tree
    idsToDelete.forEach(id => {
      delete tree[id];
    });

    // 4. Update the activeLeafId if it or any of its children lay on the deleted subtree
    let activeLeafId = activeChat.activeLeafId;
    if (activeLeafId && idsToDelete.has(activeLeafId)) {
      // Fallback active leaf to the parent of the deleted node
      activeLeafId = parentId;
    }

    // If activeLeafId is null or missing, select any remaining leaf
    if (!activeLeafId || !tree[activeLeafId]) {
      const leaves = Object.values(tree).filter(n => !n.children || n.children.length === 0);
      if (leaves.length > 0) {
        activeLeafId = leaves[leaves.length - 1].id;
      } else {
        activeLeafId = null;
      }
    }

    // 5. Reconstruct path
    const messages = reconstructActivePath(tree, activeLeafId);

    const updatedChat = {
      ...activeChat,
      messageTree: tree,
      activeLeafId,
      messages,
      updatedAt: new Date().toISOString()
    };

    const updatedChats = chats.map(c =>
      c.id === activeChatId ? updatedChat : c
    );

    setChats(updatedChats);
    Storage.saveChat(updatedChat);
  };

  // Message Regeneration: Retry completion from specified message or active leaf
  const handleRegenerateResponse = async (targetMessageId?: string) => {
    if (!activeChatId || isGenerating) return;

    const chatIndex = chats.findIndex(c => c.id === activeChatId);
    if (chatIndex === -1) return;

    const activeChat = upgradeChatToTree(chats[chatIndex]);
    const targetId = targetMessageId ?? activeChat.activeLeafId;
    if (!targetId) return;
    const tree = { ...activeChat.messageTree };
    const targetNode = tree[targetId];
    if (!targetNode) return;

    let parentId: string | null = null;
    
    if (targetNode.role === 'assistant') {
      parentId = targetNode.parentId; // The user message node that this responded to
    } else if (targetNode.role === 'user') {
      parentId = targetNode.id;
    }

    if (!parentId || !tree[parentId]) return;

    const updatedChat = {
      ...activeChat,
      activeLeafId: parentId,
      messages: reconstructActivePath(tree, parentId)
    };

    const updatedChats = chats.map(c =>
      c.id === activeChatId ? updatedChat : c
    );

    setChats(updatedChats);
    Storage.saveChat(updatedChat);

    // Now trigger completion under parentId
    await triggerStreamingResponse(updatedChats, activeChatId);
  };

  // Helper to find the active leaf node under a given node
  const findActiveLeaf = (nodeId: string, tree: Record<string, MessageNode>): string => {
    let current = tree[nodeId];
    while (current && current.children && current.children.length > 0) {
      // Pick the last child (most recent branch) by default
      current = tree[current.children[current.children.length - 1]];
    }
    return current ? current.id : nodeId;
  };

  const handleSwitchBranch = (messageId: string) => {
    if (!activeChatId) return;

    let updatedChat: Chat | undefined;
    setChats(prevChats => {
      const updatedChats = prevChats.map(c => {
        if (c.id === activeChatId) {
          const upgraded = upgradeChatToTree(c);
          const tree = upgraded.messageTree || {};
          
          if (!tree[messageId]) return c;
          
          const newActiveLeafId = findActiveLeaf(messageId, tree);
          const messages = reconstructActivePath(tree, newActiveLeafId);
          
          updatedChat = {
            ...upgraded,
            activeLeafId: newActiveLeafId,
            messages,
            updatedAt: new Date().toISOString()
          };
          return updatedChat;
        }
        return c;
      });
      return updatedChats;
    });
    if (updatedChat) {
      Storage.saveChat(updatedChat);
    }
  };

  const handlePromptsChanged = () => {
    setCustomPrompts(Storage.getCustomPrompts());
  };

  const handleBackupImported = async () => {
    const savedChats = await Storage.getChats();
    const savedSettings = Storage.getSettings();
    const savedPrompts = Storage.getCustomPrompts();
    const savedActiveChatId = Storage.getActiveChatId();

    setChats(savedChats);
    setSettings(savedSettings);
    setCustomPrompts(savedPrompts);

    if (savedActiveChatId && savedChats.some(c => c.id === savedActiveChatId)) {
      setActiveChatId(savedActiveChatId);
    } else if (savedChats.length > 0) {
      setActiveChatId(savedChats[0].id);
      Storage.saveActiveChatId(savedChats[0].id);
    } else {
      setActiveChatId(null);
      Storage.saveActiveChatId(null);
    }

    showToast('Global backup history successfully imported.', 'success');
  };

  const handleSettingsSaved = (newSettings: Settings) => {
    setSettings(newSettings);
    showToast('Settings saved successfully.', 'success');
  };

  const activeChat = chats.find(c => c.id === activeChatId) || null;
  const userPrompts = activeChat?.messages.filter(m => m.role === 'user').map(m => m.content) || [];

  if (!isChatsLoaded) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground">
        <div className="relative flex flex-col items-center justify-center p-8 rounded-xl border border-border bg-card shadow-lg max-w-sm w-full mx-4 overflow-hidden">
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-primary/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-chart-2/10 rounded-full blur-3xl" />
          
          <div className="relative flex items-center justify-center h-16 w-16 rounded-xl bg-primary text-primary-foreground shadow-md mb-5">
            <span className="text-2xl font-black tracking-tighter select-none">C</span>
            <div className="absolute -inset-1.5 rounded-[18px] border-2 border-dashed border-primary/40 animate-[spin_20s_linear_infinite]" />
          </div>
          
          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans">Context AI</h1>
          <p className="text-[11px] text-muted-foreground tracking-widest uppercase font-bold mt-1 font-sans">Privacy-First AI Chat</p>
          
          <div className="mt-8 flex flex-col items-center gap-2 w-full">
            <div className="h-1 w-28 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-[loading-bar_1.5s_infinite_ease-in-out]" style={{ width: '40%' }} />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground animate-pulse font-sans">Initializing secure storage...</span>
          </div>
        </div>
        
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes loading-bar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(250%); }
          }
        `}} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
      
      {/* Dynamic Slide-in Toast notifications */}
      {toast && (
        <div className={`fixed right-6 top-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 animate-fade-in ${
          toast.type === 'error'
            ? 'bg-destructive/10 border-destructive/30 text-destructive'
            : 'bg-primary/10 border-primary/30 text-foreground'
        }`}>
          <AlertCircle className={`h-5 w-5 shrink-0 ${toast.type === 'success' ? 'text-primary' : ''}`} />
          <span className="text-xs font-semibold select-text">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Dismiss toast"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="fixed inset-0" onClick={() => setConfirmDialog(null)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
            className="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xl"
          >
            <h3 id="confirm-dialog-title" className="text-sm font-semibold text-foreground">{confirmDialog.title}</h3>
            <p id="confirm-dialog-desc" className="mt-2 text-xs text-muted-foreground leading-relaxed">{confirmDialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar history */}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        settings={settings}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSchedules={() => setSchedulesOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => {
          const next = !isSidebarCollapsed;
          setIsSidebarCollapsed(next);
          Storage.saveSidebarCollapsed(next);
        }}
        theme={theme}
        onThemeChanged={(newTheme) => {
          setTheme(newTheme);
          Storage.saveTheme(newTheme);
        }}
      />

      <ErrorBoundary fallbackTitle="Chat View Failed to Render">
        <ChatArea
          chat={activeChat}
          onSendMessage={handleSendMessage}
          isGenerating={isGenerating}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onRegenerateResponse={handleRegenerateResponse}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => {
            const next = !isSidebarCollapsed;
            setIsSidebarCollapsed(next);
            Storage.saveSidebarCollapsed(next);
          }}
          onSwitchBranch={handleSwitchBranch}
          onOpenBrowserModal={(sid) => {
            setBrowserModalSessionId(sid || 'interactive');
            setBrowserModalOpen(true);
          }}
        >
          <Composer
            input={composerInput}
            onChangeInput={setComposerInput}
            onSend={(attachments) => handleSendMessage(undefined, attachments)}
            isGenerating={isGenerating}
            onStop={handleStopGenerating}
            inputRef={textareaRef}
            userPrompts={userPrompts}
            onError={(msg) => showToast(msg, 'error')}
            settings={settings}
            onSettingsChanged={setSettings}
            activePromptId={activePromptId}
            onSelectPromptId={(id) => {
              setActivePromptId(id);
              Storage.saveActivePromptId(id);
            }}
            customPrompts={customPrompts}
          />
        </ChatArea>
      </ErrorBoundary>

      {/* Settings Panel */}
      {settingsOpen && (
        <ErrorBoundary fallbackTitle="Settings Modal Failed to Render">
          <Suspense fallback={<ModalFallback />}>
            <SettingsModal
              isOpen={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              activeChat={activeChat}
              onSettingsSaved={handleSettingsSaved}
              onPromptsChanged={handlePromptsChanged}
              onBackupImported={handleBackupImported}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Keyboard Shortcuts Overlay */}
      {shortcutsOpen && (
        <Suspense fallback={<ModalFallback />}>
          <ShortcutsModal
            isOpen={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
          />
        </Suspense>
      )}


      {/* Command Palette Overlay */}
      {commandPaletteOpen && (
        <Suspense fallback={<ModalFallback />}>
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            chats={chats}
            activeChatId={activeChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            settings={settings}
            onSettingsChanged={setSettings}
            activePromptId={activePromptId}
            onSelectPromptId={(id) => {
              setActivePromptId(id);
              Storage.saveActivePromptId(id);
            }}
            customPrompts={customPrompts}
            theme={theme}
            onThemeChanged={(newTheme) => {
              setTheme(newTheme);
              Storage.saveTheme(newTheme);
            }}
            onToggleSidebar={() => {
              const next = !isSidebarCollapsed;
              setIsSidebarCollapsed(next);
              Storage.saveSidebarCollapsed(next);
            }}
            onToggleSettings={() => setSettingsOpen(true)}
            onShowToast={(msg, type) => showToast(msg, type)}
            onOpenSchedules={() => setSchedulesOpen(true)}
            onOpenBrowserModal={() => setBrowserModalOpen(true)}
          />
        </Suspense>
      )}


      {/* Task Schedules Dashboard */}
      {schedulesOpen && (
        <ErrorBoundary fallbackTitle="Task Schedules Dashboard Failed to Render">
          <Suspense fallback={<ModalFallback />}>
            <SchedulesPanel
              isOpen={schedulesOpen}
              onClose={() => setSchedulesOpen(false)}
              chats={chats}
              onShowToast={(msg, type) => showToast(msg, type)}
              onOpenBrowserModal={(sid) => {
                setBrowserModalSessionId(sid || 'interactive');
                setBrowserModalOpen(true);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Browser View Modal */}
      {browserModalOpen && (
        <ErrorBoundary fallbackTitle="Browser View Modal Failed to Render">
          <Suspense fallback={<ModalFallback />}>
            <BrowserModal
              isOpen={browserModalOpen}
              onClose={() => setBrowserModalOpen(false)}
              activeChatId={activeChatId}
              activeChatTitle={activeChat?.title}
              initialSessionId={browserModalSessionId}
              isBrowserAgentRunning={isGenerating && !!activeChat?.messages.some(m => m.browserSession && (m.browserSession.status === 'running' || m.browserSession.status === 'paused'))}
              onShowToast={showToast}
            />
          </Suspense>
        </ErrorBoundary>
      )}

    </div>
  );
}

export default App;
