import React, { useRef, useEffect, useState } from 'react';
import type { Chat, Message, SystemPrompt } from '../utils/storage';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Copy, Check, RotateCw, Edit3, Terminal, HelpCircle, FileText, ChevronDown, ChevronLeft, ChevronRight, CheckSquare, Download, PanelLeftOpen, Volume2, VolumeX, Loader2 } from 'lucide-react';

export function parseThinkingAndContent(content: string): { thinking: string | null; content: string } {
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

interface ChatAreaProps {
  chat: Chat | null;
  onSendMessage: (text: string) => void;
  isGenerating: boolean;
  onEditMessage: (messageId: string, newContent: string) => void;
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
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [activeVoiceMsgId, setActiveVoiceMsgId] = useState<string | null>(null);

  // Capture Escape key to close open dropdowns
  useEffect(() => {
    const handleEscapeCapture = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (exportDropdownOpen) {
          e.preventDefault();
          e.stopPropagation();
          setExportDropdownOpen(false);
        }
      }
    };

    if (exportDropdownOpen) {
      window.addEventListener('keydown', handleEscapeCapture, true); // capture phase
      return () => window.removeEventListener('keydown', handleEscapeCapture, true);
    }
  }, [exportDropdownOpen]);

  const stripMarkdown = (text: string): string => {
    return text
      .replace(/#+\s+/g, '')
      .replace(/[\*_`]/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/\|[^|]+\|/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  };

  const handleSpeak = (messageId: string, text: string) => {
    if ('speechSynthesis' in window) {
      if (activeVoiceMsgId === messageId) {
        window.speechSynthesis.cancel();
        setActiveVoiceMsgId(null);
        return;
      }

      window.speechSynthesis.cancel();
      const cleanText = stripMarkdown(text);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      utterance.onend = () => {
        setActiveVoiceMsgId(null);
      };
      
      utterance.onerror = () => {
        setActiveVoiceMsgId(null);
      };

      setActiveVoiceMsgId(messageId);
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const triggerDownload = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToMarkdown = () => {
    if (!chat) return;
    let mdContent = `# ${chat.title}\n\n`;
    mdContent += `*Created: ${new Date(chat.createdAt).toLocaleString()}*\n`;
    mdContent += `*Last Updated: ${new Date(chat.updatedAt).toLocaleString()}*\n\n`;
    mdContent += `---\n\n`;

    chat.messages.forEach(msg => {
      const roleLabel = msg.role === 'user' ? '### 👤 User' : '### 🤖 Assistant';
      mdContent += `${roleLabel}\n\n${msg.content}\n\n---\n\n`;
    });

    triggerDownload(mdContent, `${slugify(chat.title)}.md`, 'text/markdown');
  };

  const exportToJSON = () => {
    if (!chat) return;
    const jsonString = JSON.stringify(chat, null, 2);
    triggerDownload(jsonString, `${slugify(chat.title)}.json`, 'application/json');
  };

  const exportToPDF = () => {
    if (!chat) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    let messagesHtml = '';
    const cards = document.querySelectorAll('.message-card-body');
    
    chat.messages.forEach((msg, idx) => {
      const isUser = msg.role === 'user';
      const roleText = isUser ? 'User' : 'Assistant';
      
      let cardContent = '';
      if (cards && cards[idx]) {
        const clone = cards[idx].cloneNode(true) as HTMLElement;
        const toRemove = clone.querySelectorAll('.hover-actions, button, textarea, .branching-pagination');
        toRemove.forEach(el => el.remove());
        cardContent = clone.innerHTML;
      } else {
        cardContent = `<p>${msg.content.replace(/\n/g, '<br />')}</p>`;
      }

      messagesHtml += `
        <div class="message-row">
          <div class="message-meta">${roleText} • ${new Date(msg.timestamp).toLocaleString()}</div>
          <div class="message-content ${isUser ? 'user-content' : 'assistant-content'}">
            ${cardContent}
          </div>
        </div>
      `;
    });

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${chat.title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: white;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            line-height: 1.6;
          }
          .header {
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .title {
            font-family: 'Outfit', sans-serif;
            font-size: 26px;
            font-weight: 700;
            color: #0f172a;
            margin: 0;
          }
          .meta {
            font-size: 11px;
            color: #64748b;
            margin-top: 8px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .message-row {
            margin-bottom: 30px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .message-meta {
            font-size: 10px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
          }
          .message-content {
            font-size: 14px;
            color: #334155;
          }
          .user-content {
            background: #f8fafc;
            border-left: 3px solid #4f46e5;
            padding: 12px 16px;
            border-radius: 0 8px 8px 0;
          }
          .assistant-content {
            padding: 4px 0;
          }
          pre {
            background: #0f172a !important;
            color: #cbd5e1 !important;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: Menlo, Monaco, Consolas, monospace;
            font-size: 12px;
            overflow-x: auto;
            margin: 16px 0;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          code {
            font-family: Menlo, Monaco, Consolas, monospace;
            font-size: 12.5px;
            background: #f1f5f9;
            color: #e11d48;
            padding: 2px 4px;
            border-radius: 4px;
          }
          pre code {
            background: transparent;
            color: inherit;
            padding: 0;
            border-radius: 0;
          }
          .text-slate-500 { color: #64748b !important; font-style: italic; }
          .text-emerald-400 { color: #059669 !important; font-weight: 500; }
          .text-brand-500 { color: #4f46e5 !important; font-weight: bold; }
          .text-sky-400 { color: #0284c7 !important; font-weight: 600; }
          .text-blue-400 { color: #2563eb !important; }
          .text-amber-400 { color: #d97706 !important; }
          .text-slate-200 { color: #cbd5e1 !important; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 13px;
          }
          th, td {
            padding: 8px 12px;
            border: 1px solid #e2e8f0;
            text-align: left;
          }
          th {
            background: #f8fafc;
            color: #0f172a;
            font-weight: 600;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">${chat.title}</h1>
          <div class="meta">Transcript exported from Context AI • ${chat.messages.length} turns</div>
        </div>
        ${messagesHtml}
      </body>
      </html>
    `;

    doc.open();
    doc.write(printHtml);
    doc.close();

    setTimeout(() => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }
    }, 500);
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
              {chat ? chat.title : 'new chat'}
            </h2>
          </div>
              {/* Dropdown controls */}
        <div className="flex items-center gap-2">
          {/* Export Dropdown */}
          {chat && chat.messages.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                id="export-select-btn"
                aria-haspopup="menu"
                aria-expanded={exportDropdownOpen}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white transition cursor-pointer"
                title="Export options"
                aria-label="Export chat"
              >
                <Download className="h-3 w-3 text-slate-500 mr-0.5" />
                <span>Export</span>
                <ChevronDown className="h-3 w-3 text-slate-500" />
              </button>

              {exportDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportDropdownOpen(false)} />
                  <div 
                    role="menu" 
                    aria-labelledby="export-select-btn"
                    className="absolute right-0 mt-2.5 z-20 w-44 rounded-lg border border-white/[0.04] bg-slate-900/95 p-1 shadow-2xl backdrop-blur-xl animate-fade-in"
                  >
                    <button
                      onClick={() => {
                        exportToMarkdown();
                        setExportDropdownOpen(false);
                      }}
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-400 hover:bg-white/[0.02] hover:text-slate-200 cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Markdown (.md)</span>
                    </button>
                    <button
                      onClick={() => {
                        exportToJSON();
                        setExportDropdownOpen(false);
                      }}
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-400 hover:bg-white/[0.02] hover:text-slate-200 cursor-pointer"
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      <span>JSON (.json)</span>
                    </button>
                    <button
                      onClick={() => {
                        exportToPDF();
                        setExportDropdownOpen(false);
                      }}
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-400 hover:bg-white/[0.02] hover:text-slate-200 cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Print / PDF (.pdf)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
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
                  <div
                    className={`message-card-body relative max-w-[90%] transition-all ${
                      isUser
                        ? 'bg-white/[0.035] border border-white/[0.03] text-slate-200 px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-sm'
                        : 'text-slate-300/90 py-2 w-full'
                    } ${isUser ? fontSizeClasses[fontSize] : markdownFontSizeClasses[fontSize]}`}
                  >
                    
                    {/* User / Assistant edit window */}
                    {isEditing ? (
                      <div className="flex flex-col gap-2 min-w-[300px]">
                        <textarea
                           value={editInputValue}
                           onChange={(e) => setEditInputValue(e.target.value)}
                           rows={4}
                           className="w-full bg-slate-900 border border-white/[0.05] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500/50 font-mono text-slate-200"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setEditingMessageId(null)}
                            className="rounded border border-white/[0.05] bg-white/[0.01] px-2 py-0.5 text-[9px] font-medium text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEditedMessage(msg.id)}
                            className="rounded bg-brand-600 px-2 py-0.5 text-[9px] font-medium text-white hover:bg-brand-500"
                          >
                            {isUser ? 'Send' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* message content stream */}
                        {isUser ? (
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
                        ) : (
                          <div className="flex flex-col w-full">
                            {/* Parse reasoning steps if any */}
                            {(() => {
                              const { thinking, content: cleanContent } = parseThinkingAndContent(msg.content);
                              const isStreamingThinking = index === chat.messages.length - 1 && isGenerating && !msg.content.includes('</thinking>') && msg.content.includes('<thinking>');
                              
                              return (
                                <>
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

                        {/* branching chips */}
                        {hasSiblings && !isEditing && (
                          <div className="mt-2 flex items-center gap-1 text-[9px] font-bold text-slate-600 select-none w-max">
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

                        {/* Inline Minimalist Hover Toolbars */}
                        {!isEditing && (
                          <div
                            className={`absolute ${
                              isUser ? 'right-2 -top-3.5' : 'right-2 -bottom-3'
                            } z-10 flex items-center gap-1 rounded-md bg-slate-900/90 border border-white/[0.04] px-1 py-0.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-350 select-none`}
                          >
                            {isUser ? (
                              <button
                                onClick={() => startEditingMessage(msg)}
                                className="flex items-center gap-1 rounded hover:bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 hover:text-white"
                                title="Edit message"
                              >
                                <Edit3 className="h-2.5 w-2.5" />
                                <span>Edit</span>
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEditingMessage(msg)}
                                  className="flex items-center gap-1 rounded hover:bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 hover:text-white"
                                  title="Edit response"
                                >
                                  <Edit3 className="h-2.5 w-2.5" />
                                  <span>Edit</span>
                                </button>

                                <button
                                  onClick={() => handleCopyMessage(msg.id, msg.content)}
                                  className="flex items-center gap-1 rounded hover:bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 hover:text-white"
                                  title="Copy response"
                                >
                                  {copiedId === msg.id ? (
                                    <>
                                      <Check className="h-2.5 w-2.5 text-emerald-500" />
                                      <span className="text-emerald-500 font-semibold">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-2.5 w-2.5" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  onClick={() => handleSpeak(msg.id, msg.content)}
                                  className="flex items-center gap-1 rounded hover:bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 hover:text-white"
                                  title={activeVoiceMsgId === msg.id ? "Stop voice" : "Speak voice"}
                                  aria-label={activeVoiceMsgId === msg.id ? "Stop voice" : "Play voice"}
                                >
                                  {activeVoiceMsgId === msg.id ? (
                                    <>
                                      <VolumeX className="h-2.5 w-2.5 text-red-500 animate-pulse" />
                                      <span className="text-red-500 font-semibold">Stop</span>
                                    </>
                                  ) : (
                                    <>
                                      <Volume2 className="h-2.5 w-2.5" />
                                      <span>Speak</span>
                                    </>
                                  )}
                                </button>

                                {index === chat.messages.length - 1 && (
                                  <button
                                    onClick={onRegenerateResponse}
                                    disabled={isGenerating}
                                    className="flex items-center gap-1 rounded hover:bg-white/5 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 hover:text-white disabled:opacity-50"
                                    title="Regenerate response"
                                  >
                                    <RotateCw className={`h-2.5 w-2.5 ${isGenerating ? 'animate-spin' : ''}`} />
                                    <span>Retry</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
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
          className="absolute bottom-24 right-8 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.05] bg-slate-900/90 text-slate-400 shadow-2xl backdrop-blur-md transition-all hover:bg-slate-800 hover:text-white hover:scale-105 active:scale-95 cursor-pointer animate-fade-in"
          title="Scroll to bottom"
          aria-label="Scroll to bottom button"
        >
          <ChevronDown className="h-4 w-4 text-brand-500 animate-bounce" />
        </button>
      )}

    </div>
  );
};
