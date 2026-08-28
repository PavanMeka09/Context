import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, Terminal, MessageSquare, Sparkles, Globe, 
   Settings, Palette, ChevronRight, CornerDownLeft, 
  Check, ArrowLeft, EyeOff, Loader2, Clock, Compass
} from 'lucide-react';
import type { Chat, Settings as AppSettings, SystemPrompt } from '../utils/storage';
import { Storage, PRESET_PROMPTS, PROVIDERS } from '../utils/storage';
import { fetchModels, type ModelOption } from '../utils/api';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  settings: AppSettings;
  onSettingsChanged: (s: AppSettings) => void;
  activePromptId: string;
  onSelectPromptId: (id: string) => void;
  customPrompts: SystemPrompt[];
  theme: 'dark' | 'light';
  onThemeChanged: (theme: 'dark' | 'light') => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onShowToast: (msg: string, type: 'success' | 'error') => void;
  onOpenSchedules?: () => void;
  onOpenBrowserModal?: () => void;
  onOpenCrawl4AI?: () => void;
}

type ScreenType = 'main' | 'models' | 'personas' | 'chats' | 'themes';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  category: string;
  action: () => void;
  shortcut?: string[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  settings,
  onSettingsChanged,
  activePromptId,
  onSelectPromptId,
  customPrompts,
  theme,
  onThemeChanged,
  onToggleSidebar,
  onToggleSettings,
  onShowToast,
  onOpenSchedules,
  onOpenBrowserModal,
  onOpenCrawl4AI
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeScreen, setActiveScreen] = useState<ScreenType>('main');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Focus input on mount
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isOpen) {
      timer = setTimeout(() => {
        inputRef.current?.focus();
        setSearchQuery('');
        setActiveScreen('main');
        setSelectedIndex(0);
      }, 50);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Fetch dynamic models for models submenu
  useEffect(() => {
    let active = true;
    if (isOpen && activeScreen === 'models') {
      Promise.resolve().then(() => {
        if (!active) return;
        setIsLoadingModels(true);
        fetchModels({ provider: settings.provider, apiKey: settings.apiKey, localUrl: settings.localUrl })
          .catch(() => { if (active) setAvailableModels([]); })
          .finally(() => { if (active) setIsLoadingModels(false); });
      });
    }
    return () => {
      active = false;
    };
  }, [isOpen, activeScreen, settings.provider, settings.apiKey, settings.localUrl]);
  // Core navigation, activation and settings hooks
  const handleToggleWebSearch = useCallback(() => {
    const nextVal = !settings.isWebSearchEnabled;
    const nextSettings = { ...settings, isWebSearchEnabled: nextVal };
    Storage.saveSettings(nextSettings);
    onSettingsChanged(nextSettings);
    onShowToast(nextVal ? 'Web Search (SearXNG) enabled!' : 'Web Search disabled.', 'success');
    onClose();
  }, [settings, onSettingsChanged, onShowToast, onClose]);



  const handleSelectModel = useCallback((modelId: string) => {
    const nextSettings = { ...settings, model: modelId };
    Storage.saveSettings(nextSettings);
    onSettingsChanged(nextSettings);
    onShowToast(`Active model updated to ${modelId}.`, 'success');
    onClose();
  }, [settings, onSettingsChanged, onShowToast, onClose]);



  // Group commands depending on screen
  const mainCommands = useMemo<CommandItem[]>(() => [
    // NAVIGATION
    {
      id: 'nav-new-chat',
      title: 'New Conversation',
      subtitle: 'Create a new empty chat session',
      icon: <MessageSquare className="h-4 w-4" />,
      category: 'Navigation',
      action: () => { onNewChat(); onClose(); },
      shortcut: ['Ctrl', 'Shift', 'N']
    },
    {
      id: 'nav-schedules',
      title: 'Open Task Scheduler',
      subtitle: 'Manage background cron tasks and recurring web scrapes',
      icon: <Clock className="h-4 w-4" />,
      category: 'Navigation',
      action: () => { if (onOpenSchedules) onOpenSchedules(); onClose(); }
    },
    {
      id: 'nav-crawl4ai',
      title: 'Crawl4AI Web Crawler',
      subtitle: 'Fast markdown generation & structured data extraction',
      icon: <Globe className="h-4 w-4" />,
      category: 'Navigation',
      action: () => { if (onOpenCrawl4AI) onOpenCrawl4AI(); onClose(); },
      shortcut: ['/crawl']
    },
    {
      id: 'nav-browser',
      title: 'Open Browser Sandbox Live View',
      subtitle: 'Inspect background Puppeteer browser session steps',
      icon: <Compass className="h-4 w-4" />,
      category: 'Navigation',
      action: () => { onOpenBrowserModal?.(); onClose(); }
    },
    {
      id: 'nav-settings',
      title: 'Open Application Settings',
      subtitle: 'Adjust API keys, speech engines, and options',
      icon: <Settings className="h-4 w-4" />,
      category: 'Navigation',
      action: () => { onToggleSettings(); onClose(); }
    },
    {
      id: 'nav-sidebar',
      title: 'Toggle Sidebar Panel',
      subtitle: 'Expand or collapse conversation history list',
      icon: <EyeOff className="h-4 w-4" />,
      category: 'Navigation',
      action: () => { onToggleSidebar(); onClose(); }
    },

    // SUBMENUS
    {
      id: 'sub-models',
      title: 'Change Active Model...',
      subtitle: `Current: ${settings.model}`,
      icon: <Terminal className="h-4 w-4" />,
      category: 'Configuration',
      action: () => { setActiveScreen('models'); setSearchQuery(''); setSelectedIndex(0); }
    },
    {
      id: 'sub-personas',
      title: 'Change System Persona...',
      subtitle: `Current persona prompt selection`,
      icon: <Sparkles className="h-4 w-4" />,
      category: 'Configuration',
      action: () => { setActiveScreen('personas'); setSearchQuery(''); setSelectedIndex(0); }
    },
    {
      id: 'sub-chats',
      title: 'Switch to Recent Chat...',
      subtitle: 'Jump directly to another conversation',
      icon: <MessageSquare className="h-4 w-4" />,
      category: 'Navigation',
      action: () => { setActiveScreen('chats'); setSearchQuery(''); setSelectedIndex(0); }
    },

    // TOGGLES
    {
      id: 'toggle-web',
      title: 'Toggle Web Search (SearXNG)',
      subtitle: settings.isWebSearchEnabled ? 'Disable internet search (enabled)' : 'Enable internet search (disabled)',
      icon: <Globe className="h-4 w-4" />,
      category: 'Web Search',
      action: handleToggleWebSearch
    },

    // APPEARANCE
    {
      id: 'sub-themes',
      title: 'Switch Application Theme...',
      subtitle: `Current: ${theme}`,
      icon: <Palette className="h-4 w-4" />,
      category: 'Appearance',
      action: () => { setActiveScreen('themes'); setSearchQuery(''); setSelectedIndex(0); }
    },
  ], [settings, theme, onNewChat, onClose, onToggleSettings, onToggleSidebar, onOpenBrowserModal, onOpenSchedules, onOpenCrawl4AI, handleToggleWebSearch]);

  // Derived submenus items
  const subCommands = useMemo<CommandItem[]>(() => {
    switch (activeScreen) {

      case 'models':
        if (isLoadingModels) {
          return [{
            id: 'model-loading',
            title: 'Fetching models...',
            subtitle: 'Querying dynamic models endpoint...',
            icon: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
            category: 'AI Models',
            action: () => {}
          }];
        }
        if (availableModels.length === 0) {
          return [{
            id: 'model-none',
            title: 'No models found',
            subtitle: 'Please check your API Key or Local URL settings.',
            icon: <EyeOff className="h-4 w-4" />,
            category: 'AI Models',
            action: () => {}
          }];
        }
        return availableModels.map(m => ({
          id: `model-${m.id}`,
          title: m.name,
          subtitle: m.id,
          icon: <Check className={`h-4 w-4 ${settings.model === m.id ? '' : 'opacity-0'}`} />,
          category: 'AI Models',
          action: () => handleSelectModel(m.id)
        }));

      case 'personas': {
        const allPrompts = [...PRESET_PROMPTS, ...customPrompts];
        return allPrompts.map(p => ({
          id: `persona-${p.id}`,
          title: p.name,
          subtitle: p.content.slice(0, 70) + (p.content.length > 70 ? '...' : ''),
          icon: <Check className={`h-4 w-4 ${activePromptId === p.id ? '' : 'opacity-0'}`} />,
          category: p.isCustom ? 'Custom System Prompts' : 'System Presets',
          action: () => {
            onSelectPromptId(p.id);
            onShowToast(`Active Persona set to ${p.name}.`, 'success');
            onClose();
          }
        }));
      }

      case 'chats':
        if (chats.length === 0) {
          return [{
            id: 'chat-none',
            title: 'No recent conversations',
            subtitle: 'Create a new chat session from the main menu.',
            icon: <EyeOff className="h-4 w-4" />,
            category: 'Conversations',
            action: () => {}
          }];
        }
        return chats.map(c => ({
          id: `chat-${c.id}`,
          title: c.title || 'New Conversation',
          subtitle: c.messages && c.messages.length > 0
            ? `${c.messages.length} messages — Last active ${new Date(c.updatedAt).toLocaleTimeString()}`
            : 'Empty conversation session',
          icon: <Check className={`h-4 w-4 ${activeChatId === c.id ? '' : 'opacity-0'}`} />,
          category: 'Recent Chats',
          action: () => {
            onSelectChat(c.id);
            onClose();
          }
        }));

      case 'themes':
        return ([
          { id: 'theme-dark', title: 'Dark Theme', value: 'dark' },
          { id: 'theme-light', title: 'Light Theme', value: 'light' }
        ] as const).map(t => ({
          id: t.id,
          title: t.title,
          subtitle: `Apply application coloring: ${t.value}`,
          icon: <Check className={`h-4 w-4 ${theme === t.value ? '' : 'opacity-0'}`} />,
          category: 'App Appearance',
          action: () => {
            onThemeChanged(t.value);
            onShowToast(`App theme set to ${t.title}.`, 'success');
            onClose();
          }
        }));

      default:
        return [];
    }
  }, [
    activeScreen, settings, customPrompts, activePromptId, chats, activeChatId, theme, 
    availableModels, isLoadingModels, handleSelectModel, onClose, 
    onSelectChat, onSelectPromptId, onShowToast, onThemeChanged
  ]);

  // Combined and filtered commands
  const currentList = activeScreen === 'main' ? mainCommands : subCommands;
  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return currentList;
    return currentList.filter(item => 
      item.title.toLowerCase().includes(q) || 
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );
  }, [currentList, searchQuery]);

  // Keep index within bounds
  useEffect(() => {
    const timer = setTimeout(() => setSelectedIndex(0), 0);
    return () => clearTimeout(timer);
  }, [searchQuery, activeScreen]);

  // Auto-scroll anchor to keep highlighted item centered/visible
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const activeEl = container.children[selectedIndex] as HTMLElement;
    if (!activeEl) return;

    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const elemTop = activeEl.offsetTop;
    const elemBottom = elemTop + activeEl.clientHeight;

    if (elemTop < containerTop) {
      container.scrollTop = elemTop;
    } else if (elemBottom > containerBottom) {
      container.scrollTop = elemBottom - container.clientHeight;
    }
  }, [selectedIndex]);

  // Keyboard navigation controller
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.repeat) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (filteredList.length > 0 ? (prev + 1) % filteredList.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (filteredList.length > 0 ? (prev - 1 + filteredList.length) % filteredList.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredList[selectedIndex]) {
        filteredList[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Backspace' && searchQuery === '' && activeScreen !== 'main') {
      e.preventDefault();
      setActiveScreen('main');
      setSearchQuery('');
      setSelectedIndex(0);
    }
  };

  if (!isOpen) return null;

  let currentCategory = '';

  const getScreenTitle = () => {
    switch (activeScreen) {
      case 'models': return `${(PROVIDERS[settings.provider]?.name || 'AI').toUpperCase()} MODELS`;
      case 'personas': return 'SYSTEM PERSONAS';
      case 'chats': return 'RECENT CONVERSATIONS';
      case 'themes': return 'APPEARANCE THEME';
      default: return 'COMMAND PALETTE';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[15vh] backdrop-blur-sm animate-fade-in select-none">
      <div className="fixed inset-0" onClick={onClose} />

      <div 
        ref={containerRef}
        className="relative w-full max-w-lg overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg z-10 flex flex-col max-h-[480px] animate-scale-in"
      >
        {/* Top Header Command Input */}
        <div className="flex items-center gap-3 px-4 border-b border-border bg-muted/40 shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          
          {/* Breadcrumb back icon if in submenu */}
          {activeScreen !== 'main' && (
            <button
              onClick={() => {
                setActiveScreen('main');
                setSearchQuery('');
                setSelectedIndex(0);
              }}
              title="Back to main menu (Backspace)"
              className="flex items-center justify-center p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}

          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeScreen === 'main'
                ? "Type a command or search..."
                : `Search ${getScreenTitle().toLowerCase()}...`
            }
            className="flex-1 bg-transparent py-4 text-xs font-semibold text-foreground placeholder-muted-foreground focus:outline-none"
          />

          {/* Category Pill Tag */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-muted border border-border rounded text-[9px] font-bold text-foreground uppercase tracking-wider select-none shrink-0">
            {getScreenTitle()}
          </div>
        </div>

        {/* Scrollable commands list */}
        <div 
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 min-h-[120px] scrollbar-none space-y-0.5"
        >
          {filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center select-none">
              <EyeOff className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-[11px] font-semibold text-muted-foreground">No matching commands found</span>
            </div>
          ) : (
            filteredList.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const showCategory = item.category !== currentCategory;
              if (showCategory) currentCategory = item.category;

              return (
                <div key={item.id} className="flex flex-col">
                  {/* Category Header */}
                  {showCategory && (
                    <div className="px-3.5 py-1.5 text-[8.5px] font-bold tracking-widest text-muted-foreground uppercase select-none mt-1.5 first:mt-0 leading-none">
                      {item.category}
                    </div>
                  )}

                  {/* Single item entry */}
                  <button
                    onClick={item.action}
                    className={`flex items-center justify-between w-full rounded-md px-3 py-2.5 text-left transition duration-150 cursor-pointer border-l-2 ${
                      isSelected
                        ? 'bg-accent text-accent-foreground border-primary pl-2.5 font-medium'
                        : 'hover:bg-accent/40 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`shrink-0 p-1.5 rounded border transition duration-200 ${
                        isSelected 
                          ? 'bg-background border-border text-primary' 
                          : 'bg-muted border-border text-muted-foreground'
                      }`}>
                        {item.icon}
                      </div>

                      <div className="flex flex-col min-w-0 pr-4">
                        <span className={`text-[11px] font-semibold transition ${
                          isSelected ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className={`text-[9.5px] truncate mt-0.5 transition leading-tight ${
                            isSelected ? 'text-muted-foreground' : 'text-muted-foreground/60'
                          }`}>
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Key Indicators or Arrow */}
                    <div className="flex items-center shrink-0">
                      {item.id.startsWith('sub-') ? (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      ) : isSelected ? (
                        item.shortcut ? (
                          <div className="flex items-center gap-1">
                            {item.shortcut.map((key, keyIdx) => (
                              <kbd 
                                key={keyIdx}
                                className="px-1.5 py-0.5 rounded bg-muted border border-border text-[8.5px] font-mono font-bold text-muted-foreground shadow-sm"
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[8.5px] font-bold text-primary leading-none">
                            <span>Execute</span>
                            <CornerDownLeft className="h-2.5 w-2.5" />
                          </div>
                        )
                      ) : null}
                    </div>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Dynamic Navigation Footer Help */}
        <div className="border-t border-border bg-muted/40 px-4 py-2.5 flex items-center justify-between text-[8px] font-bold text-muted-foreground select-none shrink-0 uppercase tracking-widest leading-none">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><CornerDownLeft className="h-2.5 w-2.5 inline" /> Select</span>
            <span>↑↓ Navigate</span>
          </div>
          <div>
            {activeScreen !== 'main' ? (
              <span className="flex items-center gap-1"><ArrowLeft className="h-2.5 w-2.5 inline" /> Backspace to go back</span>
            ) : (
              <span>Esc to Close</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
