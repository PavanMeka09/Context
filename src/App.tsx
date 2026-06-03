import { useState, useEffect, useRef, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Composer } from './components/Composer';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { RAGPanel } from './components/RAGPanel';
import { CommandPalette } from './components/CommandPalette';
import { SchedulesPanel } from './components/SchedulesPanel';
import { BrowserModal } from './components/BrowserModal';
import { vectorDb } from './utils/vectorDb';
import { PRESET_PROMPTS, Storage, reconstructActivePath, upgradeChatToTree } from './utils/storage';
import type { Chat, Message, MessageNode, Settings, SystemPrompt, Attachment, BrowserSessionData } from './utils/storage';
import { streamChatCompletion, generateTextCompletion } from './utils/api';
import { searchSearxng, classifySearchHeuristically } from './utils/searxng';
import { AlertCircle, X } from 'lucide-react';

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
  const [chats, setChats] = useState<Chat[]>(() => Storage.getChats());
  const [settings, setSettings] = useState<Settings>(() => Storage.getSettings());
  const [customPrompts, setCustomPrompts] = useState<SystemPrompt[]>(() => Storage.getCustomPrompts());
  const [activePromptId, setActivePromptId] = useState<string>(() => Storage.getActivePromptId());
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const savedChats = Storage.getChats();
    const savedActiveChatId = Storage.getActiveChatId();
    if (savedActiveChatId && savedChats.some(c => c.id === savedActiveChatId)) {
      return savedActiveChatId;
    } else if (savedChats.length > 0) {
      return savedChats[0].id;
    }
    return null;
  });
  
  // Composer states
  const [composerInput, setComposerInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ragPanelOpen, setRagPanelOpen] = useState(false);
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

  // Refs for abort controllers and focus management
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync active chat id in localStorage if it wasn't saved yet but defaulted
  useEffect(() => {
    const savedChats = Storage.getChats();
    const savedActiveChatId = Storage.getActiveChatId();
    if (savedChats.length > 0 && (!savedActiveChatId || !savedChats.some(c => c.id === savedActiveChatId))) {
      Storage.saveActiveChatId(savedChats[0].id);
    }
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
    Storage.saveChatsImmediately(updatedChats);
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

      // Help Shortcut: ?
      if (e.key === '?' && !isInputFocused) {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
      }

      // Escape key to dismiss modals
      if (e.key === 'Escape') {
        setSettingsOpen(false);
        setShortcutsOpen(false);
        setRagPanelOpen(false);
        setCommandPaletteOpen(false);
        setBrowserModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewChat]);

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

interface SyncEvent {
  id: string;
  chatId: string;
  isNewChat: boolean;
  chatTitle: string;
  userMsg: Message;
  assistantMsg: Message;
  timestamp: string;
}

  // Background polling to sync schedules execution results
  useEffect(() => {
    const pollSchedulesSync = async () => {
      try {
        const res = await fetch('/api/schedules/sync');
        if (!res.ok) return;
        const events: SyncEvent[] = await res.json();
        if (events.length === 0) return;

        setChats(prevChats => {
          let updatedChats = [...prevChats];

          events.forEach((event: SyncEvent) => {
            const chatIndex = updatedChats.findIndex(c => c.id === event.chatId);
            
            if (chatIndex !== -1) {
              // Append to existing chat
              const existingChat = updatedChats[chatIndex];
              let chat = upgradeChatToTree(existingChat);
              const parentId = chat.activeLeafId || null;
              chat = addMessageToTree(chat, event.userMsg, parentId);
              chat = addMessageToTree(chat, event.assistantMsg, event.userMsg.id);
              updatedChats[chatIndex] = chat;
            } else {
              // Create new chat
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

          Storage.saveChatsImmediately(updatedChats);
          return updatedChats;
        });

        showToast(`Synced ${events.length} background task execution results!`, 'success');
      } catch (err) {
        console.error('Error polling schedules sync:', err);
      }
    };

    // Run immediately, then poll every 10 seconds
    pollSchedulesSync();
    const interval = setInterval(pollSchedulesSync, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectChat = (id: string) => {
    setActiveChatId(id);
    Storage.saveActiveChatId(id);
    setComposerInput('');
    // Focus composer
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleDeleteChat = (id: string) => {
    const updatedChats = chats.filter(c => c.id !== id);
    setChats(updatedChats);
    Storage.saveChatsImmediately(updatedChats);

    if (activeChatId === id) {
      if (updatedChats.length > 0) {
        setActiveChatId(updatedChats[0].id);
        Storage.saveActiveChatId(updatedChats[0].id);
      } else {
        setActiveChatId(null);
        Storage.saveActiveChatId(null);
      }
    }
  };

  const handleRenameChat = (id: string, newTitle: string) => {
    const updatedChats = chats.map(c =>
      c.id === id ? { ...c, title: newTitle, updatedAt: new Date().toISOString() } : c
    );
    setChats(updatedChats);
    Storage.saveChatsImmediately(updatedChats);
  };

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
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

    // Asynchronously gather contexts
    let ragContext = '';
    if (settings.isRagEnabled && userQuery) {
      try {
        const matches = await vectorDb.searchSimilarChunks(userQuery);
        if (matches.length > 0) {
          ragContext = matches.map(m => `--- [Document: ${m.chunk.docName} (Similarity: ${(m.score * 100).toFixed(0)}%)] ---\n${m.chunk.text}`).join('\n\n');
        }
      } catch (err) {
        console.error('Failed to perform local RAG similarity search:', err);
      }
    }

    // Create stream message placeholder
    const streamMessageId = `msg-stream-${Date.now()}`;
    const initialContent = settings.isWebSearchEnabled && userQuery
      ? `<search_status query="${userQuery.replace(/"/g, '&quot;')}" status="searching" />`
      : '';

    const placeholderMessage: Message = {
      id: streamMessageId,
      role: 'assistant',
      content: initialContent,
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
    let webSearchContext = '';

    if (settings.isWebSearchEnabled && userQuery) {
      try {
        // Run classification and query optimization
        const { shouldSearch, searchQuery } = classifySearchHeuristically(userQuery);

        if (shouldSearch && searchQuery) {
          // Update visual placeholder query in state
          setChats(prevChats =>
            prevChats.map(c => {
              if (c.id === targetChatId) {
                const upgraded = upgradeChatToTree(c);
                const tree = { ...upgraded.messageTree };
                if (tree[streamMessageId]) {
                  tree[streamMessageId] = {
                    ...tree[streamMessageId],
                    content: `<search_status query="${searchQuery.replace(/"/g, '&quot;')}" status="searching" />`
                  };
                }
                const messages = reconstructActivePath(tree, upgraded.activeLeafId);
                return { ...upgraded, messageTree: tree, messages };
              }
              return c;
            })
          );

          // Perform Search
          const results = await searchSearxng(searchQuery, settings.searxngUrl);
          
          let scrapedPages: { url: string; content: string }[] = [];
          if (results.length > 0) {
            try {
              // Update visual placeholder status to scraping
              setChats(prevChats =>
                prevChats.map(c => {
                  if (c.id === targetChatId) {
                    const upgraded = upgradeChatToTree(c);
                    const tree = { ...upgraded.messageTree };
                    if (tree[streamMessageId]) {
                      tree[streamMessageId] = {
                        ...tree[streamMessageId],
                        content: `<search_status query="${searchQuery.replace(/"/g, '&quot;')}" status="scraping" />`
                      };
                    }
                    const messages = reconstructActivePath(tree, upgraded.activeLeafId);
                    return { ...upgraded, messageTree: tree, messages };
                  }
                  return c;
                })
              );

              // Concurrently scrape the top 2 search results to build rich context
              const scrapePromises = results.slice(0, 2).map(async (r) => {
                try {
                  const res = await fetch('/api/scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: r.url }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.content) {
                      return { url: r.url, content: data.content };
                    }
                  }
                } catch (e) {
                  console.error(`Failed to scrape ${r.url}:`, e);
                }
                return null;
              });

              const scrapeResults = await Promise.all(scrapePromises);
              scrapedPages = scrapeResults.filter((p): p is { url: string; content: string } => p !== null);
            } catch (e) {
              console.error('Failed to perform page scraping:', e);
            }
          }

          // Format search results with full scraped content when available
          webSearchContext = results.map((r, idx) => {
            const scraped = scrapedPages.find(p => p.url === r.url);
            return `[Web Result #${idx + 1}]
Title: ${r.title}
URL: ${r.url}
${scraped ? `Full Page Text Content:\n${scraped.content}` : `Excerpt: ${r.content}`}`;
          }).join('\n\n');

          searchTagPrefix = `<search_status query="${searchQuery.replace(/"/g, '&quot;')}" status="done">${JSON.stringify(results)}</search_status>\n\n`;
        } else {
          // Bypassed search
          searchTagPrefix = '';
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Search failed';
        console.error('Failed to perform SearXNG web search:', err);
        searchTagPrefix = `<search_status query="${userQuery.replace(/"/g, '&quot;')}" status="failed" error="${errorMsg}"></search_status>\n\n`;
      }

      // Update placeholder with final search tag prefix in tree
      setChats(prevChats =>
        prevChats.map(c => {
          if (c.id === targetChatId) {
            const upgraded = upgradeChatToTree(c);
            const tree = { ...upgraded.messageTree };
            if (tree[streamMessageId]) {
              tree[streamMessageId] = {
                ...tree[streamMessageId],
                content: searchTagPrefix
              };
            }
            const messages = reconstructActivePath(tree, upgraded.activeLeafId);
            return { ...upgraded, messageTree: tree, messages };
          }
          return c;
        })
      );
    }

    let systemInstruction = getSystemPromptText();
    
    // Inject web search context if available
    if (webSearchContext) {
      systemInstruction = `${systemInstruction}\n\n[REAL-TIME WEB SEARCH CONTEXT]\nUse the following real-time web search results from SearXNG to answer the user's prompt. Rely on these search results to provide accurate, up-to-date information:\n${webSearchContext}`;
    }
    
    // Inject RAG context if available
    if (ragContext) {
      systemInstruction = `${systemInstruction}\n\n[RELEVANT LOCAL MEMORY CONTEXT]\nUse the following retrieved excerpts from the user's local documents to answer their prompt. Rely strictly on this context if it directly answers the question:\n${ragContext}`;
    }

    // Exclude system message and the stream message placeholder from API history
    const apiHistory = activeChat.messages;

    let accumulatedContent = '';

    await streamChatCompletion(
      settings,
      apiHistory,
      systemInstruction,
      {
        onChunk: (chunk: string) => {
          accumulatedContent += chunk;
          setChats(prevChats =>
            prevChats.map(c => {
              if (c.id === targetChatId) {
                const upgraded = upgradeChatToTree(c);
                const tree = { ...upgraded.messageTree };
                if (tree[streamMessageId]) {
                  tree[streamMessageId] = {
                    ...tree[streamMessageId],
                    content: searchTagPrefix + accumulatedContent
                  };
                }
                const messages = reconstructActivePath(tree, upgraded.activeLeafId);
                return {
                  ...upgraded,
                  messageTree: tree,
                  messages
                };
              }
              return c;
            })
          );
        },
        onDone: (finalText: string) => {
          setIsGenerating(false);
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
                return {
                  ...upgraded,
                  messageTree: tree,
                  messages,
                  updatedAt: new Date().toISOString()
                };
              }
              return c;
            });
            Storage.saveChatsImmediately(finalChats);
            return finalChats;
          });

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
          
          // Remove placeholder and restore chat session
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
                
                return {
                  ...upgraded,
                  messageTree: tree,
                  activeLeafId: activeLeaf,
                  messages
                };
              }
              return c;
            });
            Storage.saveChatsImmediately(rolledBackChats);
            return rolledBackChats;
          });
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
    let currentChat = addMessageToTree(activeChat, placeholderMessage, parentId);
    
    setChats(prevChats =>
      prevChats.map(c => (c.id === targetChatId ? currentChat : c))
    );

    let currentUrl: string;
    let currentTitle: string;
    const steps: BrowserSessionData['steps'] = [];
    let loopCount = 0;
    const maxLoops = 15;
    let isFinished = false;
    let extractedContext = '';

    // Launch/ensure browser session
    try {
      const initRes = await fetch(`/api/browser/state?sessionId=${encodeURIComponent(targetChatId)}`);
      if (!initRes.ok) {
        if (initRes.status === 500) {
          try {
            const errData = await initRes.json();
            throw new Error(errData.error || 'Puppeteer failed to launch');
          } catch {
            throw new Error('Browser server internal error (500)');
          }
        } else {
          throw new Error(`Browser companion server is not running (HTTP ${initRes.status}). Please start it with "npm run server".`);
        }
      }
      const initState = await initRes.json();
      currentUrl = initState.url || '';
      currentTitle = initState.title || 'Blank Page';
      
      placeholderMessage.browserSession = {
        url: currentUrl,
        title: currentTitle,
        status: 'running',
        steps: [],
        screenshotTimestamp: Date.now()
      };
      
      currentChat = addMessageToTree(activeChat, placeholderMessage, parentId);
      setChats(prevChats =>
        prevChats.map(c => (c.id === targetChatId ? currentChat : c))
      );
    } catch (e) {
      const error = e as Error;
      console.error('Failed to connect to browser server', error);
      setIsGenerating(false);
      showToast(error.message || 'Browser companion server is not running. Please start it with "npm run server".', 'error');
      
      // Rollback chat session
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
            
            return {
              ...upgraded,
              messageTree: tree,
              activeLeafId: activeLeaf,
              messages
            };
          }
          return c;
        });
        Storage.saveChatsImmediately(rolledBackChats);
        return rolledBackChats;
      });
      return;
    }

    while (!isFinished && loopCount < maxLoops) {
      if (controller.signal.aborted) {
        throw new Error('Automation stopped by user');
      }
      loopCount++;
      
      try {
        // 1. Fetch current browser state
        const stateRes = await fetch(`/api/browser/state?sessionId=${encodeURIComponent(targetChatId)}`);
        if (!stateRes.ok) throw new Error('Failed to fetch browser state');
        const browserState = await stateRes.json();
        currentUrl = browserState.url;
        currentTitle = browserState.title;
        const elements = browserState.elements || [];

        // Generate step history context for the LLM
        const formattedSteps = steps.map((s, idx) => {
          return `- Step ${idx + 1}: Thought: "${s.thought}" -> Action: ${s.action}${s.targetId ? ` on element "${s.targetId}"` : ''}${s.text ? ` with "${s.text}"` : ''}${s.url ? ` to "${s.url}"` : ''} (${s.status === 'success' ? 'Success' : `Failed: ${s.logMessage || 'unknown error'}`})`;
        }).join('\n');

        // 2. Prompt LLM to choose next action
        const systemPrompt = `You are Context's Browser Agent. Your task is to achieve the user's goal by executing step-by-step browser actions.
Goal: "${userGoal}"
Current URL: ${currentUrl || 'about:blank'}
Page Title: ${currentTitle || 'No Title'}

List of interactive elements on the current page:
${JSON.stringify(elements, null, 2)}

${extractedContext ? `Extracted Page Text Context:\n${extractedContext}\n` : ''}

${steps.length > 0 ? `Execution History of Previous Steps:\n${formattedSteps}\n` : ''}

Available Actions:
1. { "action": "navigate", "url": "https://..." }
2. { "action": "click", "targetId": "element-id-from-list" }
3. { "action": "type", "targetId": "element-id-from-list", "text": "text to type" }
4. { "action": "hover", "targetId": "element-id-from-list" }
5. { "action": "back" }
6. { "action": "key", "targetId": "element-id-from-list", "text": "keyName" }
7. { "action": "scroll", "text": "up" | "down" }
8. { "action": "wait", "text": "milliseconds" }
9. { "action": "extract" } - Extract text content from the current page.
10. { "action": "done", "text": "Final detailed answer / summary of what you accomplished" }
11. { "action": "fail", "text": "Error explanation / why it was not possible to complete the task" }

Select the next single action to take. Provide your thought process (concise, written in third-person, e.g. "I will click the 'Sign In' button") and the next action in JSON format:
{
  "thought": "Thought text...",
  "action": "click" | "navigate" | "type" | "hover" | "back" | "key" | "scroll" | "wait" | "extract" | "done" | "fail",
  "targetId": "context-el-...",
  "text": "...",
  "url": "..."
}

Respond ONLY with a JSON object. Do not include markdown code block wrappers (like \`\`\`json). No explanations, no text before or after the JSON.`;

        const screenshot = browserState.screenshot || '';

        const llmResponse = await generateTextCompletion(
          settings,
          [{
            id: `browser-loop-${loopCount}`,
            role: 'user',
            content: `What is the next action to take to achieve my goal?`,
            timestamp: new Date().toISOString(),
            attachments: screenshot ? [{
              id: `screenshot-${loopCount}`,
              name: 'screenshot.png',
              type: 'image/png',
              data: screenshot,
              size: 0
            }] : []
          }],
          systemPrompt
        );

        if (!llmResponse) throw new Error('Empty response from LLM');

        let cleanLlm = llmResponse.trim();
        if (cleanLlm.startsWith('```json')) {
          cleanLlm = cleanLlm.slice(7);
        } else if (cleanLlm.startsWith('```')) {
          cleanLlm = cleanLlm.slice(3);
        }
        if (cleanLlm.endsWith('```')) {
          cleanLlm = cleanLlm.slice(0, -3);
        }
        cleanLlm = cleanLlm.trim();

        const decision = JSON.parse(cleanLlm);
        if (!decision || !decision.action) throw new Error('Invalid JSON decision format from LLM');

        // 3. Add step to list as pending
        const stepId = `step-${loopCount}-${Date.now()}`;
        const newStep: {
          id: string;
          thought?: string;
          action: string;
          targetId?: string;
          text?: string;
          url?: string;
          status: 'pending' | 'success' | 'error';
          logMessage?: string;
          timestamp: string;
        } = {
          id: stepId,
          thought: decision.thought || 'Executing next step...',
          action: decision.action,
          targetId: decision.targetId,
          text: decision.text,
          url: decision.url,
          status: 'pending',
          timestamp: new Date().toISOString()
        };
        steps.push(newStep);

        // Update UI state
        placeholderMessage.browserSession = {
          url: currentUrl,
          title: currentTitle,
          status: 'running',
          steps: [...steps],
          screenshotTimestamp: Date.now()
        };
        currentChat = addMessageToTree(activeChat, placeholderMessage, parentId);
        setChats(prevChats =>
          prevChats.map(c => (c.id === targetChatId ? currentChat : c))
        );

        // 4. Handle exit conditions (done/fail)
        if (decision.action === 'done' || decision.action === 'fail') {
          isFinished = true;
          newStep.status = 'success';
          newStep.logMessage = decision.action === 'done' ? 'Completed task' : 'Failed task';

          placeholderMessage.content = decision.text || (decision.action === 'done' ? 'Browser automation task completed successfully.' : 'Browser automation failed.');
          placeholderMessage.browserSession = {
            url: currentUrl,
            title: currentTitle,
            status: decision.action === 'done' ? 'completed' : 'failed',
            steps: [...steps],
            screenshotTimestamp: Date.now()
          };

          currentChat = addMessageToTree(activeChat, placeholderMessage, parentId);
          setChats(prevChats => {
            const finalChats = prevChats.map(c => (c.id === targetChatId ? currentChat : c));
            Storage.saveChatsImmediately(finalChats);
            return finalChats;
          });

          fetch('/api/browser/close', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: targetChatId })
          }).catch(err => console.error(err));
          abortControllerRef.current = null;
          break;
        }

        // 5. Execute action via API request
        try {
          const actionRes = await fetch('/api/browser/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: decision.action,
              targetId: decision.targetId,
              text: decision.text,
              url: decision.url,
              stepId: stepId,
              sessionId: targetChatId
            })
          });

          if (!actionRes.ok) {
            const errData = await actionRes.json();
            throw new Error(errData.error || 'Action execution failed');
          }

          const actionResult = await actionRes.json();
          
          newStep.status = 'success';
          newStep.logMessage = actionResult.logMessage;
          
          if (decision.action === 'extract' && actionResult.data) {
            extractedContext += `\n[Page Data from ${actionResult.url || currentUrl}]:\n${actionResult.data.slice(0, 1500)}\n`;
          }

          currentUrl = actionResult.url || currentUrl;
          currentTitle = actionResult.title || currentTitle;
        } catch (stepErr) {
          console.error(`Step error:`, stepErr);
          const err = stepErr as Error;
          newStep.status = 'error';
          newStep.logMessage = err.message || 'Action execution failed';
        }

        placeholderMessage.browserSession = {
          url: currentUrl,
          title: currentTitle,
          status: 'running',
          steps: [...steps],
          screenshotTimestamp: Date.now()
        };
        currentChat = addMessageToTree(activeChat, placeholderMessage, parentId);
        setChats(prevChats =>
          prevChats.map(c => (c.id === targetChatId ? currentChat : c))
        );

        await new Promise(r => setTimeout(r, 1000));

      } catch (err) {
        const error = err as Error;
        console.error('Error during browser automation step:', error);
        
        if (steps.length > 0) {
          steps[steps.length - 1].status = 'error';
          steps[steps.length - 1].logMessage = `Error: ${error.message || 'Unknown error occurred'}`;
        } else {
          steps.push({
            id: `error-${Date.now()}`,
            thought: 'An error occurred during execution.',
            action: 'error',
            status: 'error',
            logMessage: error.message || 'Unknown error',
            timestamp: new Date().toISOString()
          });
        }

        placeholderMessage.content = `Browser automation failed: ${error.message || 'Unknown error'}`;
        placeholderMessage.browserSession = {
          url: currentUrl,
          title: currentTitle,
          status: 'failed',
          steps: [...steps],
          screenshotTimestamp: Date.now()
        };

        currentChat = addMessageToTree(activeChat, placeholderMessage, parentId);
        setChats(prevChats => {
          const finalChats = prevChats.map(c => (c.id === targetChatId ? currentChat : c));
          Storage.saveChatsImmediately(finalChats);
          return finalChats;
        });

        fetch('/api/browser/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: targetChatId })
        }).catch(closeErr => console.error(closeErr));
        abortControllerRef.current = null;
        break;
      }
    }

    setIsGenerating(false);
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
    if (chatIndex !== -1) {
      const activeChat = currentChats[chatIndex];
      if (activeChat.messages.length === 0 && activeChat.title.startsWith('New Conversation')) {
        const firstFewWords = text ? text.split(' ').slice(0, 4).join(' ') : 'New Conversation';
        activeChat.title = firstFewWords || 'New Conversation';
      }
      
      const upgraded = upgradeChatToTree(activeChat);
      const parentId = upgraded.activeLeafId || null;
      const updatedChat = addMessageToTree(upgraded, userMessage, parentId);
      currentChats[chatIndex] = updatedChat;
    }

    setChats(currentChats);
    Storage.saveChatsImmediately(currentChats);
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
      Storage.saveChatsImmediately(updatedChats);
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
    Storage.saveChatsImmediately(updatedChats);

    // Re-trigger streaming response
    await triggerStreamingResponse(updatedChats, activeChatId);
  };

  // Message Deletion: Remove message from tree, clean up subtrees, and update active path
  const handleDeleteMessage = (messageId: string) => {
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
    Storage.saveChatsImmediately(updatedChats);
  };

  // Message Regeneration: Truncate last assistant reply and retry
  const handleRegenerateResponse = async () => {
    if (!activeChatId || isGenerating) return;

    const chatIndex = chats.findIndex(c => c.id === activeChatId);
    if (chatIndex === -1) return;

    const activeChat = upgradeChatToTree(chats[chatIndex]);
    const lastMsgId = activeChat.activeLeafId;
    if (!lastMsgId) return;

    const tree = { ...activeChat.messageTree };
    const lastNode = tree[lastMsgId];
    if (!lastNode) return;

    let parentId: string | null = null;
    
    if (lastNode.role === 'assistant') {
      parentId = lastNode.parentId; // The user message node that this responded to
    } else if (lastNode.role === 'user') {
      parentId = lastNode.id;
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
    Storage.saveChatsImmediately(updatedChats);

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

    setChats(prevChats => {
      const updatedChats = prevChats.map(c => {
        if (c.id === activeChatId) {
          const upgraded = upgradeChatToTree(c);
          const tree = upgraded.messageTree || {};
          
          if (!tree[messageId]) return c;
          
          const newActiveLeafId = findActiveLeaf(messageId, tree);
          const messages = reconstructActivePath(tree, newActiveLeafId);
          
          return {
            ...upgraded,
            activeLeafId: newActiveLeafId,
            messages,
            updatedAt: new Date().toISOString()
          };
        }
        return c;
      });
      Storage.saveChatsImmediately(updatedChats);
      return updatedChats;
    });
  };

  const handlePromptsChanged = () => {
    setCustomPrompts(Storage.getCustomPrompts());
  };

  const handleBackupImported = () => {
    const savedChats = Storage.getChats();
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
      
      {/* Dynamic Slide-in Toast notifications */}
      {toast && (
        <div className={`fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl border px-4 py-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 animate-fade-in ${
          toast.type === 'error'
            ? 'bg-red-950/70 border-red-800/80 text-red-200'
            : 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200'
        }`}>
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-xs font-semibold select-text">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Dismiss toast"
          >
            <X className="h-4 w-4" />
          </button>
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
        onRenameChat={handleRenameChat}
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

      {/* Settings Panel */}
      {settingsOpen && (
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          activeChat={activeChat}
          onSettingsSaved={handleSettingsSaved}
          onPromptsChanged={handlePromptsChanged}
          onBackupImported={handleBackupImported}
        />
      )}

      {/* Keyboard Shortcuts Overlay */}
      {shortcutsOpen && (
        <ShortcutsModal
          isOpen={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
        />
      )}

      {/* RAG Memory Panel */}
      {ragPanelOpen && (
        <RAGPanel
          isOpen={ragPanelOpen}
          onClose={() => setRagPanelOpen(false)}
          isRagEnabled={!!settings.isRagEnabled}
          onToggleRag={(enabled) => {
            const newSettings = { ...settings, isRagEnabled: enabled };
            setSettings(newSettings);
            Storage.saveSettings(newSettings);
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Command Palette Overlay */}
      {commandPaletteOpen && (
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
          onToggleRAG={() => setRagPanelOpen(true)}
          onShowToast={(msg, type) => showToast(msg, type)}
        />
      )}

      {/* Task Schedules Dashboard */}
      {schedulesOpen && (
        <SchedulesPanel
          isOpen={schedulesOpen}
          onClose={() => setSchedulesOpen(false)}
          chats={chats}
          onShowToast={(msg, type) => showToast(msg, type)}
        />
      )}

      {/* Browser View Modal */}
      {browserModalOpen && (
        <BrowserModal
          isOpen={browserModalOpen}
          onClose={() => setBrowserModalOpen(false)}
          activeChatId={activeChatId}
          activeChatTitle={activeChat?.title}
          initialSessionId={browserModalSessionId}
          isBrowserAgentRunning={isGenerating && !!activeChat?.messages.some(m => m.browserSession && m.browserSession.status === 'running')}
        />
      )}

    </div>
  );
}

export default App;
