import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { Chat, Message, Settings } from '../utils/storage';
import type { WorkspaceTab } from '../hooks/useWorkspaceLayout';
import { MarkdownRenderer } from './MarkdownRenderer';
import { BrowserLiveView } from './BrowserLiveView';
import { TextLoader } from 'generative-loaders';
import { Copy, Check, RotateCw, Pencil, Trash2, Terminal, HelpCircle, FileText, Database, ChevronDown, ChevronLeft, ChevronRight, PanelLeftOpen, Loader2, Globe, AlertTriangle, ExternalLink, ArrowUp, CornerDownLeft, EyeOff, X, Volume2, VolumeX, Download, Compass, Calendar, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { cleanSnippetText, getFaviconUrl, type SearxngResult } from '../utils/searxng';

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
  status: 'searching' | 'scraping' | 'done' | 'failed';
  error: string | null;
  results: SearxngResult[];
  cleanContent: string;
}


function parseSearchStatus(content: string): SearchStatus {
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
      query: cleanSnippetText(match[1]),
      status: match[2] as 'searching' | 'scraping' | 'done' | 'failed',
      error: match[3] ? cleanSnippetText(match[3]) : null,
      results,
      cleanContent: content.replace(tagRegex, '').trim()
    };
  }

  const selfClosingRegex = /<search_status\s+query="([^"]*)"\s+status="([^"]*)"(?:\s+error="([^"]*)")?\s*\/>/i;
  match = content.match(selfClosingRegex);
  if (match) {
    return {
      hasSearch: true,
      query: cleanSnippetText(match[1]),
      status: match[2] as 'searching' | 'scraping' | 'done' | 'failed',
      error: match[3] ? cleanSnippetText(match[3]) : null,
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

interface CrawlStatus {
  hasCrawl: boolean;
  url: string;
  title?: string;
  status: 'crawling' | 'done' | 'failed';
  error: string | null;
  content: string;
  cleanContent: string;
}

function parseCrawlStatus(content: string): CrawlStatus {
  const tagRegex = /<crawl_status\s+url="([^"]*)"\s+status="([^"]*)"(?:\s+title="([^"]*)")?(?:\s+error="([^"]*)")?>([\s\S]*?)<\/crawl_status>/i;
  let match = content.match(tagRegex);

  if (match) {
    let crawledText = '';
    try {
      if (match[5].trim()) {
        const parsed = JSON.parse(match[5].trim());
        if (Array.isArray(parsed) && parsed[0]?.content) {
          crawledText = parsed[0].content;
        } else if (typeof parsed === 'string') {
          crawledText = parsed;
        }
      }
    } catch {
      crawledText = match[5].trim();
    }

    return {
      hasCrawl: true,
      url: cleanSnippetText(match[1]),
      status: match[2] as 'crawling' | 'done' | 'failed',
      title: match[3] ? cleanSnippetText(match[3]) : undefined,
      error: match[4] ? cleanSnippetText(match[4]) : null,
      content: crawledText,
      cleanContent: content.replace(tagRegex, '').trim()
    };
  }

  const selfClosingRegex = /<crawl_status\s+url="([^"]*)"\s+status="([^"]*)"(?:\s+title="([^"]*)")?(?:\s+error="([^"]*)")?\s*\/>/i;
  match = content.match(selfClosingRegex);
  if (match) {
    return {
      hasCrawl: true,
      url: cleanSnippetText(match[1]),
      status: match[2] as 'crawling' | 'done' | 'failed',
      title: match[3] ? cleanSnippetText(match[3]) : undefined,
      error: match[4] ? cleanSnippetText(match[4]) : null,
      content: '',
      cleanContent: content.replace(selfClosingRegex, '').trim()
    };
  }

  return {
    hasCrawl: false,
    url: '',
    status: 'crawling',
    error: null,
    content: '',
    cleanContent: content
  };
}


interface QuestionDetails {
  hasQuestion: boolean;
  question: string;
  options: string[];
  allowCustom: boolean;
  allowSkip: boolean;
  cleanContent: string;
}

function parseQuestion(content: string): QuestionDetails {
  const openTagMatch = content.match(/<ask_question([\s\S]*?)>/i);
  if (!openTagMatch) {
    return {
      hasQuestion: false,
      question: '',
      options: [],
      allowCustom: true,
      allowSkip: true,
      cleanContent: content
    };
  }

  const attributesStr = openTagMatch[1];
  
  const questionMatch = attributesStr.match(/question=(["'])([\s\S]*?)\1/i) || attributesStr.match(/question=([^\s>]+)/i);
  const question = questionMatch ? questionMatch[2] || questionMatch[1] : '';

  const customMatch = attributesStr.match(/allowCustom=(["'])([\s\S]*?)\1/i) || attributesStr.match(/allowCustom=([^\s>]+)/i);
  const skipMatch = attributesStr.match(/allowSkip=(["'])([\s\S]*?)\1/i) || attributesStr.match(/allowSkip=([^\s>]+)/i);

  const allowCustom = customMatch ? (customMatch[2] || customMatch[1]) !== 'false' : true;
  const allowSkip = skipMatch ? (skipMatch[2] || skipMatch[1]) !== 'false' : true;

  const openTagIndex = content.indexOf(openTagMatch[0]);
  const closeTagIndex = content.toLowerCase().indexOf('</ask_question>', openTagIndex + openTagMatch[0].length);

  let innerContent: string;
  let cleanContent: string;

  if (closeTagIndex !== -1) {
    innerContent = content.substring(openTagIndex + openTagMatch[0].length, closeTagIndex);
    cleanContent = content.substring(0, openTagIndex) + content.substring(closeTagIndex + '</ask_question>'.length);
  } else {
    innerContent = content.substring(openTagIndex + openTagMatch[0].length);
    cleanContent = content.substring(0, openTagIndex);
  }

  const options: string[] = [];
  const optionRegex = /<option[^>]*>([\s\S]*?)(?:<\/option>|$)/gi;
  let optionMatch;
  while ((optionMatch = optionRegex.exec(innerContent)) !== null) {
    const optText = optionMatch[1].trim();
    if (optText) {
      options.push(optText);
    }
  }

  return {
    hasQuestion: !!question,
    question,
    options,
    allowCustom,
    allowSkip,
    cleanContent: cleanContent.trim()
  };
}

interface QuestionCardProps {
  question: string;
  options: string[];
  allowCustom: boolean;
  allowSkip: boolean;
  isAnswered: boolean;
  selectedAnswer: string | null;
  onAnswer: (answer: string) => void;
  isGenerating: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  options,
  allowCustom,
  allowSkip,
  isAnswered,
  selectedAnswer,
  onAnswer,
  isGenerating
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputValue, setCustomInputValue] = useState('');

  const handleCustomSubmit = () => {
    if (customInputValue.trim()) {
      onAnswer(customInputValue.trim());
      setShowCustomInput(false);
      setCustomInputValue('');
    }
  };

  const isCustomAnswerSelected = useMemo(() => {
    if (!isAnswered || !selectedAnswer) return false;
    const ans = selectedAnswer.trim().toLowerCase();
    if (ans === 'skip') return false;
    return !options.some(opt => opt.trim().toLowerCase() === ans);
  }, [isAnswered, selectedAnswer, options]);

  return (
    <div className="my-4 p-5 rounded-lg border border-border bg-card shadow-sm max-w-md w-full animate-fade-in text-card-foreground">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 select-none">
        <h4 className="font-sans text-sm font-semibold text-foreground leading-snug">
          {question}
        </h4>
        {!isAnswered && allowSkip && (
          <button
            onClick={() => onAnswer('Skip')}
            disabled={isGenerating}
            title="Skip question"
            aria-label="Skip question"
            className="text-muted-foreground hover:text-foreground rounded p-0.5 transition cursor-pointer disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Options List */}
      <div className="mt-4 space-y-2">
        {options.map((opt, i) => {
          const isSelected = isAnswered && selectedAnswer?.trim().toLowerCase() === opt.trim().toLowerCase();
          
          return (
            <button
              key={i}
              disabled={isAnswered || isGenerating}
              onClick={() => onAnswer(opt)}
              className={`group flex items-center w-full rounded-md p-3 text-left transition duration-200 ${
                isAnswered
                  ? isSelected
                    ? 'bg-primary/10 border border-primary/30 text-primary font-semibold'
                    : 'bg-muted/20 border border-border text-muted-foreground opacity-55 cursor-default'
                  : 'bg-background hover:bg-accent border border-border text-foreground hover:text-accent-foreground cursor-pointer active:scale-[0.99] disabled:opacity-50'
              }`}
            >
              {/* Number Badge / Check */}
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10.5px] font-bold transition duration-200 ${
                isAnswered
                  ? isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                  : 'bg-muted text-muted-foreground group-hover:bg-accent-foreground/10 group-hover:text-foreground'
              }`}>
                {isSelected ? <Check className="h-3 w-3 stroke-[3]" /> : i + 1}
              </div>
              
              <span className="flex-1 pl-3 text-xs leading-normal">{opt}</span>
              
              {!isAnswered && !isGenerating && (
                <CornerDownLeft className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity text-primary shrink-0 ml-2" />
              )}
            </button>
          );
        })}

        {/* Custom Input Option */}
        {allowCustom && (
          <>
            {isAnswered ? (
              isCustomAnswerSelected && (
                <div className="group flex items-center w-full rounded-md p-3 text-left border bg-primary/10 border-primary/30 text-primary font-semibold select-text">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground text-[10.5px] font-bold select-none">
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                  </div>
                  <span className="flex-1 pl-3 text-xs leading-normal">{selectedAnswer}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-primary border border-primary/20 px-1.5 py-0.5 rounded shrink-0 select-none">Custom</span>
                </div>
              )
            ) : (
              <div className="mt-2">
                {showCustomInput ? (
                  <div className="flex flex-col gap-2 p-3 border border-border bg-muted/30 rounded-md animate-scale-in">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground select-none">Enter custom answer</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customInputValue}
                        onChange={(e) => setCustomInputValue(e.target.value)}
                        placeholder="Type your response..."
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCustomSubmit();
                          }
                        }}
                        className="flex-1 bg-background border border-input rounded-md px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <button
                        onClick={handleCustomSubmit}
                        disabled={!customInputValue.trim() || isGenerating}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground shadow-sm transition cursor-pointer active:scale-90"
                      >
                        <ArrowUp className="h-4 w-4 stroke-[2.5]" />
                      </button>
                      <button
                        onClick={() => setShowCustomInput(false)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent text-muted-foreground hover:text-accent-foreground transition cursor-pointer active:scale-90"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    disabled={isGenerating}
                    onClick={() => setShowCustomInput(true)}
                    className="group flex items-center w-full rounded-md p-3 text-left transition duration-200 bg-background hover:bg-accent border border-dashed border-input text-muted-foreground hover:text-foreground cursor-pointer active:scale-[0.99] disabled:opacity-40"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground group-hover:bg-accent-foreground/10 group-hover:text-foreground text-[10.5px]">
                      <Pencil className="h-3 w-3" />
                    </div>
                    <span className="flex-1 pl-3 text-xs leading-normal italic">Something else</span>
                    <ChevronRight className="h-3 w-3 opacity-30 group-hover:opacity-75 transition-opacity text-muted-foreground shrink-0 ml-2" />
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Answered: Skipped Indicator */}
      {isAnswered && selectedAnswer?.toLowerCase() === 'skip' && (
        <div className="mt-4 flex items-center gap-2 text-muted-foreground text-xs italic pl-1 animate-fade-in select-none">
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
          <span>You skipped this question</span>
        </div>
      )}

      {/* Footer Skip Action */}
      {!isAnswered && allowSkip && (
        <div className="mt-4 border-t border-border pt-3 flex justify-between items-center shrink-0 select-none">
          <div className="text-[10px] text-muted-foreground font-semibold tracking-wide flex items-center gap-1 select-none">
            <HelpCircle className="h-3 w-3" />
            <span>Interactive Selection</span>
          </div>
          
          <button
            disabled={isGenerating}
            onClick={() => onAnswer('Skip')}
            className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground border border-input bg-background hover:bg-accent px-3.5 py-1.5 rounded-md transition active:scale-95 cursor-pointer disabled:opacity-40"
          >
            <span>Skip</span>
          </button>
        </div>
      )}
    </div>
  );
};

function formatHostname(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return urlStr || '';
  }
}

interface SearchStatusBadgeProps {
  query: string;
  status: 'searching' | 'scraping' | 'done' | 'failed';
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

  if (status === 'searching' || status === 'scraping') {
    const isScraping = status === 'scraping';
    return (
      <div className="mb-4 rounded-md border border-border bg-muted/40 p-3.5 animate-fade-in select-none">
        <div className="flex items-center gap-3">
          <div className="relative flex h-6 w-6 items-center justify-center rounded bg-accent text-accent-foreground border border-border">
            <Globe className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: '3s' }} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {isScraping ? 'Web RAG Integration' : 'Web Search Active'}
            </span>
            <span className="text-xs font-medium text-foreground leading-snug">
              {isScraping
                ? `Scraping & analyzing top search results for "${query}"...`
                : `Searching the web for "${query}"...`}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3.5 animate-fade-in select-none">
        <div className="flex items-center gap-3 text-destructive">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider">Search Failed</span>
            <span className="text-xs font-medium leading-snug">
              Could not complete search for "{query}" • <span className="font-mono text-[10.5px]">{error || 'Unknown issue'}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  const hasResults = results && results.length > 0;

  return (
    <div className="mb-4 rounded-md border border-border bg-muted/30 p-2.5 animate-fade-in select-none">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-muted border border-border text-foreground">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Web Search Completed</span>
            <span className="text-xs font-medium text-foreground truncate mt-1">
              Searched the web for: <span className="font-semibold font-mono">"{query}"</span>
            </span>
          </div>
        </div>

        {hasResults && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 rounded-md border border-input bg-background hover:bg-accent text-[10px] font-semibold text-muted-foreground hover:text-accent-foreground px-2.5 py-1.5 transition active:scale-95 cursor-pointer shrink-0"
          >
            <span>Sources ({results.length})</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Expanded Sources Grid */}
      {isExpanded && hasResults && (
        <div className="mt-3 border-t border-border pt-3 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {results.map((r, idx) => (
              <a
                key={idx}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                title={r.title}
                className="group flex flex-col justify-between rounded-md border border-border bg-card hover:bg-accent hover:text-accent-foreground p-3 transition-all duration-200"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-[9.5px] font-bold text-muted-foreground uppercase tracking-wide">
                    {getFaviconUrl(r.url) ? (
                      <img
                        src={getFaviconUrl(r.url)}
                        alt=""
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        className="h-3.5 w-3.5 rounded-sm object-contain"
                      />
                    ) : (
                      <Globe className="h-3 w-3" />
                    )}
                    <span className="truncate max-w-[130px]">{formatHostname(r.url)}</span>
                  </div>
                  <span className="text-[11.5px] font-semibold text-foreground leading-snug line-clamp-1 transition-colors">
                    {r.title}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground leading-snug">
                  <span className="line-clamp-1 pr-4 italic shrink min-w-0 text-muted-foreground">
                    {r.content || 'View page details...'}
                  </span>
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
interface CrawlStatusBadgeProps {
  url: string;
  status: 'crawling' | 'done' | 'failed';
  title?: string;
  error: string | null;
  content?: string;
}

export const CrawlStatusBadge: React.FC<CrawlStatusBadgeProps> = ({
  url,
  status,
  title,
  error,
  content
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (status === 'crawling') {
    return (
      <div className="mb-4 rounded-md border border-border bg-muted/40 p-3.5 animate-fade-in select-none">
        <div className="flex items-center gap-3">
          <div className="relative flex h-6 w-6 items-center justify-center rounded bg-accent text-accent-foreground border border-border">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Web Context Extraction
            </span>
            <span className="text-xs font-medium text-foreground leading-snug">
              Reading web context from <span className="font-mono">{formatHostname(url)}</span>...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3.5 animate-fade-in select-none">
        <div className="flex items-center gap-3 text-destructive">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider">Crawl Failed</span>
            <span className="text-xs font-medium leading-snug">
              Could not extract web context from "{url}" • <span className="font-mono text-[10.5px]">{error || 'Unknown error'}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  const favicon = getFaviconUrl(url);

  return (
    <div className="mb-4 rounded-md border border-border bg-muted/30 p-2.5 animate-fade-in select-none">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-muted border border-border text-foreground overflow-hidden">
            {favicon ? (
              <img
                src={favicon}
                alt=""
                className="h-3.5 w-3.5 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <FileText className="h-3.5 w-3.5 text-primary" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Web Context Extracted</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-foreground truncate mt-1 hover:text-primary transition inline-flex items-center gap-1"
            >
              <span className="font-semibold">{title || formatHostname(url)}</span>
              <ExternalLink className="h-2.5 w-2.5 opacity-60" />
            </a>
          </div>
        </div>

        {content && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 rounded-md border border-input bg-background hover:bg-accent text-[10px] font-semibold text-muted-foreground hover:text-accent-foreground px-2.5 py-1.5 transition active:scale-95 cursor-pointer shrink-0"
          >
            <span>Preview Content</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {isExpanded && content && (
        <div className="mt-3 border-t border-border pt-3 animate-fade-in">
          <div className="max-h-48 overflow-y-auto p-2.5 rounded bg-background/50 border border-border font-mono text-[11px] text-muted-foreground whitespace-pre-wrap select-text">
            {content.slice(0, 3000) + (content.length > 3000 ? '\n\n...[Content truncated]' : '')}
          </div>
        </div>
      )}
    </div>
  );
};

interface RegenerateButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  title: string;
}

const RegenerateButton: React.FC<RegenerateButtonProps> = ({ onClick, disabled, isLoading = false, title }) => (
  <button
    onClick={onClick}
    disabled={disabled || isLoading}
    className="rounded p-1 hover:bg-accent hover:text-foreground transition disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    title={title}
    aria-label={title}
  >
    <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
  </button>
);

const WORKSPACE_PANEL_TABS: Array<{
  id: WorkspaceTab;
  label: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'browser', label: 'Browser', title: 'Toggle Browser Panel', icon: Compass },
  { id: 'schedules', label: 'Scheduler', title: 'Toggle Scheduler Panel', icon: Calendar },
];

interface ChatAreaProps {
  chat?: Chat | null;
  onSendMessage: (content: string) => void;
  isGenerating: boolean;
  queuedMessageIds?: Set<string>;
  onEditMessage: (id: string, newContent: string) => void;
  onDeleteMessage: (id: string) => void;
  onRegenerateResponse: (id?: string) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onSwitchBranch?: (messageId: string) => void;
  onOpenBrowserModal?: (sessionId?: string) => void;
  settings?: Settings;
  isWorkspaceOpen?: boolean;
  workspaceTab?: WorkspaceTab;
  onToggleWorkspaceTab?: (tab: WorkspaceTab) => void;
  onOpenSettings?: () => void;
  children?: React.ReactNode;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  chat,
  onSendMessage,
  isGenerating,
  queuedMessageIds,
  onEditMessage,
  onDeleteMessage,
  onRegenerateResponse,
  isSidebarCollapsed,
  onToggleSidebar,
  onSwitchBranch,
  onOpenBrowserModal,
  settings,
  isWorkspaceOpen,
  workspaceTab,
  onToggleWorkspaceTab,
  onOpenSettings,
  children
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  const displayMessages = useMemo(() => {
    if (!chat || !chat.messages) return [];
    if (!queuedMessageIds || queuedMessageIds.size === 0) return chat.messages;
    return chat.messages.filter(m => !queuedMessageIds.has(m.id));
  }, [chat?.messages, queuedMessageIds]);

  const handleToggleSpeech = (msgId: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingMessageId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();

    const cleanText = text
      .replace(/<(?:thinking|thought)>[\s\S]*?<\/(?:thinking|thought)>/gi, '')
      .replace(/<search_status[\s\S]*?<\/search_status>/gi, '')
      .replace(/<crawl_status[\s\S]*?<\/crawl_status>/gi, '')
      .replace(/<ask_question[\s\S]*?<\/ask_question>/gi, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const exportConversation = (format: 'md' | 'json' | 'txt') => {
    if (!chat || !displayMessages.length) return;
    const safeTitle = (chat.title || 'conversation').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${safeTitle}.${format}`;
    let mimeType = 'text/plain';
    let content: string;

    if (format === 'json') {
      content = JSON.stringify({ ...chat, messages: displayMessages }, null, 2);
      mimeType = 'application/json';
    } else if (format === 'md') {
      content = `# ${chat.title}\n\n*Exported on ${new Date().toLocaleString()}*\n\n` +
        displayMessages.map(m => `### ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.content}`).join('\n\n---\n\n');
      mimeType = 'text/markdown';
    } else {
      content = `${chat.title}\n${'='.repeat(chat.title.length)}\n\n` +
        displayMessages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setExportDropdownOpen(false);
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
  }, [displayMessages, isGenerating]);

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

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background text-foreground relative">
      
      {/* Header Bar */}
      {/* Modern Workstation Header Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between px-4 md:px-6 bg-card text-card-foreground select-none border-b border-border gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {isSidebarCollapsed && (
            <button
              onClick={onToggleSidebar}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition active:scale-95 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Expand sidebar (Ctrl+B)"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4 text-primary" />
            </button>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="font-sans text-xs font-semibold text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-md lg:max-w-xl">
              {chat ? chat.title : 'New Conversation'}
            </h2>

            {/* Active Model Badge */}
            {settings?.model && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-mono font-medium shrink-0"
                title={`Active AI Provider: ${settings.provider} (${settings.model})`}
              >
                <Sparkles className="h-2.5 w-2.5" />
                <span className="truncate max-w-[110px]">{settings.model.split('/').pop()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Header Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Export Dropdown */}
          {chat && displayMessages.length > 0 && (
            <div className="relative select-none">
              <button
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="flex items-center gap-1.5 rounded-md border border-input bg-background hover:bg-accent text-muted-foreground hover:text-accent-foreground px-2 py-1.5 sm:px-2.5 text-xs font-medium transition cursor-pointer active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title="Export conversation"
                aria-label="Export conversation"
                aria-expanded={exportDropdownOpen}
                aria-haspopup="menu"
              >
                <Download className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>

              {exportDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setExportDropdownOpen(false)} />
                  <div role="menu" className="absolute right-0 top-full mt-1.5 w-44 rounded-lg border border-border bg-popover p-1 shadow-xl z-30 text-popover-foreground animate-fade-in">
                    <button
                      role="menuitem"
                      onClick={() => { exportConversation('md'); setExportDropdownOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent text-foreground transition"
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Markdown (.md)</span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { exportConversation('txt'); setExportDropdownOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent text-foreground transition"
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Plain Text (.txt)</span>
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { exportConversation('json'); setExportDropdownOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent text-foreground transition"
                    >
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>JSON Raw (.json)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Browser & Scheduler Workspace Buttons */}
          {onToggleWorkspaceTab && (
            <div className="flex items-center gap-1">
              {WORKSPACE_PANEL_TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = isWorkspaceOpen && workspaceTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onToggleWorkspaceTab(tab.id)}
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition cursor-pointer active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      isActive
                        ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                        : 'border-input bg-background hover:bg-accent text-muted-foreground hover:text-accent-foreground'
                    }`}
                    title={tab.title}
                    aria-label={tab.title}
                    aria-pressed={isActive}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Settings Quick Access Button */}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="rounded-md p-1.5 border border-input bg-background hover:bg-accent text-muted-foreground hover:text-accent-foreground transition active:scale-95 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              title="Open Settings"
              aria-label="Open Settings"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Messages Feed Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin select-text"
      >
        {!chat || displayMessages.length === 0 ? null : (
          
          /* Borderless Message Feed */
          <div className="mx-auto max-w-2xl space-y-8 pb-12">
            {displayMessages.map((msg, index) => {
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
                        className="message-card-body relative transition-colors bg-muted text-muted-foreground px-4 py-2.5 rounded-lg shadow-sm border border-border text-sm"
                      >
                        {/* User edit window */}
                        {isEditing ? (
                          <div className="flex flex-col gap-2.5 w-full min-w-[240px] sm:min-w-[320px]">
                            <textarea
                              value={editInputValue}
                              onChange={(e) => setEditInputValue(e.target.value)}
                              rows={Math.max(2, editInputValue.split('\n').length)}
                              className="w-full bg-transparent border-0 p-0 text-foreground focus:outline-none focus:ring-0 resize-none font-sans leading-relaxed select-text text-sm"
                              style={{ resize: 'none' }}
                              autoFocus
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    saveEditedMessage(msg.id);
                                  }
                              }}
                            />
                            <div className="flex justify-end gap-1.5 pt-2 border-t border-border select-none">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition cursor-pointer active:scale-95"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveEditedMessage(msg.id)}
                                className="rounded-md bg-primary hover:bg-primary/90 px-3 py-1 text-[10px] font-semibold text-primary-foreground shadow-sm transition cursor-pointer active:scale-95"
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {msg.content && (
                              <div className="whitespace-pre-wrap leading-relaxed select-text text-foreground text-sm">
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
                                      className="flex items-center gap-1.5 rounded border border-border bg-background p-1.5 text-[10px]"
                                    >
                                      {isImage ? (
                                        <img
                                          src={att.data}
                                          alt={att.name}
                                          className="h-7 w-7 rounded object-cover border border-border"
                                        />
                                      ) : (
                                        <div className="flex h-7 w-7 items-center justify-center rounded bg-muted border border-border text-foreground">
                                          <FileText className="h-4 w-4" />
                                        </div>
                                      )}
                                      <div className="flex flex-col min-w-0 text-foreground">
                                        <span className="truncate max-w-[120px] font-semibold leading-tight">{att.name}</span>
                                        <span className="text-[8px] text-muted-foreground mt-0.5">{(att.size / 1024).toFixed(1)} KB</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Sibling navigation and actions */}
                      {!isEditing && (
                        <div className="mt-1.5 flex items-center justify-between w-full select-none opacity-100 transition-opacity duration-200 px-1">
                          {hasSiblings ? (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground select-none">
                              <button
                                onClick={() => currentSiblingIndex > 0 && onSwitchBranch?.(siblings[currentSiblingIndex - 1])}
                                disabled={currentSiblingIndex === 0}
                                className={`rounded p-0.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                                  currentSiblingIndex === 0 ? 'opacity-20 cursor-not-allowed' : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                                }`}
                                aria-label="Previous version"
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </button>
                              <span className="px-0.5 tracking-wider font-mono text-muted-foreground/80">
                                {currentSiblingIndex + 1} / {siblings.length}
                              </span>
                              <button
                                onClick={() => currentSiblingIndex < siblings.length - 1 && onSwitchBranch?.(siblings[currentSiblingIndex + 1])}
                                disabled={currentSiblingIndex === siblings.length - 1}
                                className={`rounded p-0.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                                  currentSiblingIndex === siblings.length - 1 ? 'opacity-20 cursor-not-allowed' : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                                }`}
                                aria-label="Next version"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div />
                          )}

                          <div className="flex items-center gap-1.5 ml-auto text-muted-foreground">
                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              className="rounded p-1 hover:bg-accent hover:text-foreground transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              title="Copy message"
                              aria-label="Copy message"
                            >
                              {copiedId === msg.id ? (
                                <Check className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => startEditingMessage(msg)}
                              className="rounded p-1 hover:bg-accent hover:text-foreground transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              title="Edit message"
                              aria-label="Edit message"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <RegenerateButton
                              onClick={() => onRegenerateResponse(msg.id)}
                              disabled={isGenerating}
                              isLoading={false}
                              title="Resend message"
                            />
                            <button
                              onClick={() => onDeleteMessage(msg.id)}
                              className="rounded p-1 hover:bg-accent hover:text-destructive transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              title="Delete message"
                              aria-label="Delete message"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Assistant Layout */
                    <div className="flex flex-col items-start w-full max-w-[90%]">
                      <div
                        className="message-card-body relative transition-colors text-foreground py-2 w-full text-sm"
                      >
                        {/* Assistant edit window */}
                        {isEditing ? (
                          <div className="flex flex-col gap-2.5 w-full bg-muted/20 border border-border rounded-lg p-4 animate-fade-in">
                            <textarea
                               value={editInputValue}
                               onChange={(e) => setEditInputValue(e.target.value)}
                               rows={Math.max(3, editInputValue.split('\n').length)}
                               className="w-full bg-transparent border-0 p-0 text-foreground focus:outline-none focus:ring-0 resize-none font-sans leading-relaxed select-text"
                               style={{ resize: 'none' }}
                               autoFocus
                               onKeyDown={(e) => {
                                 if (e.key === 'Enter' && !e.shiftKey) {
                                   e.preventDefault();
                                   saveEditedMessage(msg.id);
                                 }
                               }}
                            />
                            <div className="flex justify-end gap-1.5 pt-2 border-t border-border select-none">
                              <button
                                onClick={() => setEditingMessageId(null)}
                                className="rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground px-2.5 py-1 text-[10px] font-semibold text-muted-foreground transition cursor-pointer active:scale-95"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveEditedMessage(msg.id)}
                                className="rounded-md bg-primary hover:bg-primary/90 px-3 py-1 text-[10px] font-semibold text-primary-foreground shadow-sm transition cursor-pointer active:scale-95"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col w-full">
                            {(() => {
                              const searchMeta = msg.metadata?.search;
                              const hasMetaSearch = Boolean(searchMeta && searchMeta.shouldSearch && searchMeta.results && searchMeta.results.length > 0);
                              const { hasSearch: hasLegacySearch, query: legacyQuery, status: legacyStatus, error: legacyError, results: legacyResults, cleanContent: searchCleanContent } = parseSearchStatus(msg.content);
                              const { hasCrawl, url: crawlUrl, title: crawlTitle, status: crawlStatus, error: crawlError, content: crawlContent, cleanContent: crawlCleanContent } = parseCrawlStatus(searchCleanContent);
                              const { thinking, content: thinkingCleanContent } = parseThinkingAndContent(crawlCleanContent);
                              const { hasQuestion, question, options, allowCustom, allowSkip, cleanContent } = parseQuestion(thinkingCleanContent);
                              const isStreamingActive = index === displayMessages.length - 1 && isGenerating;
                              const isStreamingThinking = isStreamingActive && !msg.content.includes('</thinking>') && msg.content.includes('<thinking>');
                              
                              const finalHasSearch = hasMetaSearch || hasLegacySearch;
                              const finalSearchQuery = hasMetaSearch ? searchMeta!.query : legacyQuery;
                              const finalSearchStatus = hasMetaSearch ? 'done' : legacyStatus;
                              const finalSearchError = hasMetaSearch ? (searchMeta!.error || null) : legacyError;
                              const finalSearchResults = hasMetaSearch
                                ? searchMeta!.results.map(r => ({ title: r.title, url: r.url, content: r.snippet, snippet: r.snippet }))
                                : legacyResults;
                              const isAwaitingFirstToken = isStreamingActive && !thinking && !finalHasSearch && !hasCrawl && !msg.browserSession;
                              
                              return (
                                <>
                                  {finalHasSearch && (
                                    <SearchStatusBadge
                                      query={finalSearchQuery}
                                      status={finalSearchStatus}
                                      error={finalSearchError}
                                      results={finalSearchResults}
                                    />
                                  )}

                                  {hasCrawl && (
                                    <CrawlStatusBadge
                                      url={crawlUrl}
                                      status={crawlStatus}
                                      title={crawlTitle}
                                      error={crawlError}
                                      content={crawlContent}
                                    />
                                  )}

                                  {msg.browserSession && (
                                    <BrowserLiveView
                                      url={msg.browserSession.url}
                                      title={msg.browserSession.title}
                                      status={msg.browserSession.status}
                                      steps={msg.browserSession.steps}
                                      screenshotUrl="/api/browser/screenshot"
                                      screenshotTimestamp={msg.browserSession.screenshotTimestamp}
                                      sessionId={chat?.id}
                                      onInteract={onOpenBrowserModal}
                                    />
                                  )}
                                  
                                  {thinking && (
                                    <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3 text-xs w-full">
                                      <details className="group" open={index === displayMessages.length - 1}>
                                        <summary className="flex items-center justify-between font-semibold text-muted-foreground hover:text-foreground cursor-pointer select-none">
                                          <span className="flex items-center gap-1.5 font-sans text-[11px] tracking-wide uppercase">
                                            {isStreamingThinking ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <Terminal className="h-3 w-3" />
                                            )}
                                            <span>{isStreamingThinking ? 'Thinking Process...' : 'Thought Process'}</span>
                                          </span>
                                          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                                        </summary>
                                        <div className="mt-2.5 pl-3.5 border-l border-primary text-muted-foreground leading-relaxed whitespace-pre-wrap select-text font-mono text-[10.5px] max-h-52 overflow-y-auto">
                                          {thinking}
                                        </div>
                                      </details>
                                    </div>
                                  )}

                                  {cleanContent ? (
                                    <div className={`select-text ${isStreamingActive ? 'typing-cursor' : ''}`}>
                                      <MarkdownRenderer 
                                        content={cleanContent} 
                                        onSendMessage={onSendMessage} 
                                        isGenerating={isGenerating} 
                                        sessionId={chat?.id}
                                      />
                                    </div>
                                  ) : (
                                    isAwaitingFirstToken && (
                                      <div className="py-1 select-none">
                                        <TextLoader 
                                          text="Thinking..." 
                                          variant="cascade" 
                                          color="currentColor"
                                          className="text-muted-foreground text-sm italic" 
                                        />
                                      </div>
                                    )
                                  )}

                                  {hasQuestion && (
                                    <QuestionCard
                                      question={question}
                                      options={options}
                                      allowCustom={allowCustom}
                                      allowSkip={allowSkip}
                                      isAnswered={index < displayMessages.length - 1}
                                      selectedAnswer={index < displayMessages.length - 1 ? displayMessages[index + 1].content : null}
                                      onAnswer={onSendMessage}
                                      isGenerating={isGenerating}
                                    />
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Assistant actions */}
                      {!isEditing && (
                        <div className="mt-1 flex items-center gap-3 select-none opacity-100 transition-opacity duration-200 px-1 text-muted-foreground">
                          {hasSiblings && (
                            <div className="flex items-center gap-1 text-[9px] font-bold select-none mr-2">
                              <button
                                onClick={() => currentSiblingIndex > 0 && onSwitchBranch?.(siblings[currentSiblingIndex - 1])}
                                disabled={currentSiblingIndex === 0}
                                className={`rounded p-0.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                                  currentSiblingIndex === 0 ? 'opacity-20 cursor-not-allowed' : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                                }`}
                                aria-label="Previous version"
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </button>
                              <span className="px-0.5 tracking-wider font-mono text-muted-foreground/80">
                                {currentSiblingIndex + 1} / {siblings.length}
                              </span>
                              <button
                                onClick={() => currentSiblingIndex < siblings.length - 1 && onSwitchBranch?.(siblings[currentSiblingIndex + 1])}
                                disabled={currentSiblingIndex === siblings.length - 1}
                                className={`rounded p-0.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                                  currentSiblingIndex === siblings.length - 1 ? 'opacity-20 cursor-not-allowed' : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                                }`}
                                aria-label="Next version"
                              >
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleToggleSpeech(msg.id, msg.content)}
                              className={`rounded p-1 transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                                speakingMessageId === msg.id
                                  ? 'bg-primary/20 text-primary animate-pulse'
                                  : 'hover:bg-accent hover:text-foreground'
                              }`}
                              title={speakingMessageId === msg.id ? "Stop reading aloud" : "Read aloud (Text-to-Speech)"}
                              aria-label={speakingMessageId === msg.id ? "Stop reading aloud" : "Read aloud"}
                              aria-pressed={speakingMessageId === msg.id}
                            >
                              {speakingMessageId === msg.id ? (
                                <VolumeX className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <Volume2 className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              className="rounded p-1 hover:bg-accent hover:text-foreground transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              title="Copy response"
                              aria-label="Copy response"
                            >
                              {copiedId === msg.id ? (
                                <Check className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => startEditingMessage(msg)}
                              className="rounded p-1 hover:bg-accent hover:text-foreground transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              title="Edit response"
                              aria-label="Edit response"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            {index === displayMessages.length - 1 && (
                              <RegenerateButton
                                onClick={() => onRegenerateResponse(msg.id)}
                                disabled={isGenerating}
                                isLoading={isGenerating}
                                title="Regenerate response"
                              />
                            )}

                            <button
                              onClick={() => onDeleteMessage(msg.id)}
                              className="rounded p-1 hover:bg-accent hover:text-destructive transition cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              title="Delete response"
                              aria-label="Delete response"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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
      <footer className="relative flex flex-col items-center shrink-0 w-full bg-background">
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute -top-10 left-1/2 -translate-x-1/2 z-30 flex h-8 px-3 items-center justify-center gap-1.5 rounded-full border border-border bg-popover text-popover-foreground hover:bg-accent hover:text-accent-foreground shadow-md transition-all text-[10px] font-semibold uppercase tracking-wider select-none cursor-pointer animate-fade-in focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="h-3.5 w-3.5 text-primary animate-bounce" />
            <span>New Messages Below</span>
          </button>
        )}
        {children}
      </footer>

    </div>
  );
};
