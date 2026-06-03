import React, { useState, useEffect } from 'react';
import { 
  X, RotateCw, Globe, ArrowRight, MousePointer, Keyboard, 
  ChevronUp, ChevronDown, FileText, Loader2, Search, Compass, Power, 
  AlertTriangle 
} from 'lucide-react';

interface InteractiveElement {
  id: string;
  tagName: string;
  type: string;
  text: string;
}

interface BrowserState {
  url: string;
  title: string;
  elements: InteractiveElement[];
  screenshot?: string;
}

interface BrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BrowserModal: React.FC<BrowserModalProps> = ({ isOpen, onClose }) => {
  const [browserState, setBrowserState] = useState<BrowserState | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [screenshotTimestamp, setScreenshotTimestamp] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedElement, setSelectedElement] = useState<InteractiveElement | null>(null);
  const [typeText, setTypeText] = useState('');
  const [clickIndicator, setClickIndicator] = useState<{ x: number; y: number } | null>(null);

  // Fetch current browser state
  const fetchBrowserState = async (showMainLoader = false) => {
    if (showMainLoader) {
      await Promise.resolve();
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch('/api/browser/state?sessionId=interactive');
      if (!res.ok) {
        throw new Error('No active browser session or companion server not running.');
      }
      const data = await res.json();
      setBrowserState(data);
      setAddressInput(data.url || '');
      setScreenshotTimestamp(Date.now());
      return data;
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to connect to browser companion server.');
      setBrowserState(null);
      return null;
    } finally {
      if (showMainLoader) setLoading(false);
    }
  };

  // Run initial load
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        fetchBrowserState(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle browser session launch
  const handleLaunchSession = async () => {
    setLoading(true);
    setError(null);
    try {
      // First action to navigate to a default landing page
      const res = await fetch('/api/browser/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'navigate',
          url: 'https://www.google.com',
          sessionId: 'interactive'
        })
      });
      if (!res.ok) throw new Error('Launch failed');
      await fetchBrowserState(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to launch browser session.');
    } finally {
      setLoading(false);
    }
  };

  // Close browser session completely
  const handleCloseSession = async () => {
    setActionLoading(true);
    try {
      await fetch('/api/browser/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'interactive' })
      });
      setBrowserState(null);
      setError('Browser session closed.');
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Run a manual browser action
  const runAction = async (action: string, params: Record<string, unknown> = {}) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/browser/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params, sessionId: 'interactive' })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Action execution failed');
      }
      await fetchBrowserState(false);
      setSelectedElement(null);
      setTypeText('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to complete action');
    } finally {
      setActionLoading(false);
    }
  };

  const handleScreenshotClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (actionLoading || !browserState) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const pctX = (offsetX / rect.width) * 100;
    const pctY = (offsetY / rect.height) * 100;
    setClickIndicator({ x: pctX, y: pctY });
    setTimeout(() => setClickIndicator(null), 800);

    const x = (offsetX / rect.width) * 1280;
    const y = (offsetY / rect.height) * 800;

    setActionLoading(true);
    try {
      const res = await fetch('/api/browser/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'click',
          x: Math.round(x),
          y: Math.round(y),
          sessionId: 'interactive'
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Action execution failed');
      }

      const actionData = await res.json();
      const nextState = await fetchBrowserState(false);

      if (actionData.clickedElementId && nextState && nextState.elements) {
        const matched = nextState.elements.find((el: InteractiveElement) => el.id === actionData.clickedElementId);
        if (matched) {
          setSelectedElement(matched);
          setTypeText('');
          return;
        }
      }

      setSelectedElement(null);
      setTypeText('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to execute click');
    } finally {
      setActionLoading(false);
    }
  };

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (addressInput.trim()) {
      runAction('navigate', { url: addressInput.trim() });
    }
  };

  const handleElementClick = (element: InteractiveElement) => {
    setSelectedElement(element);
  };

  const executeClickAction = () => {
    if (selectedElement) {
      runAction('click', { targetId: selectedElement.id });
    }
  };

  const executeTypeAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedElement && typeText.trim()) {
      runAction('type', { targetId: selectedElement.id, text: typeText.trim() });
    }
  };

  const executeScroll = (direction: 'up' | 'down') => {
    runAction('scroll', { text: direction });
  };

  const executeExtract = () => {
    runAction('extract');
  };

  // Filter elements by query
  const filteredElements = browserState?.elements.filter(el => 
    el.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    el.tagName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    el.id.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fade-in font-sans">
      {/* Modal Dialog Container */}
      <div className="relative w-full max-w-6xl h-[85vh] rounded-2xl border border-white/[0.08] bg-slate-900/90 shadow-2xl z-10 flex flex-col overflow-hidden animate-scale-in">
        
        {/* Modal Header */}
        <div className="flex h-14 shrink-0 items-center justify-between px-6 border-b border-white/[0.08] bg-slate-950/40 select-none">
          <div className="flex items-center gap-2.5">
            <div className="p-1 bg-brand-500/10 rounded-lg text-brand-400 border border-brand-500/20">
              <Compass className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100 leading-none">Browser Sandbox</h2>
              <span className="text-[10px] text-slate-500 mt-1 block">Live headless Puppeteer session</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {browserState && (
              <button
                onClick={handleCloseSession}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-950/20 text-red-400 hover:bg-red-950/40 px-3 py-1.5 text-xs font-semibold transition active:scale-95 cursor-pointer disabled:opacity-50"
                title="Terminate Puppeteer browser process to free memory"
              >
                <Power className="h-3.5 w-3.5" />
                <span>End Session</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer active:scale-90"
              aria-label="Close browser modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Address Bar Toolbar */}
        {browserState && (
          <div className="flex h-12 shrink-0 items-center gap-3 px-6 border-b border-white/[0.04] bg-slate-950/20">
            <form onSubmit={handleNavigate} className="flex-1 flex items-center gap-2 bg-slate-950/60 border border-white/[0.06] rounded-lg px-3 py-1 text-xs">
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Enter URL (e.g. google.com) and press Enter"
                className="flex-1 bg-transparent border-0 p-0 text-slate-200 focus:outline-none focus:ring-0 font-mono text-[11px]"
                disabled={actionLoading}
              />
              <button 
                type="submit" 
                disabled={actionLoading}
                className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded transition"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </form>
            
            <button
              onClick={() => fetchBrowserState(false)}
              disabled={actionLoading}
              className="flex items-center justify-center p-2 rounded-lg border border-white/[0.06] bg-slate-950/40 text-slate-400 hover:text-white transition active:scale-95 cursor-pointer disabled:opacity-50"
              title="Refresh browser view"
            >
              <RotateCw className={`h-3.5 w-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        {/* Main Content Layout */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          {loading ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
              <span className="text-xs font-semibold text-slate-400 tracking-wider">Connecting to browser...</span>
            </div>
          ) : error && !browserState ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4 bg-slate-950/10">
              <div className="p-4 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
                <AlertTriangle className="h-10 w-10" />
              </div>
              <div className="max-w-md">
                <h3 className="text-slate-200 font-semibold mb-1">No Active Browser Session</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  {error.includes('running') 
                    ? "Make sure the Context companion server is started with 'npm run server'."
                    : "There is no active Puppeteer browser session currently running in the background. Start one to browse the web."
                  }
                </p>
                <button
                  onClick={handleLaunchSession}
                  className="rounded-lg bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold px-5 py-2.5 text-xs tracking-wide shadow-lg transition active:scale-95 cursor-pointer"
                >
                  Start Sandbox Session
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Viewport Box (Left Side) */}
              <div className="flex-1 bg-slate-950/40 p-4 flex flex-col items-center justify-center overflow-auto relative">
                
                {actionLoading && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/20 backdrop-blur-[1px]">
                    <div className="bg-slate-900/90 border border-white/[0.08] shadow-2xl rounded-xl px-4 py-3 flex items-center gap-3">
                      <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
                      <span className="text-xs font-semibold text-slate-200">Executing browser action...</span>
                    </div>
                  </div>
                )}

                {/* Screenshot Frame */}
                {browserState && (
                  <div 
                    onClick={handleScreenshotClick}
                    className="relative border border-white/[0.06] shadow-2xl rounded-lg overflow-hidden w-full max-w-full aspect-[16/10] select-none bg-slate-900 cursor-crosshair group/viewport"
                  >
                    <img
                      src={browserState.screenshot || `/api/browser/screenshot?sessionId=interactive&t=${screenshotTimestamp}`}
                      alt="Sandbox Live Viewport"
                      className="w-full h-full select-none pointer-events-none"
                    />
                    
                    {/* Click Indicator Ripple */}
                    {clickIndicator && (
                      <div 
                        className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ 
                          left: `${clickIndicator.x}%`, 
                          top: `${clickIndicator.y}%`
                        }}
                      >
                        <div className="w-full h-full border-2 border-brand-500 rounded-full bg-brand-500/20 animate-ping" />
                        <div className="w-2.5 h-2.5 bg-brand-500 rounded-full border border-white/50 shadow-md absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                    )}
                  </div>
                )}

                {/* Status telemetry footer */}
                {browserState && (
                  <div className="mt-4 flex items-center gap-4 text-[10.5px] text-slate-400 font-mono">
                    <span className="truncate max-w-[280px]">
                      Title: <span className="text-slate-300 font-semibold">{browserState.title || 'Blank Page'}</span>
                    </span>
                    <span className="h-3 w-[1px] bg-white/10" />
                    <span className="truncate max-w-[280px]">
                      URL: <span className="text-slate-300">{browserState.url || 'about:blank'}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Interaction Panel (Right Side) */}
              <div className="w-80 border-l border-white/[0.08] bg-slate-950/30 flex flex-col shrink-0">
                
                {/* Scroll & Extract Actions Header */}
                <div className="p-4 border-b border-white/[0.06] bg-slate-950/20 flex gap-2">
                  <button
                    onClick={() => executeScroll('up')}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border border-white/[0.06] bg-slate-950/40 text-[10.5px] font-semibold text-slate-300 hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="Scroll page up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>Scroll Up</span>
                  </button>
                  
                  <button
                    onClick={() => executeScroll('down')}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-1 p-2 rounded-lg border border-white/[0.06] bg-slate-950/40 text-[10.5px] font-semibold text-slate-300 hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="Scroll page down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span>Scroll Down</span>
                  </button>
                  
                  <button
                    onClick={executeExtract}
                    disabled={actionLoading}
                    className="p-2 rounded-lg border border-white/[0.06] bg-slate-950/40 text-slate-300 hover:text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="Extract textual data from current webpage"
                  >
                    <FileText className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Elements Search Bar */}
                <div className="p-3 border-b border-white/[0.04] bg-slate-950/10 relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search interactive elements..."
                    className="w-full bg-slate-950 border border-white/[0.06] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-300 placeholder:text-slate-500 focus:outline-none"
                  />
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                </div>

                {/* Element list box */}
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-1 pb-1">
                    Interactive Elements ({filteredElements.length})
                  </div>
                  {filteredElements.length === 0 ? (
                    <div className="text-[10.5px] italic text-slate-650 py-4 text-center">
                      {searchQuery ? 'No elements match' : 'No interactive elements found on this page'}
                    </div>
                  ) : (
                    filteredElements.map((el) => {
                      const isSelected = selectedElement?.id === el.id;
                      return (
                        <div key={el.id} className="flex flex-col">
                          <button
                            onClick={() => handleElementClick(el)}
                            className={`w-full flex flex-col text-left p-2.5 rounded-lg border transition-all text-xs cursor-pointer ${
                              isSelected
                                ? 'bg-brand-500/10 border-brand-500/40 text-brand-300 font-medium'
                                : 'bg-white/[0.005] border-white/[0.02] text-slate-300 hover:bg-white/[0.02] hover:border-white/[0.05]'
                            }`}
                          >
                            <span className="font-semibold truncate max-w-full">
                              {el.text}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1 text-[9px] font-mono text-slate-500 uppercase">
                              <span className="text-[8px] bg-slate-900 border border-white/[0.04] px-1 rounded text-slate-400">
                                {el.tagName}
                              </span>
                              <span>{el.id}</span>
                            </div>
                          </button>

                          {/* Selected Element Action Window */}
                          {isSelected && (
                            <div className="mt-1 border-b border-x border-brand-500/20 bg-brand-950/10 rounded-b-lg p-2.5 flex flex-col gap-2 animate-scale-in">
                              <div className="flex gap-2">
                                <button
                                  onClick={executeClickAction}
                                  disabled={actionLoading}
                                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-brand-500 text-slate-950 font-bold text-[10.5px] transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                  <MousePointer className="h-3 w-3" />
                                  <span>Click</span>
                                </button>
                              </div>

                              {el.tagName === 'input' || el.tagName === 'textarea' ? (
                                <form onSubmit={executeTypeAction} className="flex gap-1.5 border-t border-white/[0.03] pt-2 mt-1">
                                  <input
                                    type="text"
                                    value={typeText}
                                    onChange={(e) => setTypeText(e.target.value)}
                                    placeholder="Type value..."
                                    className="flex-1 bg-slate-950 border border-white/[0.08] rounded px-2 py-1 text-[10.5px] text-slate-300 focus:outline-none focus:border-brand-500"
                                    disabled={actionLoading}
                                  />
                                  <button
                                    type="submit"
                                    disabled={actionLoading || !typeText.trim()}
                                    className="flex items-center justify-center p-1.5 rounded bg-brand-500/10 hover:bg-brand-500 text-brand-400 hover:text-slate-950 border border-brand-500/20 transition active:scale-95 disabled:opacity-30 cursor-pointer"
                                    title="Type text value"
                                  >
                                    <Keyboard className="h-3.5 w-3.5" />
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
