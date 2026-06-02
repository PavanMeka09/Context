import React, { useRef, useEffect, useState } from 'react';
import type { Chat, Message } from '../utils/storage';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Copy, Check, RotateCw, Pencil, Trash2, Terminal, HelpCircle, FileText, ChevronDown, ChevronLeft, ChevronRight, CheckSquare, PanelLeftOpen, Loader2, Globe, AlertTriangle, ExternalLink } from 'lucide-react';
import type { SearxngResult } from '../utils/searxng';

function parseThinkingAndContent(content: string): { thinking: string | null; content: string } {
  const thinkingMatch = content.match(/<(?:thinking|thought)>([\s\S]*?)<\/(?:thinking|thought)>/i);
  if (thinkingMatch) {
    const thinking = thinkingMatch[1].trim();
    const cleanContent = content.replace(/<(?:thinking|thought)>[\s\S]*?<\/(?:thinking|thought)>/i, '').trim();
    return { thinking, content: cleanContent };
  }
  
  const openMatch = content.match(/<(?:thinking|thought)>([\s\S]*)$/i);
  if (openMatch) {
    const thinking = openMatch[1].trim();
    return { thinking, content: '' };
  }
  
  return { thinking: null, content };
}

interface SearchStatus {
  hasSearch: boolean;
  query: string;
  status: 'searching' | 'done' | 'failed';
  error: string | null;
  results: SearxngResult[];
  cleanContent: string;
}

function parseSearchStatus(content: string): SearchStatus {
  // Regex to match the search_status tag and its body
  const tagRegex = /<search_status\s+query="([^"]*)"\s+status="([^"]*)"(?:\s+error="([^"]*)")?>([\s\S]*?)<\/search_status>/i;
  let match = content.match(tagRegex);
  
  if (match) {
    let results: SearxngResult[] = [];
    try {
      if (match[4].trim()) {
        results = JSON.parse(match[4].trim());
      }
    } catch (e) {
      console.error('Failed to parse search results JSON:', e);
    }
    
    return {
      hasSearch: true,
      query: match[1],
      status: match[2] as 'searching' | 'done' | 'failed',
      error: match[3] || null,
      results,
      cleanContent: content.replace(tagRegex, '').trim()
    };
  }

  // Also match self-closing tag for the searching in-progress state
  const selfClosingRegex = /<search_status\s+query="([^"]*)"\s+status="([^"]*)"(?:\s+error="([^"]*)")?\s*\/>/i;
  match = content.match(selfClosingRegex);
  if (match) {
    return {
      hasSearch: true,
      query: match[1],
      status: match[2] as 'searching' | 'done' | 'failed',
      error: match[3] || null,
      results: [],
      cleanContent: content.replace(selfClosingRegex, '').trim()
    };
  }

  return {
    hasSearch: false,
    query: '',
    status: 'searching',
    error: null,
    results: [],
    cleanContent: content
  };
}

interface SearchStatusBadgeProps {
  query: string;
  status: 'searching' | 'done' | 'failed';
  error: string | null;
  results: SearxngResult[];
}

