import React, { useState, useMemo } from 'react';
import type { Chat, Settings } from '../utils/storage';
import { Menu, MessageSquare, Plus, Settings as SettingsIcon, Trash2, Pencil, MoreHorizontal, Search, Sun, Moon, Compass, Clock, X } from 'lucide-react';

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
  const [menuOpenChatId, setMenuOpenChatId] = useState<string | null>(null);
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
      className={`flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground ${
        mounted ? 'transition-all duration-300 ease-in-out' : ''
      } ${
        isCollapsed ? 'w-0 border-r-0 opacity-0 overflow-hidden pointer-events-none' : 'w-64 opacity-100'
      }`}
    >
      {/* Sidebar Top: Hamburger Menu */}
      <div className="flex h-12 shrink-0 items-center justify-between px-3.5 pt-2">
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition active:scale-95 cursor-pointer shrink-0 focus-visible:outline-none"
          title="Collapse sidebar (Ctrl+B)"
          aria-label="Collapse sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Action Area: + New Chat Button */}
      <div className="px-3 pt-1 pb-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2.5 rounded-xl border border-sidebar-border hover:border-sidebar-accent bg-transparent hover:bg-sidebar-accent px-3.5 py-2.5 text-xs font-normal text-sidebar-foreground hover:text-foreground transition cursor-pointer shadow-none focus-visible:outline-none"
        >
          <Plus className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs">New Chat</span>
        </button>
      </div>

      {/* Subtle Search Conversations */}
      <div className="px-3 pb-2 relative select-none">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search chats..."
          aria-label="Search chats"
          className="w-full bg-sidebar-accent/50 border border-sidebar-border rounded-lg pl-7 pr-6 py-1.5 text-xs text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:border-sidebar-border transition"
        />
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-sidebar-accent text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Chat History Group List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-1 scrollbar-thin">
        {groupedChats.length === 0 ? (
          <div className="px-4 py-8 text-center select-none">
            <p className="text-xs font-medium text-muted-foreground">
              {searchQuery ? 'No matching chats found' : 'No chat history'}
            </p>
          </div>
        ) : (
          groupedChats.map(group => (
            <div key={group.label} className="space-y-1">
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider select-none">
                {group.label}
              </div>
              {group.items.map(chat => {
                const isActive = chat.id === activeChatId;
                const isEditing = editingChatId === chat.id;
                const isMenuOpen = menuOpenChatId === chat.id;

                return (
                  <div
                    key={chat.id}
                    className={`group relative flex items-center justify-between rounded-xl text-xs transition-colors duration-150 ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex w-full items-center gap-2 min-w-0 px-3 py-2 pr-2.5">
                        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                          className="w-full bg-sidebar-accent border border-sidebar-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectChat(chat.id)}
                          onDoubleClick={(e) => handleStartRename(chat, e)}
                          className="flex w-full items-center gap-2.5 min-w-0 px-3 py-2.5 pr-8 text-left cursor-pointer rounded-xl select-none focus-visible:outline-none"
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <MessageSquare className={`h-4 w-4 shrink-0 ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} />
                          <span className="truncate text-xs">{chat.title}</span>
                        </button>

                        {/* Three-dots menu button */}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenChatId(isMenuOpen ? null : chat.id);
                            }}
                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition cursor-pointer"
                            title="Chat options"
                            aria-label={`Options for ${chat.title}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>

                          {/* Dropdown menu for three dots */}
                          {isMenuOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenChatId(null);
                                }}
                              />
                              <div className="absolute right-0 top-full mt-1 w-28 rounded-xl border border-border bg-popover p-1 shadow-xl z-40 animate-fade-in text-popover-foreground">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpenChatId(null);
                                    handleStartRename(chat, e);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span>Rename</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpenChatId(null);
                                    onDeleteChat(chat.id);
                                  }}
                                  aria-label={`Delete chat ${chat.title}`}
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-destructive hover:bg-destructive/15 cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Sidebar Footer Area */}
      <div className="px-3.5 py-3 flex items-center justify-between border-t border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSettings}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100 transition cursor-pointer focus-visible:outline-none"
            title="Open settings"
            aria-label="Open settings"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>

          {onOpenBrowserModal && (
            <button
              onClick={onOpenBrowserModal}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100 transition cursor-pointer focus-visible:outline-none"
              title="Open Browser Sandbox"
              aria-label="Open Browser Sandbox"
            >
              <Compass className="h-4 w-4" />
            </button>
          )}

          {onOpenSchedules && (
            <button
              onClick={onOpenSchedules}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100 transition cursor-pointer focus-visible:outline-none"
              title="Open Task Scheduler"
              aria-label="Open Task Scheduler"
            >
              <Clock className="h-4 w-4" />
            </button>
          )}

          <button
            onClick={() => onThemeChanged(theme === 'light' ? 'dark' : 'light')}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100 transition cursor-pointer focus-visible:outline-none"
            title={`Switch Theme (Current: ${theme})`}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Model info label for tests & status */}
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-medium select-none pr-1">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Gemini</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400 truncate max-w-[60px]" title={settings.model}>{getModelLabel()}</span>
        </div>
      </div>
    </aside>
  );
};

