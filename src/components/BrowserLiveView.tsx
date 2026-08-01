import React, { useState } from 'react';
import { RotateCw, Lock, ExternalLink, Terminal, Loader2, ChevronDown, ChevronUp, Play, Pause, SkipForward } from 'lucide-react';

export interface BrowserStep {
  id: string;
  thought?: string;
  action: string;
  targetId?: string;
  text?: string;
  url?: string;
  status: 'pending' | 'success' | 'error';
  logMessage?: string;
  timestamp: string;
}

interface BrowserLiveViewProps {
  url: string;
  title: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  steps: BrowserStep[];
  screenshotUrl: string;
  screenshotTimestamp: number;
  sessionId?: string;
  onInteract?: (sessionId: string) => void;
}

export const BrowserLiveView: React.FC<BrowserLiveViewProps> = ({
  url,
  title,
  status,
  steps,
  screenshotUrl,
  screenshotTimestamp,
  sessionId,
  onInteract
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const handlePause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sessionId) return;
    try {
      await fetch('/api/browser/agent/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch (err) {
      console.error('Failed to pause browser agent:', err);
    }
  };

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sessionId) return;
    try {
      await fetch('/api/browser/agent/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch (err) {
      console.error('Failed to resume browser agent:', err);
    }
  };

  const handleStep = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sessionId) return;
    try {
      await fetch('/api/browser/agent/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
    } catch (err) {
      console.error('Failed to step browser agent:', err);
    }
  };

  const lastStep = steps && steps.length > 0 ? steps[steps.length - 1] : null;
  const lastStepId = (status === 'completed' || status === 'failed') && lastStep ? lastStep.id : null;

  const activePreviewStepId = selectedStepId || lastStepId;

  const currentScreenshot = activePreviewStepId
    ? `${screenshotUrl}?stepId=${activePreviewStepId}`
    : (screenshotTimestamp > 0 
        ? `${screenshotUrl}?sessionId=${encodeURIComponent(sessionId || 'default')}&t=${screenshotTimestamp}` 
        : `${screenshotUrl}?sessionId=${encodeURIComponent(sessionId || 'default')}`);

  const getStatusBadge = () => {
    switch (status) {
      case 'running':
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[8px] animate-pulse">AUTOMATING</span>;
      case 'completed':
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[8px]">COMPLETED</span>;
      case 'failed':
        return <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[8px]">FAILED</span>;
      default:
        return <span className="bg-slate-800 text-slate-400 border border-white/[0.03] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[8px]">INACTIVE</span>;
    }
  };

  return (
    <div className="w-full rounded-2xl border border-white/[0.04] bg-slate-900/40 backdrop-blur-xl overflow-hidden shadow-2xl flex flex-col font-sans select-none my-4 max-w-2xl mx-auto">
      {/* Browser Window Header */}
      <div className="bg-slate-950/40 px-4 py-2 flex items-center gap-3 border-b border-white/[0.02]">
        {/* Window controls circles */}
        <div className="flex gap-1.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
        </div>
        
        {/* Address Bar Container */}
        <div className="flex-1 flex items-center gap-2 bg-slate-950/60 border border-white/[0.03] rounded-lg px-3 py-1 text-xs max-w-lg mx-auto">
          <Lock className="h-3 w-3 text-emerald-500 shrink-0" />
          <div className="truncate text-slate-400 font-mono text-[10.5px] select-text flex-1">
            {url || 'about:blank'}
          </div>
          {status === 'running' ? (
            <Loader2 className="h-3 w-3 text-brand-400 animate-spin shrink-0" />
          ) : (
            <RotateCw className="h-3 w-3 text-slate-500 hover:text-white transition shrink-0 cursor-pointer" />
          )}
        </div>

        {/* Status Badge */}
        <div className="shrink-0 flex items-center gap-1.5">
          {getStatusBadge()}
        </div>
      </div>

      {/* Title bar */}
      <div className="bg-slate-950/20 px-4 py-1.5 flex items-center justify-between border-b border-white/[0.015] text-[10.5px] text-slate-400">
        <span className="truncate font-semibold text-slate-350">{title || 'Loading Page...'}</span>
        <div className="flex items-center gap-3 select-none">
          {sessionId && (status === 'running' || status === 'paused') && (
            <div className="flex items-center gap-1 bg-slate-950/60 border border-white/[0.08] rounded-lg p-0.5 mr-1">
              {status === 'running' ? (
                <button
                  onClick={handlePause}
                  className="p-1 text-amber-400 hover:text-amber-300 hover:bg-white/5 rounded transition cursor-pointer"
                  title="Pause Agent Loop"
                >
                  <Pause className="h-3 w-3 fill-amber-400" />
                </button>
              ) : (
                <>
                  <button
                    onClick={handleResume}
                    className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-white/5 rounded transition cursor-pointer"
                    title="Resume Agent Loop"
                  >
                    <Play className="h-3 w-3 fill-emerald-400" />
                  </button>
                  <button
                    onClick={handleStep}
                    className="p-1 text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded transition cursor-pointer"
                    title="Step Agent Loop (1 Cycle)"
                  >
                    <SkipForward className="h-3 w-3 fill-blue-450" />
                  </button>
                </>
              )}
            </div>
          )}
          {url && sessionId && onInteract && (
            <button
              onClick={() => onInteract(sessionId)}
              className="flex items-center gap-1 text-brand-400 hover:text-brand-300 font-bold text-[9.5px] uppercase tracking-wider transition cursor-pointer border border-brand-500/20 bg-brand-500/5 hover:bg-brand-500/10 px-2 py-0.5 rounded"
            >
              <span>Interact & Control</span>
              <Terminal className="h-2.5 w-2.5" />
            </button>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-white transition cursor-pointer font-bold text-[9px] uppercase tracking-wider text-slate-500"
            >
              <span>Open Link</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>

      {/* Viewport Area */}
      <div className="relative aspect-video w-full bg-slate-950/60 overflow-hidden group">
        {screenshotTimestamp > 0 ? (
          <img
            src={currentScreenshot}
            alt="Browser Live Screenshot"
            className="w-full h-full object-contain select-none pointer-events-none transition duration-300"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-650">Launching Sandbox Browser...</span>
          </div>
        )}
        
        {/* Automating Glass Overlay */}
        {status === 'running' && (
          <div className="absolute inset-0 bg-slate-950/15 backdrop-blur-[1px] flex items-center justify-center pointer-events-none transition duration-200">
            <div className="bg-slate-900/90 border border-white/[0.05] shadow-2xl rounded-xl px-4 py-2.5 flex items-center gap-3 animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
              <span className="text-xs font-semibold text-slate-200">AI is controlling the browser...</span>
            </div>
          </div>
        )}

        {/* Paused Glass Overlay */}
        {status === 'paused' && (
          <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px] flex items-center justify-center pointer-events-none transition duration-200">
            <div className="bg-slate-900/90 border border-blue-500/20 shadow-2xl rounded-xl px-4 py-2.5 flex flex-col items-center gap-1 animate-scale-in">
              <div className="flex items-center gap-2">
                <Pause className="h-4 w-4 text-blue-400 fill-blue-400" />
                <span className="text-xs font-semibold text-slate-200">Agent is Paused</span>
              </div>
              <span className="text-[9px] text-slate-400">Click Resume or Step to proceed</span>
            </div>
          </div>
        )}
      </div>

      {/* Execution logs / Thoughts */}
      <div className="border-t border-white/[0.02] bg-slate-950/25 p-3.5 space-y-2.5">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between text-[9px] font-bold text-slate-550 uppercase tracking-widest border-b border-white/[0.02] pb-1 hover:text-slate-300 transition cursor-pointer select-none"
        >
          <div className="flex items-center gap-1.5">
            <Terminal className="h-3 w-3 text-brand-400" />
            <span>Execution Log & Thoughts</span>
          </div>
          <div className="flex items-center gap-1 text-[8px] font-semibold text-slate-500 tracking-wider">
            <span>{isCollapsed ? 'SHOW STEPS' : 'HIDE STEPS'}</span>
            {isCollapsed ? (
              <ChevronDown className="h-3 w-3 text-slate-550" />
            ) : (
              <ChevronUp className="h-3 w-3 text-slate-550" />
            )}
          </div>
        </button>
        
        {!isCollapsed && (
          steps.length === 0 ? (
            <div className="text-[10.5px] italic text-slate-550 py-1 text-center">
              No steps executed yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin pr-1 text-left">
              {steps.map((step, idx) => (
                <div key={step.id} className="space-y-1">
                  {step.thought && (
                    <div className="text-[10.5px] font-semibold text-brand-400 italic bg-brand-500/5 border border-brand-500/10 rounded-lg px-2.5 py-1.5 pl-6 relative">
                      <span className="absolute left-2.5 text-brand-500">💡</span>
                      {step.thought}
                    </div>
                  )}
                  <div
                    onClick={() => setSelectedStepId(selectedStepId === step.id ? null : step.id)}
                    className={`flex items-center justify-between text-[11px] border rounded-lg px-2.5 py-1 cursor-pointer transition-all ${
                      selectedStepId === step.id
                        ? 'bg-brand-500/10 border-brand-500/40 text-brand-300 shadow-sm font-semibold'
                        : 'bg-white/[0.005] border-white/[0.015] text-slate-350 hover:bg-white/[0.02] hover:border-white/[0.05]'
                    }`}
                    title="Click to preview screenshot of this step"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        step.status === 'success' 
                          ? 'bg-emerald-500' 
                          : step.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-amber-500 animate-pulse'
                      }`} />
                      <span className="font-mono text-[10px]">
                        [{idx + 1}] {step.logMessage || step.action.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] font-bold text-slate-550 uppercase">
                        {step.status}
                      </span>
                      {activePreviewStepId === step.id && (
                        <span className="text-[10px] text-brand-400" title="Viewing this step screenshot">👁️</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};
