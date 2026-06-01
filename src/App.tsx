import { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Composer } from './components/Composer';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { RAGPanel } from './components/RAGPanel';
import { vectorDb } from './utils/vectorDb';
import { PRESET_PROMPTS, Storage, reconstructActivePath, upgradeChatToTree } from './utils/storage';
import type { Chat, Message, MessageNode, Settings, SystemPrompt, Attachment } from './utils/storage';
import { streamChatCompletion } from './utils/api';
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
    attachments: message.attachments
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
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({ provider: 'mock', apiKey: '', model: 'mock-smart' });
  const [customPrompts, setCustomPrompts] = useState<SystemPrompt[]>([]);
  const [activePromptId, setActivePromptId] = useState<string>('preset-general');
  
  // Composer states
  const [composerInput, setComposerInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ragPanelOpen, setRagPanelOpen] = useState(false);

  // Preference and accessibility states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => Storage.getSidebarCollapsed());
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>(() => Storage.getFontSize());
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => Storage.getTheme());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Elegant Toast alerts state
  const [toast, setToast] = useState<{ message: React.ReactNode; type: 'error' | 'success' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Refs for abort controllers and focus management
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Initial load
  useEffect(() => {
    const savedChats = Storage.getChats();
    const savedSettings = Storage.getSettings();
    const savedPrompts = Storage.getCustomPrompts();
    const savedActiveChatId = Storage.getActiveChatId();
    const savedActivePromptId = Storage.getActivePromptId();

    setChats(savedChats);
    setSettings(savedSettings);
    setCustomPrompts(savedPrompts);
    setActivePromptId(savedActivePromptId);

    // Validate active chat id in history
    if (savedActiveChatId && savedChats.some(c => c.id === savedActiveChatId)) {
      setActiveChatId(savedActiveChatId);
    } else if (savedChats.length > 0) {
      setActiveChatId(savedChats[0].id);
      Storage.saveActiveChatId(savedChats[0].id);
    }
  }, []);

  // Theme Sync Effect
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (t: 'dark' | 'light' | 'system') => {
      let activeTheme = t;
      if (t === 'system') {
        activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      root.setAttribute('data-theme', activeTheme);
    };

    applyTheme(theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chats]);

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

  const handleNewChat = () => {
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
      title: `New Chat Session`,
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
  };

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

  const handleSelectPrompt = (id: string) => {
    setActivePromptId(id);
    Storage.saveActivePromptId(id);
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
    
    if (settings.thinkingLevel && settings.thinkingLevel !== 'off') {
      const thinkingInstructions = {
        low: 'Before answering, you MUST include a short thought process inside a `<thinking>` block. Focus only on the core requirements.',
        medium: 'Before answering, you MUST include a comprehensive step-by-step thought process inside a `<thinking>` block. Explore the logic, potential edge cases, and architectural choices.',
        high: 'Before answering, you MUST conduct a highly detailed, rigorous, and exhaustive reasoning/analysis inside a `<thinking>` block. Deeply verify code syntax, edge cases, potential bugs, alternatives, and complexity analyses.'
      };
      return `${basePrompt}\n\n${thinkingInstructions[settings.thinkingLevel]}`;
    }
    
    return basePrompt;
  };

  // Main streaming loop
  const triggerStreamingResponse = async (chatList: Chat[], targetChatId: string, ragContext?: string) => {
    const activeChatIndex = chatList.findIndex(c => c.id === targetChatId);
    if (activeChatIndex === -1) return;

    const activeChat = upgradeChatToTree(chatList[activeChatIndex]);
    setIsGenerating(true);
    
    // Setup AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

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

    let systemInstruction = getSystemPromptText();
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
                    content: accumulatedContent
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
                    content: finalText,
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
      if (activeChat.messages.length === 0 && activeChat.title.startsWith('New Chat Session')) {
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

    let ragContext = '';
    if (settings.isRagEnabled && text) {
      try {
        const matches = await vectorDb.searchSimilarChunks(text);
        if (matches.length > 0) {
          ragContext = matches.map(m => `--- [Document: ${m.chunk.docName} (Similarity: ${(m.score * 100).toFixed(0)}%)] ---\n${m.chunk.text}`).join('\n\n');
        }
      } catch (err) {
        console.error('Failed to perform local RAG similarity search:', err);
      }
    }

    // Trigger completion stream
    if (currentChatId) {
      await triggerStreamingResponse(currentChats, currentChatId, ragContext);
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

    let ragContext = '';
    if (settings.isRagEnabled && newContent) {
      try {
        const matches = await vectorDb.searchSimilarChunks(newContent);
        if (matches.length > 0) {
          ragContext = matches.map(m => `--- [Document: ${m.chunk.docName} (Similarity: ${(m.score * 100).toFixed(0)}%)] ---\n${m.chunk.text}`).join('\n\n');
        }
      } catch (err) {
        console.error('Failed to perform local RAG similarity search:', err);
      }
    }

    // Re-trigger streaming response
    await triggerStreamingResponse(updatedChats, activeChatId, ragContext);
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

    const lastUserPrompt = parentId && tree[parentId] ? tree[parentId].content : '';
    let ragContext = '';
    if (settings.isRagEnabled && lastUserPrompt) {
      try {
        const matches = await vectorDb.searchSimilarChunks(lastUserPrompt);
        if (matches.length > 0) {
          ragContext = matches.map(m => `--- [Document: ${m.chunk.docName} (Similarity: ${(m.score * 100).toFixed(0)}%)] ---\n${m.chunk.text}`).join('\n\n');
        }
      } catch (err) {
        console.error('Failed to perform local RAG similarity search:', err);
      }
    }

    // Now trigger completion under parentId
    await triggerStreamingResponse(updatedChats, activeChatId, ragContext);
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
    <div 
      className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-200"
      style={{
        '--chat-font-size-user': fontSize === 'sm' ? '12px' : fontSize === 'lg' ? '16px' : '14px',
        '--chat-font-size-assistant': fontSize === 'sm' ? '13px' : fontSize === 'lg' ? '17px' : '15px'
      } as React.CSSProperties}
    >
      
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
        onOpenRagPanel={() => setRagPanelOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => {
          const next = !isSidebarCollapsed;
          setIsSidebarCollapsed(next);
          Storage.saveSidebarCollapsed(next);
        }}
      />

      <ChatArea
        chat={activeChat}
        onSendMessage={handleSendMessage}
        isGenerating={isGenerating}
        onEditMessage={handleEditMessage}
        onRegenerateResponse={handleRegenerateResponse}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => {
          const next = !isSidebarCollapsed;
          setIsSidebarCollapsed(next);
          Storage.saveSidebarCollapsed(next);
        }}
        fontSize={fontSize}
        onSwitchBranch={handleSwitchBranch}
      >
        <Composer
          input={composerInput}
          onChangeInput={setComposerInput}
          onSend={(attachments) => handleSendMessage(undefined, attachments)}
          isGenerating={isGenerating}
          onStop={handleStopGenerating}
          inputRef={textareaRef}
          userPrompts={userPrompts}
          fontSize={fontSize}
          onError={(msg) => showToast(msg, 'error')}
          settings={settings}
          onSettingsChanged={setSettings}
        />
      </ChatArea>

      {/* Settings Panel */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSettingsSaved={handleSettingsSaved}
        onPromptsChanged={handlePromptsChanged}
        onBackupImported={handleBackupImported}
        fontSize={fontSize}
        onFontSizeChanged={(size) => {
          setFontSize(size);
          Storage.saveFontSize(size);
        }}
        theme={theme}
        onThemeChanged={(newTheme) => {
          setTheme(newTheme);
          Storage.saveTheme(newTheme);
        }}
        activePromptId={activePromptId}
        onSelectPrompt={handleSelectPrompt}
      />

      {/* Keyboard Shortcuts Overlay */}
      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* RAG Memory Panel */}
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

    </div>
  );
}

export default App;
