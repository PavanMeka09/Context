import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, RotateCw, Globe, ArrowRight, MousePointer, Keyboard, 
  ChevronUp, ChevronDown, FileText, Loader2, Search, Compass, Power, 
  AlertTriangle, Eye, EyeOff, Terminal, Plus, Trash2, ArrowLeft
} from 'lucide-react';

interface InteractiveElement {
  id: string;
  tagName: string;
  type: string;
  text: string;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
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
  activeChatId?: string | null;
  activeChatTitle?: string;
  initialSessionId?: string;
  isBrowserAgentRunning?: boolean;
}

export const BrowserModal: React.FC<BrowserModalProps> = ({ 
  isOpen, 
  onClose,
  activeChatId,
  activeChatTitle,
  initialSessionId,
  isBrowserAgentRunning
}) => {
  const [sessionId, setSessionId] = useState<string>(initialSessionId || 'interactive');
  const [prevInitialSessionId, setPrevInitialSessionId] = useState(initialSessionId);
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
  const [showOverlays, setShowOverlays] = useState(true);

  // Advanced browser features: Multi-tab and Real-time Console logs
  const [tabs, setTabs] = useState<{ id: string; title: string; url: string; isActive: boolean }[]>([]);
  const [logs, setLogs] = useState<{ timestamp: string; type: string; text: string; url: string }[]>([]);
  const [showConsoleDrawer, setShowConsoleDrawer] = useState(false);

  // Sync initialSessionId state if the parent prop changes
  if (initialSessionId !== prevInitialSessionId) {
    setPrevInitialSessionId(initialSessionId);
    setSessionId(initialSessionId || 'interactive');
  }

  // Fetch active tabs in session
  const fetchTabs = useCallback(async () => {
    try {
      const res = await fetch(`/api/browser/tabs?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data = await res.json();
        setTabs(data.tabs || []);
      }
    } catch (err) {
      console.error('Failed to fetch tabs:', err);
    }
  }, [sessionId]);

  // Fetch console and network logs
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/browser/logs?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, [sessionId]);

  // Fetch current browser state
  const fetchBrowserState = useCallback(async (showMainLoader = false) => {
    if (showMainLoader) {
      await Promise.resolve();
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`/api/browser/state?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) {
        throw new Error('No active browser session or companion server not running.');
      }
      const data = await res.json();
      setBrowserState(data);
      setAddressInput(data.url || '');
      setScreenshotTimestamp(Date.now());

      // Async refresh tabs and logs
      fetchTabs();
      fetchLogs();

      return data;
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to connect to browser companion server.');
      setBrowserState(null);
      return null;
    } finally {
      if (showMainLoader) setLoading(false);
    }
  }, [sessionId, fetchTabs, fetchLogs]);

  // Run load on open or when sessionId changes
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        fetchBrowserState(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, fetchBrowserState]);

  // Listen for real-time browser updates via SSE custom events
  useEffect(() => {
    if (!isOpen) return;

    const handleLiveEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (!customEvent.detail) return;
      const { type, data } = customEvent.detail;

      if (data && data.sessionId === sessionId) {
        if (type === 'browser-state') {
          setBrowserState(data);
          setAddressInput(data.url || '');
          setScreenshotTimestamp(Date.now());
          // Fetch tabs in sync
          fetchTabs();
          fetchLogs();
        } else if (type === 'browser-log') {
          setLogs(prevLogs => {
            // Avoid duplicate log lines if possible
            if (prevLogs.some(l => l.timestamp === data.log.timestamp && l.text === data.log.text)) {
              return prevLogs;
            }
            const updated = [...prevLogs, data.log];
            if (updated.length > 100) updated.shift();
            return updated;
          });
        } else if (type === 'browser-log-clear') {
          setLogs([]);
        }
      }
    };

    window.addEventListener('context-live-event', handleLiveEvent);
    return () => {
      window.removeEventListener('context-live-event', handleLiveEvent);
    };
  }, [isOpen, sessionId, fetchTabs, fetchLogs]);

  // Periodic polling for background execution / dynamic changes while open (heartbeat fallback)
  useEffect(() => {
    let intervalId: number | undefined;
    if (isOpen && browserState && !actionLoading) {
      intervalId = window.setInterval(() => {
        fetchBrowserState(false);
      }, 15000); // 15 seconds heartbeat fallback
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isOpen, browserState, actionLoading, fetchBrowserState]);

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
          sessionId: sessionId
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
        body: JSON.stringify({ sessionId: sessionId })
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
        body: JSON.stringify({ action, ...params, sessionId: sessionId })
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

  // Tab control helpers
  const handleSwitchTab = async (tabId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/browser/tabs/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, tabId })
      });
      if (!res.ok) throw new Error('Failed to switch tab');
      await fetchBrowserState(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to switch tab');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    setActionLoading(true);
    try {
      const res = await fetch('/api/browser/tabs/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, tabId })
      });
      if (!res.ok) throw new Error('Failed to close tab');
      await fetchBrowserState(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to close tab');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTab = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/browser/tabs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, url: 'https://www.google.com' })
      });
      if (!res.ok) throw new Error('Failed to create tab');
      await fetchBrowserState(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create tab');
    } finally {
      setActionLoading(false);
    }
  };

  // Logs control helpers
  const handleClearLogs = async () => {
    try {
      await fetch('/api/browser/logs/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      setLogs([]);
    } catch (err) {
      console.error(err);
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
          sessionId: sessionId
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

  const handleOverlayDoubleClick = (element: InteractiveElement) => {
    runAction('click', { targetId: element.id });
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
        <div className="flex h-14 shrink-0 items-center justify-between px-6 border-b border-white/[0.08] bg-slate-900/90 select-none">
          <div className="flex items-center gap-2.5">
            <div className="p-1 bg-brand-500/10 rounded-lg text-brand-400 border border-brand-500/20">
              <Compass className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100 leading-none">Browser Sandbox</h2>
              <span className="text-[10px] text-slate-500 mt-1 block">Live headless Puppeteer session</span>
            </div>
            
            {activeChatId && (
              <div className="ml-6 flex items-center gap-2 bg-slate-950/60 border border-white/[0.06] rounded-lg px-2.5 py-1 text-xs">
                <span className="text-slate-400 font-medium">Session:</span>
                <select
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  className="bg-transparent text-slate-200 border-0 focus:ring-0 text-xs py-0 pl-1 pr-6 font-semibold cursor-pointer outline-none"
                >
                  <option value="interactive" className="bg-slate-900 text-slate-200">Interactive Sandbox</option>
                  <option value={activeChatId} className="bg-slate-900 text-slate-200">
                    Chat Agent ({activeChatTitle || 'Active Chat'})
                  </option>
                </select>
              </div>
            )}

            {sessionId === activeChatId && isBrowserAgentRunning && (
              <div className="ml-2 bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Agent is active on this session</span>
              </div>
            )}
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

        {/* Tab Bar */}
        {browserState && tabs.length > 0 && (
          <div className="flex h-10 shrink-0 items-end gap-1 px-6 bg-slate-900 border-b border-white/[0.06] overflow-x-auto scrollbar-none select-none">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => handleSwitchTab(tab.id)}
                className={`group flex items-center gap-2 px-3.5 py-1.5 text-xs rounded-t-lg font-medium max-w-[160px] transition cursor-pointer border-t border-x ${
                  tab.isActive
                    ? 'bg-slate-950/40 border-white/[0.08] text-slate-100'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
                }`}
              >
                <Globe className="h-3 w-3 shrink-0 opacity-60" />
                <span className="truncate flex-1">{tab.title || tab.url}</span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => handleCloseTab(e, tab.id)}
                    className="p-0.5 rounded-full hover:bg-white/10 text-slate-500 hover:text-slate-350 transition opacity-0 group-hover:opacity-100 focus:opacity-100 animate-fade-in"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={handleCreateTab}
              disabled={actionLoading}
              className="mb-1.5 p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition active:scale-90 cursor-pointer disabled:opacity-50"
              title="Open new tab"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Address Bar Toolbar */}
        {browserState && (
          <div className="flex h-12 shrink-0 items-center gap-3 px-6 border-b border-white/[0.04] bg-slate-950/20">
            <button
              onClick={() => runAction('back')}
              disabled={actionLoading}
              className="p-2 rounded-lg border border-white/[0.06] bg-slate-950/40 text-slate-400 hover:text-white transition active:scale-95 cursor-pointer disabled:opacity-50"
              title="Go back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>

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
              onClick={() => setShowConsoleDrawer(!showConsoleDrawer)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition active:scale-95 cursor-pointer ${
                showConsoleDrawer
                  ? 'border-brand-500/30 bg-brand-500/10 text-brand-400'
                  : 'border-white/[0.06] bg-slate-950/40 text-slate-400 hover:text-white'
              }`}
              title="Toggle browser developer console logs"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Console ({logs.length})</span>
            </button>

            <button
              onClick={() => setShowOverlays(!showOverlays)}
              disabled={actionLoading}
              className={`flex items-center justify-center p-2 rounded-lg border transition active:scale-95 cursor-pointer disabled:opacity-50 ${
                showOverlays 
                  ? 'border-brand-500/30 bg-brand-500/10 text-brand-400 hover:text-brand-350' 
                  : 'border-white/[0.06] bg-slate-950/40 text-slate-400 hover:text-white'
              }`}
              title={showOverlays ? "Hide visual element overlays" : "Show visual element overlays"}
            >
              {showOverlays ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>

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
              {/* Left Column (Viewport & Console Drawer) */}
              <div className="flex-1 flex flex-col min-h-0 relative bg-slate-950/40 border-r border-white/[0.04]">
                <div className="flex-1 p-4 flex flex-col items-center justify-center overflow-auto relative">
                  
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
                        src={browserState.screenshot || `/api/browser/screenshot?sessionId=${encodeURIComponent(sessionId)}&t=${screenshotTimestamp}`}
                        alt="Sandbox Live Viewport"
                        className="w-full h-full select-none pointer-events-none"
                      />
                      
                      {/* Click Indicator Ripple */}
                      {clickIndicator && (
                        <div 
                          className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-45"
                          style={{ 
                            left: `${clickIndicator.x}%`, 
                            top: `${clickIndicator.y}%`
                          }}
                        >
                          <div className="w-full h-full border-2 border-brand-500 rounded-full bg-brand-500/20 animate-ping" />
                          <div className="w-2.5 h-2.5 bg-brand-500 rounded-full border border-white/50 shadow-md absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                      )}

                      {/* Visual Interactive Element Overlays */}
                      {showOverlays && browserState.elements && browserState.elements.map((el) => {
                        if (!el.rect) return null;
                        const isSelected = selectedElement?.id === el.id;
                        const leftPct = (el.rect.left / 1280) * 100;
                        const topPct = (el.rect.top / 800) * 100;
                        const widthPct = (el.rect.width / 1280) * 100;
                        const heightPct = (el.rect.height / 800) * 100;

                        return (
                          <div
                            key={el.id}
                            onClick={(e) => {
                              e.stopPropagation(); // Avoid triggering general coordinate click
                              handleElementClick(el);
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              handleOverlayDoubleClick(el);
                            }}
                            className={`absolute border rounded cursor-pointer transition-all duration-150 group/overlay ${
                              isSelected
                                ? 'bg-brand-500/15 border-brand-500 ring-2 ring-brand-500/30 z-30 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                                : 'bg-cyan-500/[0.02] border-cyan-500/20 hover:bg-cyan-500/10 hover:border-cyan-400 z-10 hover:z-20'
                            }`}
                            style={{
                              left: `${leftPct}%`,
                              top: `${topPct}%`,
                              width: `${widthPct}%`,
                              height: `${heightPct}%`,
                            }}
                            title={`${el.text} (${el.tagName})`}
                          >
                            {/* Floating Badge (Vimium-style index / info) */}
                            <span className={`absolute -top-5 left-0 px-1 py-0.5 rounded text-[8px] font-mono font-bold leading-none pointer-events-none scale-0 group-hover/overlay:scale-100 transition-transform origin-bottom-left whitespace-nowrap shadow-md z-50 ${
                              isSelected ? 'bg-brand-500 text-slate-950' : 'bg-slate-900 border border-white/10 text-cyan-400'
                            }`}>
                              {el.text ? `${el.text.slice(0, 20)} [${el.id}]` : el.id}
                            </span>
                          </div>
                        );
                      })}
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

                {/* Console Logs Drawer */}
                {showConsoleDrawer && (
                  <div className="h-48 shrink-0 bg-slate-950 border-t border-white/[0.08] flex flex-col min-h-0 font-mono text-[10px] animate-slide-up">
                    {/* Drawer Header */}
                    <div className="flex h-8 items-center justify-between px-4 border-b border-white/[0.04] bg-slate-900/60 select-none">
                      <div className="flex items-center gap-2">
                        <Terminal className="h-3 w-3 text-brand-400 animate-pulse" />
                        <span className="font-semibold text-slate-350 tracking-wide uppercase text-[9px]">Developer Console Logs</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleClearLogs}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/5 text-slate-400 hover:text-white transition cursor-pointer"
                          title="Clear console log history"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Clear</span>
                        </button>
                        <button
                          onClick={() => setShowConsoleDrawer(false)}
                          className="p-0.5 rounded hover:bg-white/5 text-slate-450 hover:text-slate-300 transition cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Drawer Content */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
                      {logs.length === 0 ? (
                        <div className="text-slate-650 italic text-center py-6 text-[10.5px]">
                          Console is clean. No errors or messages logged yet.
                        </div>
                      ) : (
                        logs.map((log, idx) => {
                          let textClass = 'text-slate-300';
                          let bgClass = '';
                          if (log.type === 'error') {
                            textClass = 'text-red-400 font-semibold';
                            bgClass = 'bg-red-500/[0.03] border-l-2 border-red-500/80 px-2 py-0.5';
                          } else if (log.type === 'warning') {
                            textClass = 'text-amber-400';
                            bgClass = 'bg-amber-500/[0.02] border-l-2 border-amber-500/80 px-2 py-0.5';
                          } else if (log.type === 'network_error') {
                            textClass = 'text-orange-450 font-semibold';
                            bgClass = 'bg-orange-500/[0.03] border-l-2 border-orange-500/80 px-2 py-0.5';
                          }
                          
                          return (
                            <div key={idx} className={`flex flex-col gap-0.5 leading-relaxed break-all ${bgClass}`}>
                              <div className="flex items-start gap-2">
                                <span className="text-slate-550 select-none shrink-0 font-light text-[9.5px]">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={textClass}>{log.text}</span>
                              </div>
                              {log.url && (
                                <span className="text-[8.5px] text-slate-500 pl-14 truncate">
                                  Source: {log.url}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                      <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                    </div>
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
