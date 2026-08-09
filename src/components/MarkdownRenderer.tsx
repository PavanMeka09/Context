import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Code, Eye, Play, Terminal as TerminalIcon, Trash2, X, Sparkles, RotateCw, ExternalLink } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onSendMessage?: (text: string) => void;
  isGenerating?: boolean;
  sessionId?: string;
}

const BrowserScreenshotCard: React.FC<{
  src: string;
  alt?: string;
  onOpenLightbox: (src: string) => void;
  sessionId?: string;
}> = ({ src, alt, onOpenLightbox, sessionId }) => {
  const [refreshKey, setRefreshKey] = useState(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Helper to extract a query parameter from a URL string
  const getParamFromSrc = (urlStr: string, paramName: string) => {
    try {
      const url = new URL(urlStr, window.location.origin);
      return url.searchParams.get(paramName);
    } catch {
      return null;
    }
  };

  const parsedSessionId = getParamFromSrc(src, 'sessionId') || sessionId || 'default';
  const parsedStepId = getParamFromSrc(src, 'stepId');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetch(`/api/browser/state?sessionId=${encodeURIComponent(parsedSessionId)}`);
    } catch (e) {
      console.error(e);
    }
    setRefreshKey(Date.now());
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleOpenSandbox = () => {
    window.dispatchEvent(new CustomEvent('open-browser-sandbox-modal', {
      detail: { sessionId: parsedSessionId }
    }));
  };

  const queryParams = new URLSearchParams();
  queryParams.set('sessionId', parsedSessionId);
  if (parsedStepId) {
    queryParams.set('stepId', parsedStepId);
  }
  queryParams.set('t', refreshKey.toString());
  const currentSrc = `${src.split('?')[0]}?${queryParams.toString()}`;

  return (
    <div className="w-full max-w-xl mx-auto rounded-xl border border-border bg-card overflow-hidden shadow-lg flex flex-col font-sans my-4 select-none">
      {/* Header bar */}
      <div className="bg-muted/40 px-3.5 py-1.5 flex items-center justify-between border-b border-border text-[10px] text-muted-foreground">
        <div className="flex gap-1.5 items-center shrink-0">
          <div className="w-2 h-2 rounded-full bg-destructive/60" />
          <div className="w-2 h-2 rounded-full bg-chart-4/60" />
          <div className="w-2 h-2 rounded-full bg-primary/60" />
          <span className="font-semibold text-muted-foreground ml-2 font-mono tracking-wide text-[9.5px]">sandbox-screenshot.jpg</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 hover:text-foreground transition cursor-pointer text-[9px] uppercase font-bold tracking-wider text-muted-foreground disabled:opacity-50"
            title="Refresh screenshot"
          >
            <RotateCw className={`h-2.5 w-2.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <span className="text-border select-none">|</span>
          <button
            onClick={handleOpenSandbox}
            className="flex items-center gap-1 hover:text-foreground transition cursor-pointer text-[9px] uppercase font-bold tracking-wider text-muted-foreground"
            title="Open Sandbox Browser Panel"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            <span>Open Sandbox</span>
          </button>
        </div>
      </div>
      
      {/* Screenshot viewport */}
      <div className="relative aspect-video w-full bg-muted/40 overflow-hidden flex items-center justify-center">
        <img
          src={currentSrc}
          alt={alt || 'Browser Screenshot'}
          onClick={() => onOpenLightbox(currentSrc)}
          className="max-w-full max-h-72 object-contain cursor-zoom-in transition duration-300 hover:opacity-95 hover:scale-[1.002]"
        />
      </div>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onSendMessage, isGenerating, sessionId }) => {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Close lightbox on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxSrc(null);
      }
    };
    if (lightboxSrc) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxSrc]);

  // Preprocess content to identify <show_screenshot /> tag and map to markdown image
  const processedContent = React.useMemo(() => {
    return content.replace(
      /<show_screenshot\s*\/?>/g,
      `![Browser Sandbox Screenshot](/api/browser/screenshot)`
    );
  }, [content]);

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom rendering for code blocks
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const isInline = !match && !codeString.includes('\n');

            if (isInline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock 
                language={match ? match[1] : 'text'} 
                code={codeString} 
                onSendMessage={onSendMessage}
                isGenerating={isGenerating}
              />
            );
          },
          // Custom rendering for images and gifs
          img({ src, alt, ...props }) {
            if (!src) return null;
            if (src.includes('/api/browser/screenshot') || alt === 'Browser Sandbox Screenshot') {
              return (
                <BrowserScreenshotCard
                  src={src}
                  alt={alt}
                  onOpenLightbox={setLightboxSrc}
                  sessionId={sessionId}
                />
              );
            }
            return (
              <span className="block my-3 max-w-full text-center select-none">
                <img
                  src={src}
                  alt={alt || 'Image'}
                  onClick={() => setLightboxSrc(src)}
                  className="max-w-full max-h-96 rounded-xl border border-border shadow-lg object-contain bg-card cursor-zoom-in transition duration-300 hover:opacity-95 hover:scale-[1.005] inline-block"
                  {...props}
                />
                {alt && (
                  <span className="block text-[10px] text-muted-foreground mt-1.5 italic font-sans">
                    {alt}
                  </span>
                )}
              </span>
            );
          },
          // Ensure tables are wrapped in a responsive container
          table({ children }) {
            return (
              <div className="overflow-x-auto w-full rounded-lg border border-border my-4">
                <table>{children}</table>
              </div>
            );
          }
        }}
      >
        {processedContent}
      </ReactMarkdown>

      {/* Lightbox full-screen glassmorphic overlay */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md animate-fade-in select-none">
          {/* Backdrop Click Close */}
          <div className="fixed inset-0 cursor-zoom-out" onClick={() => setLightboxSrc(null)} />
          
          <div className="relative max-w-5xl max-h-[85vh] overflow-hidden rounded-xl border border-border bg-card shadow-2xl z-10 flex flex-col p-1 animate-scale-in">
            <img
              src={lightboxSrc}
              alt="Zoomed View"
              className="max-w-full max-h-[80vh] object-contain rounded-xl"
            />
            
            {/* Close Overlay Icon */}
            <button
              onClick={() => setLightboxSrc(null)}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-background/80 text-muted-foreground hover:text-destructive-foreground border border-border hover:bg-destructive transition-all cursor-pointer active:scale-90"
              title="Close image overlay (Esc)"
              aria-label="Close lightbox"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface CodeBlockProps {
  language: string;
  code: string;
  onSendMessage?: (text: string) => void;
  isGenerating?: boolean;
}

interface Token {
  text: string;
  type: 'comment' | 'string' | 'keyword' | 'type' | 'function' | 'number' | 'text';
}

const HighlightCode: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const lang = language.toLowerCase();
  
  if (lang === 'text' || lang === 'plain' || lang === 'markdown') {
    return <span>{code}</span>;
  }

  // Combined Tokenizer regex:
  // Group 1: Comments (//, /* */, or #)
  // Group 2: Strings ("...", '...', `...`)
  // Group 3: Keywords
  // Group 4: Standard Types & Booleans & State variables
  // Group 5: Functions (word followed by open parenthesis)
  // Group 6: Numbers
  const regex = /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|default|break|continue|import|export|from|as|class|extends|constructor|super|this|new|try|catch|finally|throw|async|await|yield|type|interface|enum|public|private|protected|readonly|static|get|set|implements|keyof|typeof|instanceof|in|of|def|elif|print|self|and|or|not|with|except|raise|lambda)\b)|(\b(?:string|number|boolean|void|any|unknown|never|array|object|React|FC|useState|useEffect|useRef|useMemo|useCallback|Message|Chat|Settings|SystemPrompt|Storage|undefined|null|true|false)\b)|(\b\w+(?=\())|(\b\d+(?:\.\d+)?\b)/g;

  const tokens: Token[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(code)) !== null) {
    const [
      ,
      comment,
      str,
      keyword,
      typeOrBool,
      func,
      num
    ] = match;

    const index = match.index;

    // Add unmatched text preceding the match
    if (index > lastIndex) {
      tokens.push({ text: code.substring(lastIndex, index), type: 'text' });
    }

    if (comment) {
      tokens.push({ text: comment, type: 'comment' });
    } else if (str) {
      tokens.push({ text: str, type: 'string' });
    } else if (keyword) {
      tokens.push({ text: keyword, type: 'keyword' });
    } else if (typeOrBool) {
      tokens.push({ text: typeOrBool, type: 'type' });
    } else if (func) {
      tokens.push({ text: func, type: 'function' });
    } else if (num) {
      tokens.push({ text: num, type: 'number' });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < code.length) {
    tokens.push({ text: code.substring(lastIndex), type: 'text' });
  }

  const tokenColors = {
    comment: 'text-muted-foreground italic',
    string: 'text-emerald-400 font-medium',
    keyword: 'text-primary font-bold',
    type: 'text-sky-400 font-semibold',
    function: 'text-blue-400',
    number: 'text-amber-400',
    text: 'text-foreground'
  };

  return (
    <>
      {tokens.map((token, index) => (
        <span key={index} className={tokenColors[token.type] || ''}>
          {token.text}
        </span>
      ))}
    </>
  );
};

function stripTypeScript(tsCode: string): string {
  let jsCode = tsCode;
  jsCode = jsCode.replace(/import\s+type\s+[^;]+;/g, '');
  jsCode = jsCode.replace(/interface\s+\w+\s*\{[\s\S]*?\}/g, '');
  jsCode = jsCode.replace(/type\s+\w+\s*=\s*[\s\S]*?;/g, '');
  jsCode = jsCode.replace(/\s+as\s+[A-Za-z0-9_|[\]<>]+/g, '');
  jsCode = jsCode.replace(/\):\s*[A-Za-z0-9_|[\]<>]+/g, ')');
  jsCode = jsCode.replace(/:\s*[A-Za-z0-9_|[\]<>]+\s*(?==)/g, '');
  jsCode = jsCode.replace(/:\s*[A-Za-z_]\w*(?:\[\])?(?=\s*[,)=]|\s*$)/g, '');
  jsCode = jsCode.replace(/<[A-Za-z0-9_,\s]+>(?=\()/g, '');
  return jsCode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code, onSendMessage, isGenerating }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [logs, setLogs] = useState<{ type: 'log' | 'warn' | 'error' | 'return'; text: string }[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [execTime, setExecTime] = useState<number | null>(null);
  const [runTrigger, setRunTrigger] = useState(0);
  const [runTarget, setRunTarget] = useState<'sandbox' | 'system'>('sandbox');
  const transpiledCodeRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const supportsRun = language === 'javascript' || language === 'typescript' || language === 'python';

  const handleRun = async () => {
    if (runTarget === 'system') {
      const confirmRun = window.confirm(
        "WARNING: You are about to run this code directly on your local system ('System' execution target).\n\n" +
        "This gives the script access to your local files and system shell. Only execute code you trust.\n\n" +
        "Do you want to proceed?"
      );
      if (!confirmRun) return;
    }

    setLogs([]);
    setExecTime(null);
    setIsRunning(true);
    setConsoleOpen(true);
    transpiledCodeRef.current = null;

    let activeCode = code;

    if (language === 'typescript') {
      try {
        const transpileRes = await fetch('/api/transpile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        if (transpileRes.ok) {
          const transpileData = await transpileRes.json();
          if (transpileData.success && transpileData.code) {
            activeCode = transpileData.code;
            transpiledCodeRef.current = transpileData.code;
          }
        }
      } catch (err) {
        console.warn('Failed to transpile TypeScript via server, falling back to regex parser.', err);
      }
    }

    if (runTarget === 'sandbox') {
      setRunTrigger(prev => prev + 1);
    } else {
      try {
        const strippedCode = language === 'typescript' ? (activeCode === code ? stripTypeScript(code) : activeCode) : code;
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language, code: strippedCode }),
        });
        if (!res.ok) {
          throw new Error(`Companion server error: ${res.statusText}`);
        }
        const data = await res.json();
        setLogs(data.logs || []);
        setExecTime(data.duration || 0);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to connect to companion server.';
        setLogs([{ type: 'error', text: errorMsg }]);
      } finally {
        setIsRunning(false);
      }
    }
  };

  const handleAutoFix = () => {
    if (!onSendMessage || isGenerating) return;
    const errors = logs.filter(l => l.type === 'error').map(l => l.text);
    const errorTrace = errors.length > 0 ? errors.join('\n') : 'Unknown execution failure';
    
    onSendMessage(
      `[Auto-Debugging Report]\nThe execution of the following ${language} script failed:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nIt returned these console logs and errors:\n\`\`\`\n${errorTrace}\n\`\`\`\n\nPlease fix the bug and return the corrected script. Return ONLY the code block containing the updated script.`
    );
  };

  const hasError = logs.some(l => l.type === 'error');

  useEffect(() => {
    if (!isRunning || runTarget !== 'sandbox') return;
    
    const handleMessage = (e: MessageEvent) => {
      if (e.data && typeof e.data === 'object') {
        if (e.data.type === 'CONSOLE_LOG') {
          setLogs(prev => [...prev, { type: e.data.logType, text: e.data.text }]);
        } else if (e.data.type === 'EXECUTION_DONE') {
          setExecTime(e.data.duration);
          setIsRunning(false);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isRunning, runTarget]);

  useEffect(() => {
    if (!isRunning || runTarget !== 'sandbox') return;
    
    const timeoutDuration = language === 'python' ? 30000 : 4000;
    
    const timer = setTimeout(() => {
      setLogs(prev => [...prev, { type: 'error', text: `Execution Timeout: Script took longer than ${timeoutDuration}ms.` }]);
      setIsRunning(false);
      setExecTime(null);
    }, timeoutDuration);
    
    return () => clearTimeout(timer);
  }, [isRunning, runTarget, language]);

  const executeInIframe = useCallback((iframe: HTMLIFrameElement) => {
    const isPython = language === 'python';
    const codeToRun = transpiledCodeRef.current || (language === 'typescript' ? stripTypeScript(code) : code);
    const rawJs = language === 'typescript' ? codeToRun : code;
    
    // Extract bare/dynamic imports for generating the ES Import Map
    const imports: Record<string, string> = {};

    if (!isPython) {
      // Matches static imports: import ... from 'package' or import 'package'
      const staticImportRegex = /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = staticImportRegex.exec(rawJs)) !== null) {
        const pkg = match[1] || match[2];
        if (pkg && !pkg.startsWith('.') && !pkg.startsWith('/') && !pkg.startsWith('http') && !pkg.endsWith('.css')) {
          imports[pkg] = `https://esm.sh/${pkg}`;
        }
      }
      // Matches dynamic imports: import('package')
      const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = dynamicImportRegex.exec(rawJs)) !== null) {
        const pkg = match[1];
        if (pkg && !pkg.startsWith('.') && !pkg.startsWith('/') && !pkg.startsWith('http')) {
          imports[pkg] = `https://esm.sh/${pkg}`;
        }
      }
    }

    const iframeHtml = isPython ? `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <script src="https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js" onerror="window.parent.postMessage({ type: 'CONSOLE_LOG', logType: 'error', text: 'Failed to load Pyodide script from CDN. Please check your internet connection.' }, '*'); window.parent.postMessage({ type: 'EXECUTION_DONE', duration: 0 }, '*')"></script>
      </head>
      <body>
        <script>
          (async function() {
            function sendLog(type, args) {
              const text = args.map(arg => {
                if (arg === null) return 'null';
                if (arg === undefined) return 'undefined';
                if (typeof arg === 'object') {
                  try {
                    return JSON.stringify(arg, null, 2);
                  } catch(e) {
                    return Object.prototype.toString.call(arg);
                  }
                }
                return arg.toString();
              }).join(' ');
              
              window.parent.postMessage({ type: 'CONSOLE_LOG', logType: type, text }, '*');
            }
            
            console.log = function(...args) { sendLog('log', args); };
            console.info = function(...args) { sendLog('log', args); };
            console.warn = function(...args) { sendLog('warn', args); };
            console.error = function(...args) { sendLog('error', args); };
            
            window.addEventListener('error', function(e) {
              window.parent.postMessage({ type: 'CONSOLE_LOG', logType: 'error', text: e.message }, '*');
            });
            
            try {
              sendLog('log', ['[System] Loading Python runtime (Pyodide Wasm)...']);
              const start = performance.now();
              const pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
                stdout: (text) => sendLog('log', [text]),
                stderr: (text) => sendLog('error', [text])
              });
              sendLog('log', ['[System] Python runtime ready. Parsing imports...']);
              await pyodide.loadPackagesFromImports(${JSON.stringify(code)});
              sendLog('log', ['[System] Executing script...']);
              
              const result = await pyodide.runPythonAsync(${JSON.stringify(code)});
              const end = performance.now();
              
              if (result !== undefined && result !== null) {
                sendLog('return', [result]);
              }
              window.parent.postMessage({ type: 'EXECUTION_DONE', duration: end - start }, '*');
            } catch(err) {
              window.parent.postMessage({ type: 'CONSOLE_LOG', logType: 'error', text: err.message }, '*');
              window.parent.postMessage({ type: 'EXECUTION_DONE', duration: 0 }, '*');
            }
          })();
        </script>
      </body>
      </html>
      ` : `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <script type="importmap">
          {
            "imports": ${JSON.stringify(imports)}
          }
        </script>
      </head>
      <body>
        <script>
          window.__start_time = performance.now();
          
          function sendLog(type, args) {
            const text = args.map(arg => {
              if (arg === null) return 'null';
              if (arg === undefined) return 'undefined';
              if (typeof arg === 'object') {
                try {
                  return JSON.stringify(arg, null, 2);
                } catch(e) {
                  return Object.prototype.toString.call(arg);
                }
              }
              return arg.toString();
            }).join(' ');
            
            window.parent.postMessage({ type: 'CONSOLE_LOG', logType: type, text }, '*');
          }
          
          console.log = function(...args) { sendLog('log', args); };
          console.info = function(...args) { sendLog('log', args); };
          console.warn = function(...args) { sendLog('warn', args); };
          console.error = function(...args) { sendLog('error', args); };
          
          window.addEventListener('error', function(e) {
            window.parent.postMessage({ type: 'CONSOLE_LOG', logType: 'error', text: e.message }, '*');
            window.parent.postMessage({ type: 'EXECUTION_DONE', duration: 0 }, '*');
          });
          
          window.addEventListener('unhandledrejection', function(e) {
            const msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled Promise Rejection';
            window.parent.postMessage({ type: 'CONSOLE_LOG', logType: 'error', text: msg }, '*');
            window.parent.postMessage({ type: 'EXECUTION_DONE', duration: 0 }, '*');
          });
        </script>
        <script type="module">
          ${rawJs}
          ;(() => {
            const duration = performance.now() - window.__start_time;
            window.parent.postMessage({ type: 'EXECUTION_DONE', duration }, '*');
          })();
        </script>
      </body>
      </html>
      `;
    
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(iframeHtml);
        doc.close();
      }
    } catch (e) {
      console.error('Failed to write sandbox iframe content', e);
    }
  }, [language, code]);

  useEffect(() => {
    if (isRunning && iframeRef.current) {
      executeInIframe(iframeRef.current);
    }
  }, [runTrigger, isRunning, executeInIframe]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code', err);
    }
  };

  const displayName = language.toUpperCase();
  const supportsPreview = language === 'html' || language === 'svg';

  return (
    <div className="developer-dark-code group relative my-4 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      {/* Code Header Bar */}
      <div className="flex h-10 items-center justify-between border-b border-border bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="font-mono font-medium tracking-wider text-foreground">
            {displayName}
          </span>
          {supportsPreview && (
            <div className="flex rounded-lg bg-muted p-0.5 border border-border">
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition cursor-pointer ${
                  activeTab === 'code'
                    ? 'bg-accent text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code className="h-3 w-3" />
                <span>Code</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-accent text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Eye className="h-3 w-3" />
                <span>Preview</span>
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Run Button (for JS/TS) */}
          {supportsRun && (
            <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-md p-0.5">
              <button
                type="button"
                onClick={handleRun}
                disabled={isRunning}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition cursor-pointer hover:bg-accent hover:text-foreground ${
                  isRunning ? 'text-primary' : 'text-muted-foreground'
                }`}
                title={`Run code block in ${runTarget}`}
                aria-label="Run code block"
              >
                {isRunning ? (
                  <>
                    <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                    <span>Running...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current text-primary shrink-0" />
                    <span>Run</span>
                  </>
                )}
              </button>
              <div className="h-4 w-[1px] bg-border" />
              <select
                value={runTarget}
                onChange={(e) => setRunTarget(e.target.value as 'sandbox' | 'system')}
                className="bg-transparent text-[10px] text-muted-foreground hover:text-foreground font-medium border-0 focus:ring-0 cursor-pointer pr-1 pl-1"
                title="Select execution target"
              >
                <option value="sandbox" className="bg-card text-foreground">Sandbox</option>
                <option value="system" className="bg-card text-foreground">System</option>
              </select>
            </div>
          )}

          <button
            onClick={handleCopy}
            aria-label="Copy code to clipboard"
            className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 transition hover:bg-accent hover:text-foreground"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-primary" />
                <span className="text-primary">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content Area */}
      {supportsPreview && activeTab === 'preview' ? (
        <div className="w-full bg-muted/30 p-3 h-96 select-text overflow-hidden flex flex-col">
          <iframe
            srcDoc={code}
            title="Live Code Preview"
            sandbox="allow-scripts"
            className="w-full h-full border border-border rounded-lg bg-background shadow-inner"
          />
        </div>
      ) : (
        /* Code Content */
        <div className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-foreground select-text">
          <pre className="!my-0 !p-0">
            <code className={`language-${language} block`}>
              <HighlightCode code={code} language={language} />
            </code>
          </pre>
        </div>
      )}

      {/* Hidden iframe execution environment */}
      {isRunning && runTrigger > 0 && (
        <iframe
          ref={iframeRef}
          key={runTrigger}
          style={{ display: 'none' }}
          sandbox="allow-scripts"
        />
      )}

      {/* Terminal Console Panel */}
      {consoleOpen && (
        <div className="border-t border-border bg-muted font-mono text-xs text-foreground shadow-inner transition-all duration-300 animate-fade-in flex flex-col max-h-60">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-muted/80 px-4 select-none text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <TerminalIcon className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span>Console Output</span>
              {execTime !== null && (
                <span className="text-[9px] lowercase font-normal text-muted-foreground">
                  (in {execTime < 0.1 ? '< 0.1ms' : `${execTime.toFixed(1)}ms`})
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {hasError && onSendMessage && (
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleAutoFix}
                  className="flex items-center gap-1 rounded bg-primary/80 hover:bg-primary border border-primary/30 text-[10.5px] font-bold text-primary-foreground px-2 py-0.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Fix this execution error using AI"
                >
                  <Sparkles className="h-3 w-3 text-primary-foreground" />
                  <span>Fix with AI</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setLogs([])}
                className="flex items-center gap-1 rounded hover:bg-accent hover:text-foreground px-1.5 py-0.5 transition cursor-pointer"
                title="Clear console"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
              <button
                type="button"
                onClick={() => setConsoleOpen(false)}
                className="flex items-center gap-1 rounded hover:bg-accent hover:text-foreground p-0.5 transition cursor-pointer"
                title="Close console"
                aria-label="Close console button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 select-text scrollbar-thin max-h-48">
            {logs.length === 0 ? (
              <div className="text-muted-foreground italic py-2">No output. Click "Run" to execute.</div>
            ) : (
              logs.map((log, index) => {
                const logColors = {
                  log: 'text-foreground',
                  warn: 'text-chart-4',
                  error: 'text-destructive font-semibold',
                  return: 'text-primary font-bold border-l-2 border-primary/50 pl-2 bg-primary/10 py-1 my-0.5 rounded-r'
                };
                return (
                  <div key={index} className={`whitespace-pre-wrap leading-relaxed ${logColors[log.type]}`}>
                    {log.type === 'return' ? (
                      <span className="text-[9px] text-[#059669] uppercase font-extrabold tracking-widest block mb-0.5 select-none">Return Value</span>
                    ) : null}
                    {log.text}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
