import React, { useState } from 'react';
import type { Chat, Settings } from '../utils/storage';
import { MessageSquare, Plus, Settings as SettingsIcon, Trash2, PanelLeftClose, Search, Sun, Moon } from 'lucide-react';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  settings: Settings;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat?: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
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

  const filteredChats = chats.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.messages.some(msg => msg.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <aside
      inert={isCollapsed ? true : undefined}
      aria-hidden={isCollapsed}
      className={`flex h-full flex-col border-r border-border bg-card text-card-foreground ${
        mounted ? 'transition-all duration-300 ease-in-out' : ''
      } ${
        isCollapsed ? 'w-0 border-r-0 opacity-0 overflow-hidden pointer-events-none' : 'w-64 opacity-100'
      }`}
    >
      
      {/* Sidebar Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <span className="font-sans font-bold text-xs text-foreground uppercase tracking-tighter">c</span>
          </div>
          <div className="truncate">
            <h1 className="font-sans text-sm font-semibold tracking-tight text-foreground leading-none">context</h1>
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition active:scale-95 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Action Area: New Chat Button */}
      <div className="px-4 py-2 flex gap-1.5">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground py-2 text-xs font-medium text-foreground transition-all duration-200 active:scale-[0.98] cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Search Conversations */}
      <div className="px-4 py-1.5 relative select-none">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search chats..."
          aria-label="Search chats"
          className="w-full bg-background border border-input rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all duration-200"
        />
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-[2px]">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground/60 mb-2" />
            <p className="text-[10px] text-muted-foreground italic">
              {searchQuery ? 'No results found' : 'No history'}
            </p>
          </div>
        ) : (
          filteredChats.map(chat => {
            const isActive = chat.id === activeChatId;
            const isEditing = editingChatId === chat.id;

            return (
              <div
                key={chat.id}
                className={`group relative flex items-center justify-between rounded-md text-xs transition-colors duration-200 ${
                  isActive
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                {/* Active Indicator Line */}
                {isActive && (
                  <div className="absolute left-[2px] top-2 bottom-2 w-[2px] rounded-full bg-primary" />
                )}

                {isEditing ? (
                  <div className="flex w-full items-center gap-2 min-w-0 px-3 py-1.5 pr-3">
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
                    className="flex w-full items-center gap-2 min-w-0 px-3 py-2 pr-9 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md select-none"
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="truncate text-xs tracking-tight">{chat.title}</span>
                  </button>
                )}

                {/* Delete action button */}
                {!isEditing && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition cursor-pointer"
                      title="Delete chat"
                      aria-label={`Delete chat ${chat.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer Area */}
      <div className="bg-muted/20 px-4 py-3 flex items-center justify-between border-t border-border">
        
        {/* Model info panel */}
        <div className="min-w-0 pr-2 select-none">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest truncate">Gemini</span>
          </div>
          <span className="text-[10px] font-semibold text-foreground truncate block mt-[2px]" title={settings.model}>
            {getModelLabel()}
          </span>
        </div>

        {/* Action button panel */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              onThemeChanged(theme === 'light' ? 'dark' : 'light');
            }}
            className="rounded-md border border-input bg-background p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all duration-200 cursor-pointer animate-fade-in focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title={`Switch Theme (Current: ${theme})`}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'light' && <Sun className="h-3.5 w-3.5" />}
            {theme === 'dark' && <Moon className="h-3.5 w-3.5" />}
          </button>

          <button
            onClick={onOpenSettings}
            className="rounded-md border border-input bg-background p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
