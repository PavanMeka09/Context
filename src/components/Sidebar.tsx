import React, { useState } from 'react';
import type { Chat, Settings } from '../utils/storage';
import { MessageSquare, Plus, Settings as SettingsIcon, Trash2, Edit2, Check, X, PanelLeftClose, Search, Sun, Moon, Clock } from 'lucide-react';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  settings: Settings;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  onOpenSchedules: () => void;
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
  isCollapsed,
  onToggleCollapse,
  theme,
  onThemeChanged
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 50);
    return () => window.clearTimeout(timer);
  }, []);

  const startEditing = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
    setEditingId(chat.id);
    setTempTitle(chat.title);
  };

  const saveRename = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (tempTitle.trim()) {
      onRenameChat(id, tempTitle.trim());
    }
    setEditingId(null);
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
            const isEditing = chat.id === editingId;

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
                  <form
                    onSubmit={(e) => saveRename(chat.id, e)}
                    className="flex w-full items-center gap-1 px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={tempTitle}
                      onChange={(e) => setTempTitle(e.target.value)}
                      autoFocus
                      onBlur={() => {
                        if (tempTitle.trim() && tempTitle.trim() !== chat.title) {
                          onRenameChat(chat.id, tempTitle.trim());
                        }
                        setEditingId(null);
                      }}
                      className="w-full bg-background px-2 py-0.5 rounded text-[10px] border border-input focus:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground font-medium"
                    />
                    <button type="submit" className="text-primary hover:text-primary/80" aria-label="Confirm Rename">
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setEditingId(null);
                      }}
                      className="text-destructive hover:text-destructive/80"
                      aria-label="Cancel Rename"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmDeleteId) setConfirmDeleteId(null);
                        onSelectChat(chat.id);
                      }}
                      className={`flex w-full items-center gap-2 min-w-0 px-3 py-2 ${confirmDeleteId === chat.id ? 'pr-28' : 'pr-16'} text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="truncate text-xs tracking-tight">{chat.title}</span>
                    </button>

                    {/* Actions: visible on hover, focus-within, and touch */}
                    <div className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 ${confirmDeleteId === chat.id ? 'opacity-100 z-10' : 'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100'} transition-opacity duration-200`}>
                      {confirmDeleteId === chat.id ? (
                        <div className="flex items-center gap-1 bg-background/95 border border-destructive/30 rounded px-1.5 py-0.5 shadow-sm select-none">
                          <span className="text-[10px] font-medium text-destructive">Delete?</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteChat(chat.id);
                              setConfirmDeleteId(null);
                            }}
                            className="rounded p-0.5 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            title="Confirm delete"
                            aria-label={`Confirm delete chat ${chat.title}`}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            title="Cancel"
                            aria-label="Cancel delete chat"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => startEditing(chat, e)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            title="Rename chat"
                            aria-label={`Rename chat ${chat.title}`}
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(chat.id);
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            title="Delete chat"
                            aria-label={`Delete chat ${chat.title}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </>
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
            onClick={onOpenSchedules}
            className="rounded-md border border-input bg-background p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground active:scale-95 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="Open Task Scheduler"
            aria-label="Open Task Scheduler"
          >
            <Clock className="h-3.5 w-3.5" />
          </button>

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
