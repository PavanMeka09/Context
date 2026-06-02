import React, { useState } from 'react';
import type { Chat, Settings } from '../utils/storage';
import { MessageSquare, Plus, Settings as SettingsIcon, Trash2, Edit2, Check, X, PanelLeftClose, Search, BookOpen } from 'lucide-react';

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  settings: Settings;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  onOpenRagPanel: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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
  onOpenRagPanel,
  isCollapsed,
  onToggleCollapse
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 50);
    return () => window.clearTimeout(timer);
  }, []);

  const startEditing = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setTempTitle(chat.title);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const saveRename = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    if (tempTitle.trim()) {
      onRenameChat(id, tempTitle.trim());
    }
    setEditingId(null);
  };

  const getProviderLabel = () => {
    if (settings.provider === 'gemini') return 'Gemini';
    if (settings.provider === 'ollama') return 'Ollama';
    return 'OpenRouter';
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
    <aside className={`glass-panel flex h-full flex-col border-r border-white/[0.02] bg-slate-950/60 ${
      mounted ? 'transition-all duration-300 ease-in-out' : ''
    } ${
      isCollapsed ? 'w-0 border-r-0 opacity-0 overflow-hidden' : 'w-64 opacity-100'
    }`}>
      
      {/* Sidebar Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5">
            <span className="font-display font-black text-[10px] text-brand-500 uppercase tracking-tighter">c</span>
          </div>
          <div className="truncate">
            <h1 className="font-display text-sm font-semibold tracking-tight text-white/95 leading-none">context</h1>
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white transition active:scale-95 cursor-pointer shrink-0"
          title="Collapse sidebar"
          aria-label="Collapse sidebar button"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Action Area: New Chat Button (Ghost Style) */}
      <div className="px-4 py-2 flex gap-1.5">
        <button
          onClick={onNewChat}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.08] hover:text-white py-2 text-xs font-medium text-slate-300 transition-all duration-300 active:scale-98 cursor-pointer shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Chat</span>
        </button>
        <button
          onClick={onOpenRagPanel}
          className="flex items-center justify-center rounded-lg border border-white/[0.04] bg-white/[0.02] p-2 text-slate-400 hover:bg-white/5 hover:text-white active:scale-95 transition-all duration-300 cursor-pointer shrink-0"
          title="Manage Local RAG Documents"
          aria-label="Manage Local RAG Documents"
        >
          <BookOpen className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search Conversations */}
      <div className="px-4 py-1.5 relative select-none">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search chats..."
          className="w-full bg-slate-950/40 border border-white/[0.04] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500/50 transition-all duration-300"
        />
        <Search className="absolute left-7 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
      </div>

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-[2px]">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <MessageSquare className="h-6 w-6 text-slate-700 mb-2" />
            <p className="text-[10px] text-slate-600 italic">
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
                onClick={() => !isEditing && onSelectChat(chat.id)}
                className={`group relative flex items-center justify-between rounded-md px-3 py-2 text-xs transition-all duration-300 cursor-pointer ${
                  isActive
                    ? 'bg-white/[0.03] text-white'
                    : 'text-slate-400 hover:bg-white/[0.015] hover:text-slate-200'
                }`}
              >
                {/* Active Indicator Line */}
                {isActive && (
                  <div className="absolute left-[2px] top-2 bottom-2 w-[2px] rounded-full bg-brand-500" />
                )}

                {isEditing ? (
                  <form
                    onSubmit={(e) => saveRename(chat.id, e)}
                    className="flex w-full items-center gap-1"
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
                      className="w-full bg-slate-900 px-2 py-0.5 rounded text-[10px] border border-brand-500/50 focus:outline-none text-white font-medium"
                    />
                    <button type="submit" className="text-emerald-500 hover:text-emerald-400" aria-label="Confirm Rename">
                      <Check className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={cancelEditing} className="text-red-500 hover:text-red-400" aria-label="Cancel Rename">
                      <X className="h-3 w-3" />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0 pr-10">
                      <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-brand-500' : 'text-slate-600 group-hover:text-slate-400 transition-colors'}`} />
                      <span className="truncate text-xs tracking-tight">{chat.title}</span>
                    </div>

                    {/* Actions panel (Clean, low-profile overlay) */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <button
                        onClick={(e) => startEditing(chat, e)}
                        className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
                        title="Rename chat"
                        aria-label={`Rename chat ${chat.title}`}
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(chat.id);
                        }}
                        className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-red-400"
                        title="Delete chat"
                        aria-label={`Delete chat ${chat.title}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer Area */}
      <div className="bg-slate-950/20 px-4 py-3 flex items-center justify-between border-t border-white/[0.015]">
        
        {/* Model info panel */}
        <div className="min-w-0 pr-2 select-none">
          <div className="flex items-center gap-1">
            <div className="h-1 w-1 rounded-full bg-brand-500/80" />
            <span className="text-[9px] font-medium text-slate-600 uppercase tracking-widest truncate">{getProviderLabel()}</span>
          </div>
          <span className="text-[10px] font-medium text-slate-400 truncate block mt-[2px]" title={settings.model}>
            {getModelLabel()}
          </span>
        </div>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2 text-slate-400 hover:bg-white/5 hover:text-white active:scale-95 transition-all duration-300 cursor-pointer"
          title="Open settings"
          aria-label="Open settings"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
        </button>

      </div>
    </aside>
  );
};