export const SearchStatusBadge: React.FC<SearchStatusBadgeProps> = ({
  query,
  status,
  error,
  results
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getFaviconUrl = (urlStr: string) => {
    try {
      const url = new URL(urlStr);
      return `https://www.google.com/s2/favicons?sz=64&domain=${url.hostname}`;
    } catch {
      return '';
    }
  };

  const getHostname = (urlStr: string) => {
    try {
      const url = new URL(urlStr);
      return url.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  if (status === 'searching') {
    return (
      <div className="mb-4 rounded-xl border border-emerald-505/10 bg-emerald-950/5 p-3.5 backdrop-blur-md animate-fade-in select-none">
        <div className="flex items-center gap-3">
          <div className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-450 border border-emerald-500/25">
            <Globe className="h-3.5 w-3.5 animate-spin text-emerald-400" style={{ animationDuration: '3s' }} />
            <span className="absolute -inset-0.5 rounded-lg border border-emerald-500/30 animate-ping opacity-35" style={{ animationDuration: '1.8s' }} />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-450">Web Search Active</span>
            <span className="text-[12px] font-medium text-slate-300 leading-snug">
              Searching the web for <span className="text-white font-semibold font-mono">"{query}"</span>...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-950/10 p-3.5 backdrop-blur-md animate-fade-in select-none">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-500/10 text-rose-450 border border-rose-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-450">Search Failed</span>
            <span className="text-[12px] font-medium text-slate-350 leading-snug">
              Could not complete search for "{query}" • <span className="text-rose-300 font-mono text-[10.5px]">{error || 'Unknown issue'}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  const hasResults = results && results.length > 0;

  return (
    <div className="mb-4 rounded-xl border border-white/[0.035] bg-white/[0.015] p-2.5 backdrop-blur-md animate-fade-in select-none">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-450 border border-emerald-500/20">
            <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-450 leading-none">Web Search Completed</span>
            <span className="text-[12px] font-medium text-slate-300 truncate mt-1">
              Searched the web for: <span className="text-white font-semibold font-mono">"{query}"</span>
            </span>
          </div>
        </div>

        {hasResults && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.05] text-[10px] font-semibold text-slate-300 hover:text-white px-2.5 py-1.5 transition active:scale-95 cursor-pointer shrink-0"
          >
            <span>Sources ({results.length})</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Expanded Sources Grid */}
      {isExpanded && hasResults && (
        <div className="mt-3 border-t border-white/[0.03] pt-3 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {results.map((r, idx) => (
              <a
                key={idx}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                title={r.title}
                className="group flex flex-col justify-between rounded-xl border border-white/[0.03] bg-white/[0.005] hover:bg-white/[0.025] hover:border-white/[0.08] p-3 transition-all duration-300"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-bold text-slate-400 uppercase tracking-wide">
                    {getFaviconUrl(r.url) ? (
                      <img
                        src={getFaviconUrl(r.url)}
                        alt=""
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        className="h-3.5 w-3.5 rounded-sm object-contain"
                      />
                    ) : (
                      <Globe className="h-3 w-3 text-slate-500" />
                    )}
                    <span className="truncate max-w-[130px]">{getHostname(r.url)}</span>
                  </div>
                  <span className="text-[11.5px] font-semibold text-slate-200 group-hover:text-brand-300 leading-snug line-clamp-1 transition-colors">
                    {r.title}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 leading-snug">
                  <span className="line-clamp-1 pr-4 italic shrink min-w-0 text-slate-500">
                    {r.content || 'View page details...'}
                  </span>
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto text-slate-400" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface ChatAreaProps {
  chat: Chat | null;
  onSendMessage: (text: string) => void;
  isGenerating: boolean;
  onEditMessage: (messageId: string, newContent: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onRegenerateResponse: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  fontSize: 'sm' | 'base' | 'lg';
  onSwitchBranch?: (messageId: string) => void;
  children?: React.ReactNode;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  chat,
  onSendMessage,
  isGenerating,
  onEditMessage,
  onDeleteMessage,
  onRegenerateResponse,
  isSidebarCollapsed,
  onToggleSidebar,
  fontSize,
  onSwitchBranch,
  children
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);






  const fontSizeClasses = {
    sm: 'text-xs md:text-sm',
    base: 'text-sm md:text-base',
    lg: 'text-base md:text-lg'
  };

  const markdownFontSizeClasses = {
    sm: 'text-xs md:text-sm [&_.markdown-content]:text-xs [&_.markdown-content]:md:text-sm',
    base: 'text-sm md:text-base [&_.markdown-content]:text-sm [&_.markdown-content]:md:text-base',
    lg: 'text-base md:text-lg [&_.markdown-content]:text-base [&_.markdown-content]:md:text-lg font-medium'
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (container) {
      const isScrolledUp = container.scrollHeight - container.scrollTop - container.clientHeight > 300;
      setShowScrollButton(isScrolledUp);
    }
  };

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  };



  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      const isAtBottom =
        scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 120;
      
      if (isAtBottom || isGenerating) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [chat?.messages, isGenerating]);

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const startEditingMessage = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditInputValue(msg.content);
  };

  const saveEditedMessage = (id: string) => {
    if (editInputValue.trim()) {
      onEditMessage(id, editInputValue.trim());
    }
    setEditingMessageId(null);
  };

  const starterPrompts = [
    {
      title: 'Explain hooks',
      icon: <Terminal className="h-3.5 w-3.5 text-brand-500" />,
      prompt: 'Explain how React server-side streaming hooks work and why they improve UX. Provide a detailed code example.'
    },
    {
      title: 'Optimize queries',
      icon: <CheckSquare className="h-3.5 w-3.5 text-emerald-500" />,
      prompt: 'Optimize this TypeScript filtering utility function for performance:\n\n```typescript\nfunction filterUsers(users: any[]) {\n  return users.filter(u => u.active).map(u => u.name);\n}\n```'
    },
    {
      title: 'Draft PRD specs',
      icon: <FileText className="h-3.5 w-3.5 text-amber-500" />,
      prompt: 'Draft an elegant Product Requirements Document (PRD) template for a lightweight mobile-friendly notes app.'
    },
    {
      title: 'API Authorization',
      icon: <HelpCircle className="h-3.5 w-3.5 text-sky-500" />,
      prompt: 'List top 5 security practices when implementing user authorization headers on a node/express REST API.'
    }
  ];

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-slate-950 relative">
      
      {/* Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between px-6 bg-slate-950/40 backdrop-blur-md select-none border-b border-white/[0.015]">
        <div className="flex items-center gap-3 min-w-0">
          {isSidebarCollapsed && (
            <button
              onClick={onToggleSidebar}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white transition active:scale-95 cursor-pointer shrink-0"
              title="Expand sidebar"
              aria-label="Expand sidebar button"
            >
              <PanelLeftOpen className="h-4 w-4 text-brand-500" />
            </button>
          )}
          <div className="flex items-center min-w-0">
            <h2 className="font-display text-xs font-semibold text-white/90 truncate max-w-xs md:max-w-md">
              {chat ? chat.title : 'New Conversation'}
            </h2>
          </div>
        </div>


      </header>

      {/* Messages Feed Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin select-text"
      >
        {!chat || chat.messages.length === 0 ? (
          
          /* Modern Minimal Splash Welcomer */
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-20 md:py-28 text-center animate-fade-in">
            <h3 className="font-display font-light text-3xl tracking-tight text-white/90">
              how can I help you today?
            </h3>
            <p className="mt-2 text-xs text-slate-500 font-medium select-none">
              Your conversations are private and stored locally.
            </p>

            {/* suggestion chips */}
            <div className="mt-8 flex flex-wrap justify-center gap-2 select-none max-w-lg">
              {starterPrompts.map((card, i) => (
                <button
                  key={i}
                  onClick={() => onSendMessage(card.prompt)}
                  className="flex items-center gap-2 rounded-full border border-white/[0.03] bg-white/[0.015] hover:bg-white/[0.04] hover:border-white/[0.08] px-3.5 py-1.5 text-xs text-slate-400 hover:text-white transition-all duration-300 cursor-pointer hover:scale-[1.01] active:scale-98"
                >
                  {card.icon}
                  <span>{card.title}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          
          /* Elegant Borderless Message Feed */
          <div className="mx-auto max-w-2xl space-y-8 pb-12">
            {chat.messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isEditing = editingMessageId === msg.id;

              // sibling nodes branching
              let siblings: string[] = [];
              let currentSiblingIndex = 0;
              
              if (chat.messageTree && chat.messageTree[msg.id]) {
                const node = chat.messageTree[msg.id];
                const parentId = node.parentId;
                
                if (parentId === null) {
                  siblings = Object.values(chat.messageTree)
                    .filter(n => n.parentId === null)
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map(n => n.id);
                } else if (chat.messageTree[parentId]) {
                  siblings = chat.messageTree[parentId].children || [];
                }
                
                currentSiblingIndex = siblings.indexOf(msg.id);
              }

              const hasSiblings = siblings.length > 1;

              return (
                <div
                  key={msg.id}
                  className={`group relative flex w-full animate-fade-in ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {isUser ? (
                    <div className="flex flex-col items-end max-w-[90%]">
                      <div
                        className={`message-card-body relative transition-all bg-white/[0.035] border border-white/[0.03] text-slate-200 px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-sm ${fontSizeClasses[fontSize]}`}
                      >
                        {/* User edit window */}
                        {isEditing ? (
                          <div className="flex flex-col gap-2.5 w-full min-w-[240px] sm:min-w-[320px]">
                            <textarea
                              value={editInputValue}
                              onChange={(e) => setEditInputValue(e.target.value)}
                              rows={Math.max(2, editInputValue.split('\n').length)}
                              className="w-full bg-transparent border-0 p-0 text-slate-200 focus:outline-none focus:ring-0 resize-none font-sans leading-relaxed select-text"
                              style={{ fontSize: 'var(--chat-font-size-user)' }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEditedMessage(msg.id);
                                }
                              }}
                            />
                            <div className="flex justify-end gap-1.5 pt-2 border-t border-white/[0.03] select-none">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="rounded-lg border border-white/[0.05] bg-white/[0.02] hover:bg-white/5 hover:text-white px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition cursor-pointer active:scale-95"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveEditedMessage(msg.id)}
                                className="rounded-lg bg-brand-600 hover:bg-brand-500 px-3 py-1 text-[10px] font-semibold text-white shadow-sm transition cursor-pointer active:scale-95"
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {msg.content && (
                              <div className="whitespace-pre-wrap leading-relaxed select-text" style={{ fontSize: 'var(--chat-font-size-user)' }}>
                                {msg.content}
                              </div>
                            )}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-2 select-none">
                                {msg.attachments.map(att => {
                                  const isImage = att.type.startsWith('image/');
                                  return (
                                    <div
                                      key={att.id}
                                      className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] p-1.5 text-[10px] text-slate-350"
                                    >
                                      {isImage ? (
                                        <img
                                          src={att.data}
                                          alt={att.name}
                                          className="h-7 w-7 rounded object-cover border border-white/[0.08]"
                                        />
                                      ) : (
                                        <div className="flex h-7 w-7 items-center justify-center rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">
                                          <FileText className="h-4 w-4" />
                                        </div>
                                      )}
                                      <div className="flex flex-col min-w-0">
                                        <span className="truncate max-w-[120px] font-semibold text-slate-200 leading-tight">{att.name}</span>
                                        <span className="text-[8px] text-slate-400 mt-0.5">{(att.size / 1024).toFixed(1)} KB</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Branching chips and Action Buttons Below User Bubble */}
                      {!isEditing && (
                        <div className="mt-1.5 flex items-center justify-between w-full select-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-1">
                          {hasSiblings ? (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-600 select-none">
                              <button
                                onClick={() => currentSiblingIndex > 0 && onSwitchBranch?.(siblings[currentSiblingIndex - 1])}
                                disabled={currentSiblingIndex === 0}
                                className={`rounded p-0.5 transition cursor-pointer ${
                                  currentSiblingIndex === 0 ? 'opacity-20 cursor-not-allowed' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                }`}
                                aria-label="Previous version"
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </button>
                              <span className="px-0.5 tracking-wider font-mono text-slate-500">
                                {currentSiblingIndex + 1} / {siblings.length}
                              </span>
                              <button
                                onClick={() => currentSiblingIndex < siblings.length - 1 && onSwitchBranch?.(siblings[currentSiblingIndex + 1])}
                                disabled={currentSiblingIndex === siblings.length - 1}
                                className={`rounded p-0.5 transition cursor-pointer ${
                                  currentSiblingIndex === siblings.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                }`}
                                aria-label="Next version"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div /> /* Spacer if no siblings */
                          )}

                          {/* Icons (right aligned below bubble) */}
                          <div className="flex items-center gap-2 ml-auto">
                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              className="rounded p-0.5 text-slate-400 hover:text-slate-200 transition active:scale-90 cursor-pointer"
                              title="Copy message"
                            >
                              {copiedId === msg.id ? (
                                <Check className="h-[18px] w-[18px] text-emerald-450" />
                              ) : (
                                <Copy className="h-[18px] w-[18px]" strokeWidth={1.5} />
                              )}
                            </button>

                            <button
                              onClick={() => startEditingMessage(msg)}
                              className="rounded p-0.5 text-slate-400 hover:text-slate-200 transition active:scale-90 cursor-pointer"
                              title="Edit message"
                            >
                              <Pencil className="h-[18px] w-[18px]" strokeWidth={1.5} />
                            </button>

                            <button
                              onClick={() => onDeleteMessage(msg.id)}
                              className="rounded p-0.5 text-slate-400 hover:text-red-400 transition active:scale-90 cursor-pointer"
                              title="Delete message"
                            >
                              <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Assistant Layout */
                    <div className="flex flex-col items-start w-full max-w-[90%]">
                      <div
                        className={`message-card-body relative transition-all text-slate-300/90 py-2 w-full ${markdownFontSizeClasses[fontSize]}`}
                      >
                        {/* Assistant edit window */}
                        {isEditing ? (
                          <div className="flex flex-col gap-2.5 w-full bg-white/[0.015] border border-white/[0.03] rounded-2xl p-4 animate-fade-in">
                            <textarea
                               value={editInputValue}
                               onChange={(e) => setEditInputValue(e.target.value)}
                               rows={Math.max(3, editInputValue.split('\n').length)}
                               className="w-full bg-transparent border-0 p-0 text-slate-200 focus:outline-none focus:ring-0 resize-none font-sans leading-relaxed select-text"
                               style={{ fontSize: 'var(--chat-font-size-assistant)' }}
                               autoFocus
                               onKeyDown={(e) => {
                                 if (e.key === 'Enter' && !e.shiftKey) {
                                   e.preventDefault();
                                   saveEditedMessage(msg.id);
                                 }
                               }}
                            />
                            <div className="flex justify-end gap-1.5 pt-2 border-t border-white/[0.03] select-none">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="rounded-lg border border-white/[0.05] bg-white/[0.02] hover:bg-white/5 hover:text-white px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition cursor-pointer active:scale-95"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveEditedMessage(msg.id)}
                                className="rounded-lg bg-brand-600 hover:bg-brand-500 px-3 py-1 text-[10px] font-semibold text-white shadow-sm transition cursor-pointer active:scale-95"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col w-full">
                            {/* Parse search status and reasoning steps if any */}
                            {(() => {
                              const { hasSearch, query, status, error, results, cleanContent: searchCleanContent } = parseSearchStatus(msg.content);
                              const { thinking, content: cleanContent } = parseThinkingAndContent(searchCleanContent);
                              const isStreamingThinking = index === chat.messages.length - 1 && isGenerating && !msg.content.includes('</thinking>') && msg.content.includes('<thinking>');
                              
                              return (
                                <>
                                  {hasSearch && (
                                    <SearchStatusBadge
                                      query={query}
                                      status={status}
                                      error={error}
                                      results={results}
                                    />
                                  )}
                                  
                                  {thinking && (
                                    <div className="mb-3 rounded-xl border border-white/[0.04] bg-white/[0.01] p-3 text-xs w-full">
                                      <details className="group" open={index === chat.messages.length - 1}>
                                        <summary className="flex items-center justify-between font-semibold text-slate-400 hover:text-slate-200 cursor-pointer select-none">
                                          <span className="flex items-center gap-1.5 font-display text-[11px] tracking-wide uppercase">
                                            {isStreamingThinking ? (
                                              <Loader2 className="h-3 w-3 text-brand-500 animate-spin" />
                                            ) : (
                                              <Terminal className="h-3 w-3 text-brand-500" />
                                            )}
                                            <span>{isStreamingThinking ? 'Thinking Process...' : 'Thought Process'}</span>
                                          </span>
                                          <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-open:rotate-180" />
                                        </summary>
                                        <div className="mt-2.5 pl-3.5 border-l border-brand-500/25 text-slate-500 leading-relaxed whitespace-pre-wrap select-text font-mono text-[10.5px] max-h-52 overflow-y-auto">
                                          {thinking}
                                        </div>
                                      </details>
                                    </div>
                                  )}
                                  
                                  {cleanContent && (
                                    <div className={`select-text ${index === chat.messages.length - 1 && isGenerating ? 'typing-cursor' : ''}`}>
                                      <MarkdownRenderer content={cleanContent} />
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Branching chips and Action Buttons Below Assistant Response */}
                      {!isEditing && (
                        <div className="mt-1 flex items-center gap-3 select-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-1">
                          {/* Sibling navigation if any */}
                          {hasSiblings && (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-600 select-none mr-2">
                              <button
                                onClick={() => currentSiblingIndex > 0 && onSwitchBranch?.(siblings[currentSiblingIndex - 1])}
                                disabled={currentSiblingIndex === 0}
                                className={`rounded p-0.5 transition cursor-pointer ${
                                  currentSiblingIndex === 0 ? 'opacity-20 cursor-not-allowed' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                }`}
                                aria-label="Previous version"
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </button>
                              <span className="px-0.5 tracking-wider font-mono text-slate-500">
                                {currentSiblingIndex + 1} / {siblings.length}
                              </span>
                              <button
                                onClick={() => currentSiblingIndex < siblings.length - 1 && onSwitchBranch?.(siblings[currentSiblingIndex + 1])}
                                disabled={currentSiblingIndex === siblings.length - 1}
                                className={`rounded p-0.5 transition cursor-pointer ${
                                  currentSiblingIndex === siblings.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                }`}
                                aria-label="Next version"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          {/* Icons (left aligned below assistant response) */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              className="rounded p-0.5 text-slate-400 hover:text-slate-200 transition active:scale-90 cursor-pointer"
                              title="Copy response"
                            >
                              {copiedId === msg.id ? (
                                <Check className="h-[18px] w-[18px] text-emerald-450" />
                              ) : (
                                <Copy className="h-[18px] w-[18px]" strokeWidth={1.5} />
                              )}
                            </button>

                            <button
                              onClick={() => startEditingMessage(msg)}
                              className="rounded p-0.5 text-slate-400 hover:text-slate-200 transition active:scale-90 cursor-pointer"
                              title="Edit response"
                            >
                              <Pencil className="h-[18px] w-[18px]" strokeWidth={1.5} />
                            </button>

                            {index === chat.messages.length - 1 && (
                              <button
                                onClick={onRegenerateResponse}
                                disabled={isGenerating}
                                className="rounded p-0.5 text-slate-400 hover:text-slate-200 transition active:scale-90 disabled:opacity-50 cursor-pointer"
                                title="Regenerate response"
                              >
                                <RotateCw className={`h-[18px] w-[18px] ${isGenerating ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                              </button>
                            )}

                            <button
                              onClick={() => onDeleteMessage(msg.id)}
                              className="rounded p-0.5 text-slate-400 hover:text-red-400 transition active:scale-90 cursor-pointer"
                              title="Delete response"
                            >
                              <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer Container */}
      <footer className="flex flex-col items-center shrink-0 w-full">
        {children}
      </footer>

      {/* Floating Jump to Bottom Button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-[92px] left-1/2 -translate-x-1/2 z-30 flex h-8 px-3 items-center justify-center gap-1.5 rounded-full border border-white/[0.05] bg-slate-900/90 text-slate-400 hover:text-white shadow-2xl backdrop-blur-md transition-all hover:bg-slate-800 hover:scale-105 active:scale-95 cursor-pointer animate-fade-in text-[10px] font-semibold uppercase tracking-wider select-none"
          title="Scroll to bottom"
          aria-label="Scroll to bottom button"
        >
          <ChevronDown className="h-3.5 w-3.5 text-brand-500" />
          <span>New Messages Below</span>
        </button>
      )}

    </div>
  );
};
