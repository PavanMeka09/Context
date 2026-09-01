import React, { useState, useMemo } from 'react';
import type { Chat, Settings } from '../utils/storage';
import { MessageSquare, Plus, Settings as SettingsIcon, Trash2, PanelLeftClose, Search, Sun, Moon, Compass, Clock, X, Sparkles } from 'lucide-react';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  settings: Settings;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat?: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  onOpenSchedules?: () => void;
  onOpenBrowserModal?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  theme: 'dark' | 'light';
  onThemeChanged: (theme: 'dark' | 'light') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  chats,
  activeChatId,
  settings,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  onRenameChat,
  onOpenSettings,
  onOpenSchedules,
  onOpenBrowserModal,
  isCollapsed,
  onToggleCollapse,
  theme,
  onThemeChanged
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [mounted, setMounted] = useState(false);
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 50);
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (editingChatId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingChatId]);

  const resetEditState = () => {
    setEditingChatId(null);
    setEditTitle('');
  };

  const handleStartRename = (chat: Chat, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  const handleSaveRename = (chatId: string) => {
    if (onRenameChat) {
      onRenameChat(chatId, editTitle);
    }
    resetEditState();
  };

  const handleCancelRename = () => {
    resetEditState();
  };

  const getModelLabel = () => {
    const parts = settings.model.split('/');
    return parts[parts.length - 1] || 'Default';
  };

  const filteredChats = useMemo(() => {
    return chats.filter(chat =>
      chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.messages.some(msg => msg.content.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [chats, searchQuery]);

  // Group chats by date (Today, Yesterday, Previous 7 Days, Older)
  const groupedChats = useMemo(() => {
    if (searchQuery.trim()) {
      return [{ label: `Search Results (${filteredChats.length})`, items: filteredChats }];
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const eightDaysAgo = today - 8 * 86400000;

    const groups: { label: string; items: Chat[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Previous 7 Days', items: [] },
      { label: 'Older', items: [] }
    ];

    chats.forEach(chat => {
      const chatTime = new Date(chat.updatedAt || chat.createdAt).getTime();
      if (chatTime >= today) {
        groups[0].items.push(chat);
      } else if (chatTime >= yesterday) {
        groups[1].items.push(chat);
      } else if (chatTime >= eightDaysAgo) {
        groups[2].items.push(chat);
      } else {
        groups[3].items.push(chat);
      }
    });

    return groups.filter(g => g.items.length > 0);
  }, [chats, filteredChats, searchQuery]);

  return (
    <aside
      inert={isCollapsed ? true : undefined}
      aria-hidden={isCollapsed}
      className={`flex h-full flex-col border-r border-border bg-sidebar text-sidebar-foreground ${
        mounted ? 'transition-all duration-300 ease-in-out' : ''
      } ${
        isCollapsed ? 'w-0 border-r-0 opacity-0 overflow-hidden pointer-events-none' : 'w-64 opacity-100'
      }`}
    >
      
      {/* Sidebar Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/25 text-primary shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="truncate">
            <h1 className="font-sans text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5 leading-none">
              <span>Context</span>
              <span className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">AI</span>
            </h1>
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition active:scale-95 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title="Collapse sidebar (Ctrl+B)"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Action Area: New Chat Button */}
      <div className="px-3.5 py-1.5">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground px-3 py-2 text-xs font-semibold text-foreground transition-all duration-150 active:scale-[0.98] cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group"
        >
          <div className="flex items-center gap-2">
            <Plus className="h-3.5 w-3.5 text-primary group-hover:rotate-90 transition-transform duration-200" />
            <span>New Chat</span>
          </div>
          <kbd className="text-[9px] font-mono font-bold text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded border border-border/80">
            Ctrl+Shift+N
          </kbd>
        </button>
      </div>

      {/* Search Conversations */}
      <div className="px-3.5 py-1.5 relative select-none">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search chats..."
          aria-label="Search chats"
          className="w-full bg-card border border-border rounded-lg pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200"
        />
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Chat History List with Chronological Grouping */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-3 scrollbar-thin">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none">
            <div className="h-9 w-9 rounded-full bg-muted/60 flex items-center justify-center mb-2 text-muted-foreground/60">
              <MessageSquare className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground">
              {searchQuery ? 'No matching chats found' : 'No chat history'}
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              {searchQuery ? 'Try a different search keyword' : 'Start a new conversation'}
            </p>
          </div>
        ) : (
          groupedChats.map(group => (
            <div key={group.label} className="space-y-0.5">
              <div className="px-2.5 py-1 text-[9px] font-bold text-muted-foreground/70 uppercase tracking-wider select-none">
                {group.label}
              </div>
              {group.items.map(chat => {
                const isActive = chat.id === activeChatId;
                const isEditing = editingChatId === chat.id;

                return (
                  <div
                    key={chat.id}
                    className={`group relative flex items-center justify-between rounded-lg text-xs transition-all duration-150 ${
                      isActive
                        ? 'bg-primary/10 text-foreground font-semibold border border-primary/25 shadow-2xs'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground border border-transparent'
                    }`}
                  >
                    {/* Active Indicator Line */}
                    {isActive && (
                      <div className="absolute left-[3px] top-2 bottom-2 w-[2.5px] rounded-full bg-primary" />
                    )}

                    {isEditing ? (
                      <div className="flex w-full items-center gap-2 min-w-0 px-2.5 py-1.5 pr-2.5">
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={editTitle}
                          aria-label="Edit chat title"
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveRename(chat.id);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              handleCancelRename();
                            }
                          }}
                          onBlur={() => handleSaveRename(chat.id)}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          className="w-full bg-background border border-input rounded px-1.5 py-0.5 text-xs text-foreground font-normal focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectChat(chat.id)}
                        onDoubleClick={(e) => handleStartRename(chat, e)}
                        className="flex w-full items-center gap-2.5 min-w-0 px-2.5 py-2 pr-8 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-lg select-none"
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-muted-foreground'}`} />
                        <span className="truncate text-xs tracking-tight">{chat.title}</span>
                      </button>
                    )}

                    {/* Delete action button */}
                    {!isEditing && (
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteChat(chat.id);
                          }}
                          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition cursor-pointer"
                          title="Delete chat"
                          aria-label={`Delete chat ${chat.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Sidebar Footer Area */}
      <div className="bg-muted/30 px-3.5 py-2.5 flex items-center justify-between border-t border-border">
        
        {/* Model info pill */}
        <div className="min-w-0 pr-2 select-none">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest truncate">Gemini</span>
          </div>
          <span className="text-[10px] font-bold text-foreground truncate block mt-0.5" title={settings.model}>
            {getModelLabel()}
          </span>
        </div>

        {/* Action button panel */}
        <div className="flex items-center gap-1 shrink-0">
          {onOpenBrowserModal && (
            <button
              onClick={onOpenBrowserModal}
              className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Open Browser Sandbox"
              aria-label="Open Browser Sandbox"
            >
              <Compass className="h-3.5 w-3.5" />
            </button>
          )}

          {onOpenSchedules && (
            <button
              onClick={onOpenSchedules}
              className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Open Task Scheduler"
              aria-label="Open Task Scheduler"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={() => {
              onThemeChanged(theme === 'light' ? 'dark' : 'light');
            }}
            className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95 transition cursor-pointer animate-fade-in focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title={`Switch Theme (Current: ${theme})`}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'light' && <Sun className="h-3.5 w-3.5" />}
            {theme === 'dark' && <Moon className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={onOpenSettings}
            className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="Open settings"
            aria-label="Open settings"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </button>
        </div>

      </div>
    </aside>
  );
};

