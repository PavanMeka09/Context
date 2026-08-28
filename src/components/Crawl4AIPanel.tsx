import React, { useState, useEffect, useCallback } from 'react';
import { 
  Globe, 
  Sparkles, 
  RefreshCw, 
  AlertCircle, 
  Copy, 
  Check, 
  FileText, 
  Code, 
  Link as LinkIcon, 
  Image as ImageIcon, 
  Zap, 
  Send,
  Database,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface CrawlStats {
  raw_bytes?: number;
  markdown_bytes?: number;
  tokens_saved_pct?: number;
  status_code?: number;
}

interface CrawlResult {
  success: boolean;
  engine: string;
  url: string;
  title?: string;
  markdown?: string;
  links?: { internal?: string[]; external?: string[] };
  media?: { images?: Array<{ src: string; alt?: string }>; videos?: unknown[] };
  metadata?: Record<string, unknown>;
  structured_data?: unknown;
  stats?: CrawlStats;
  notice?: string;
  error?: string;
}

interface CrawlStatus {
  crawl4ai_installed: boolean;
  playwright_installed: boolean;
  mode: string;
  python_command?: string;
}

interface Crawl4AIPanelProps {
  onSendToChat?: (text: string) => void;
  onSaveArtifact?: (title: string, content: string) => void;
}

export const Crawl4AIPanel: React.FC<Crawl4AIPanelProps> = ({ onSendToChat, onSaveArtifact }) => {
  const [url, setUrl] = useState('');
  const [extractCss, setExtractCss] = useState('');
  const [bypassCache, setBypassCache] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<CrawlStatus | null>(null);
  const [result, setResult] = useState<CrawlResult | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'raw' | 'structured' | 'assets'>('preview');
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/crawl/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      setStatus({ crawl4ai_installed: false, playwright_installed: false, mode: 'offline' });
    }
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/crawl/status');
        if (res.ok && isSubscribed) {
          const data = await res.json();
          if (isSubscribed) setStatus(data);
        }
      } catch {
        if (isSubscribed) {
          setStatus({ crawl4ai_installed: false, playwright_installed: false, mode: 'offline' });
        }
      }
    };
    checkStatus();
    return () => {
      isSubscribed = false;
    };
  }, []);

  const handleCrawl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          extractCss: extractCss.trim() || undefined,
          bypassCache
        })
      });

      const data = await res.json();
      setResult(data);
      if (data.markdown) {
        setActiveTab('preview');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Network request failed';
      setResult({
        success: false,
        engine: 'error',
        url,
        error: errMsg
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.markdown) return;
    navigator.clipboard.writeText(result.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 rounded-xl border border-slate-800 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg text-slate-100">Crawl4AI Web Crawler</h2>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                LLM-Optimized
              </span>
            </div>
            <p className="text-xs text-slate-400">Deep web crawling, token reduction, and structured markdown extraction</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <span className={`w-2 h-2 rounded-full ${status.crawl4ai_installed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-slate-300 font-medium capitalize">{status.mode} Engine</span>
            </div>
          )}
          <button
            onClick={fetchStatus}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Crawl Input Form */}
      <div className="p-6 border-b border-slate-800 bg-slate-900/40">
        <form onSubmit={handleCrawl} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Globe className="w-4 h-4" />
              </div>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter URL to crawl (e.g., https://docs.python.org/3/)..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-all"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowOptions(!showOptions)}
              className={`px-3.5 py-2.5 border rounded-xl flex items-center gap-2 text-sm font-medium transition-colors ${
                showOptions || extractCss
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Options</span>
              {showOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-medium rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-950/50 transition-all"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Crawling...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Crawl Page</span>
                </>
              )}
            </button>
          </div>

          {/* Advanced Options Bar */}
          {showOptions && (
            <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between text-xs text-slate-300">
              <div className="flex-1 w-full flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="font-medium whitespace-nowrap">CSS Selector / Extraction Schema:</span>
                <input
                  type="text"
                  value={extractCss}
                  onChange={(e) => setExtractCss(e.target.value)}
                  placeholder="Optional selector e.g. .article-content or #main"
                  className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 text-xs focus:outline-none focus:border-emerald-500/40"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bypassCache}
                  onChange={(e) => setBypassCache(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-800 text-emerald-500 focus:ring-emerald-500/40 bg-slate-900"
                />
                <span>Bypass Cache</span>
              </label>
            </div>
          )}
        </form>
      </div>

      {/* Result Metrics Dashboard */}
      {result && (
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="font-semibold text-slate-100">{result.title || result.url}</span>
            </div>
            {result.stats?.tokens_saved_pct !== undefined && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{result.stats.tokens_saved_pct}% Tokens Saved</span>
              </div>
            )}
            <div className="text-slate-400">
              Raw: <span className="text-slate-200">{Math.round((result.stats?.raw_bytes || 0) / 1024)} KB</span> → Markdown: <span className="text-slate-200">{Math.round((result.stats?.markdown_bytes || 0) / 1024)} KB</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSendToChat && result.markdown && (
              <button
                onClick={() => onSendToChat(`[CRAWL4AI CONTEXT]\nSource URL: ${result.url}\nTitle: ${result.title || ''}\n\n${result.markdown}`)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors font-medium"
              >
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <span>Send to Chat</span>
              </button>
            )}
            {onSaveArtifact && result.markdown && (
              <button
                onClick={() => onSaveArtifact(result.title || 'Crawled Web Page', result.markdown || '')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors font-medium"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Save Artifact</span>
              </button>
            )}
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors font-medium"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      {result && (
        <div className="flex items-center gap-1 px-6 pt-3 bg-slate-900 border-b border-slate-800 text-xs font-medium text-slate-400">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'preview'
                ? 'border-emerald-500 text-emerald-400 bg-slate-950/60 font-semibold'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Markdown Preview</span>
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`px-4 py-2 rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'raw'
                ? 'border-emerald-500 text-emerald-400 bg-slate-950/60 font-semibold'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>Raw Markdown</span>
          </button>
          {Boolean(result.structured_data) && (
            <button
              onClick={() => setActiveTab('structured')}
              className={`px-4 py-2 rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'structured'
                  ? 'border-emerald-500 text-emerald-400 bg-slate-950/60 font-semibold'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Structured Data</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-4 py-2 rounded-t-lg border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'assets'
                ? 'border-emerald-500 text-emerald-400 bg-slate-950/60 font-semibold'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>Links & Media</span>
          </button>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6 bg-slate-950">
        {!result && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 py-16">
            <Globe className="w-12 h-12 stroke-[1.25] text-slate-600" />
            <p className="text-sm font-medium text-slate-400">Enter a URL above to start Crawl4AI web extraction</p>
            <p className="text-xs max-w-md text-center text-slate-500">
              Crawl4AI removes boilerplate navigation, headers, and ads to produce clean markdown for LLM consumption.
            </p>
          </div>
        )}

        {loading && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4 py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
            <p className="text-sm font-medium">Extracting and converting page to LLM Markdown...</p>
          </div>
        )}

        {result && !result.success && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Crawl Failed</p>
              <p className="text-xs mt-1 opacity-90">{result.error || 'Failed to retrieve webpage content.'}</p>
            </div>
          </div>
        )}

        {result && result.success && (
          <>
            {result.notice && (
              <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{result.notice}</span>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="prose prose-invert max-w-none">
                <MarkdownRenderer content={result.markdown || 'No markdown generated'} />
              </div>
            )}

            {activeTab === 'raw' && (
              <pre className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 whitespace-pre-wrap overflow-x-auto leading-relaxed">
                {result.markdown}
              </pre>
            )}

            {activeTab === 'structured' && (
              <pre className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(result.structured_data, null, 2)}
              </pre>
            )}

            {activeTab === 'assets' && (
              <div className="flex flex-col gap-6 text-xs">
                <div>
                  <h4 className="font-semibold text-slate-200 mb-2 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-emerald-400" />
                    <span>Discovered Links ({((result.links?.internal?.length || 0) + (result.links?.external?.length || 0))})</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(result.links?.internal || []).map((link, idx) => (
                      <a
                        key={idx}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 bg-slate-900 rounded-lg border border-slate-800 hover:border-emerald-500/40 text-slate-300 truncate transition-colors"
                      >
                        {link}
                      </a>
                    ))}
                  </div>
                </div>

                {result.media?.images && result.media.images.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-2 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-indigo-400" />
                      <span>Extracted Images ({result.media.images.length})</span>
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {result.media.images.map((img, idx) => (
                        <div key={idx} className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col gap-2">
                          <img src={img.src} alt={img.alt || 'Extracted asset'} className="w-full h-24 object-cover rounded-md bg-slate-950" />
                          <span className="text-[10px] text-slate-400 truncate">{img.alt || img.src}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
