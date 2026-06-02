import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Code, Eye, Play, Terminal as TerminalIcon, Trash2, X } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
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
              <CodeBlock language={match ? match[1] : 'text'} code={codeString} />
            );
          },
          // Ensure tables are wrapped in a responsive container
          table({ children }) {
            return (
              <div className="overflow-x-auto w-full rounded-lg border border-slate-800/80 my-4">
                <table>{children}</table>
              </div>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

interface CodeBlockProps {
  language: string;
  code: string;
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
    comment: 'text-slate-500 italic',
    string: 'text-emerald-400 font-medium',
    keyword: 'text-brand-500 font-bold',
    type: 'text-sky-400 font-semibold',
    function: 'text-blue-400',
    number: 'text-amber-400',
    text: 'text-slate-200'
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

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [logs, setLogs] = useState<{ type: 'log' | 'warn' | 'error' | 'return'; text: string }[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [execTime, setExecTime] = useState<number | null>(null);
  const [runTrigger, setRunTrigger] = useState(0);

  const supportsRun = language === 'javascript' || language === 'typescript';

  const handleRun = () => {
    setLogs([]);
    setExecTime(null);
    setIsRunning(true);
    setConsoleOpen(true);
    setRunTrigger(prev => prev + 1);
  };

  useEffect(() => {
    if (!isRunning) return;
    
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
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    
    const timer = setTimeout(() => {
      setLogs(prev => [...prev, { type: 'error', text: 'Execution Timeout: Script took longer than 4000ms.' }]);
      setIsRunning(false);
      setExecTime(null);
    }, 4000);
    
    return () => clearTimeout(timer);
  }, [isRunning]);

  const executeInIframe = (iframe: HTMLIFrameElement) => {
    const rawJs = language === 'typescript' ? stripTypeScript(code) : code;
    
    const iframeHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body>
        <script>
          (function() {
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
              const start = performance.now();
              const result = eval(${JSON.stringify(rawJs)});
              const end = performance.now();
              
              if (result !== undefined) {
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
  };

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
    <div className="developer-dark-code group relative my-4 overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/90 shadow-lg">
      {/* Code Header Bar */}
      <div className="flex h-10 items-center justify-between border-b border-slate-800/80 bg-slate-900/60 px-4 py-1.5 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="font-mono font-medium tracking-wider text-slate-300">
            {displayName}
          </span>
          {supportsPreview && (
            <div className="flex rounded-lg bg-slate-950/60 p-0.5 border border-slate-800/50">
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition cursor-pointer ${
                  activeTab === 'code'
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-500 hover:text-slate-300'
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
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-500 hover:text-slate-300'
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
            <button
              onClick={handleRun}
              disabled={isRunning}
              className={`flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/40 px-2.5 py-1 transition cursor-pointer hover:bg-slate-800 hover:text-white ${
                isRunning ? 'text-brand-500' : 'text-slate-400'
              }`}
              title="Run code block"
              aria-label="Run code block"
            >
              {isRunning ? (
                <>
                  <span className="h-3 w-3 rounded-full border-2 border-brand-500 border-t-transparent animate-spin shrink-0" />
                  <span>Running...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current text-brand-500 shrink-0" />
                  <span>Run</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={handleCopy}
            aria-label="Copy code to clipboard"
            className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 transition hover:bg-slate-800 hover:text-white"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-500">Copied!</span>
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
        <div className="w-full bg-slate-950/20 p-3 h-96 select-text overflow-hidden flex flex-col">
          <iframe
            srcDoc={code}
            title="Live Code Preview"
            sandbox="allow-scripts"
            className="w-full h-full border border-slate-800/80 rounded-lg bg-white shadow-inner"
          />
        </div>
      ) : (
        /* Code Content */
        <div className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-slate-100 select-text">
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
          key={runTrigger}
          style={{ display: 'none' }}
          sandbox="allow-scripts"
          ref={(el) => {
            if (el) {
              executeInIframe(el);
            }
          }}
        />
      )}

      {/* Terminal Console Panel */}
      {consoleOpen && (
        <div className="border-t border-[#1c1c28] bg-[#0a0a0f] font-mono text-xs text-[#cbd5e1] shadow-inner transition-all duration-300 animate-fade-in flex flex-col max-h-60">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#141420] bg-[#10101b] px-4 select-none text-[10px] uppercase font-bold tracking-wider text-slate-500">
            <span className="flex items-center gap-1.5 text-[#94a3b8]">
              <TerminalIcon className="h-3.5 w-3.5 text-brand-500 animate-pulse" />
              <span>Console Output</span>
              {execTime !== null && (
                <span className="text-[9px] lowercase font-normal text-[#475569]">
                  (in {execTime < 0.1 ? '< 0.1ms' : `${execTime.toFixed(1)}ms`})
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLogs([])}
                className="flex items-center gap-1 rounded hover:bg-[#27273a] hover:text-white px-1.5 py-0.5 transition cursor-pointer"
                title="Clear console"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
              <button
                type="button"
                onClick={() => setConsoleOpen(false)}
                className="flex items-center gap-1 rounded hover:bg-[#27273a] hover:text-white p-0.5 transition cursor-pointer"
                title="Close console"
                aria-label="Close console button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 select-text scrollbar-thin max-h-48">
            {logs.length === 0 ? (
              <div className="text-[#475569] italic py-2">No output. Click "Run" to execute.</div>
            ) : (
              logs.map((log, index) => {
                const logColors = {
                  log: 'text-[#d1d5db]',
                  warn: 'text-amber-400',
                  error: 'text-red-400 font-semibold',
                  return: 'text-emerald-400 font-bold border-l-2 border-emerald-500/50 pl-2 bg-[#064e3b]/20 py-1 my-0.5 rounded-r'
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
