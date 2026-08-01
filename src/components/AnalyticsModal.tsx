import React, { useState, useEffect, useCallback } from 'react';
import { X, Activity, Server, Cpu, RefreshCw, Database, Clock, Layers } from 'lucide-react';
import { Storage } from '../utils/storage';
import { vectorDb } from '../utils/vectorDb';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ServerStats {
  success: boolean;
  timestamp: string;
  process: {
    uptime: number;
    memoryUsageMb: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
  };
  system: {
    total: number;
    free: number;
    platform: string;
    cpus: number;
  };
  activeSessionsCount: number;
  activeBrowserAgentsCount: number;
  activeCronJobsCount: number;
  storageStats: {
    screenshotFiles: number;
    totalSchedules: number;
    totalTaskRuns: number;
  };
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ isOpen, onClose }) => {
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);
  const [isLoadingServer, setIsLoadingServer] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Local storage telemetry metrics
  const [localStats, setLocalStats] = useState({
    chatCount: 0,
    totalMessages: 0,
    customPromptsCount: 0,
    memoriesCount: 0,
    schedulesCount: 0,
    ragDocsCount: 0
  });

  const fetchLocalMetrics = useCallback(async () => {
    try {
      const chats = await Storage.getChats();
      const totalMsgs = chats.reduce((acc, c) => acc + (c.messages ? c.messages.length : 0), 0);
      const prompts = Storage.getCustomPrompts();
      const memories = Storage.getMemories();
      const schedules = Storage.getSchedules();

      let docsCount = 0;
      try {
        const docs = await vectorDb.getDocuments();
        docsCount = docs.length;
      } catch (e) {
        console.warn('Could not fetch vectorDb docs count', e);
      }

      setLocalStats({
        chatCount: chats.length,
        totalMessages: totalMsgs,
        customPromptsCount: prompts.length,
        memoriesCount: memories.length,
        schedulesCount: schedules.length,
        ragDocsCount: docsCount
      });
    } catch (e) {
      console.error('Error fetching local metrics', e);
    }
  }, []);

  const fetchServerStats = useCallback(async () => {
    setIsLoadingServer(true);
    setServerError(null);
    try {
      const res = await fetch('/api/system/stats');
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const data = await res.json();
      setServerStats(data);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Companion server offline or unreachable');
    } finally {
      setIsLoadingServer(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      let mounted = true;
      Promise.resolve().then(() => {
        if (mounted) {
          fetchLocalMetrics();
          fetchServerStats();
        }
      });
      return () => {
        mounted = false;
      };
    }
  }, [isOpen, fetchLocalMetrics, fetchServerStats]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchServerStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh, fetchServerStats]);

  if (!isOpen) return null;

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="flex flex-col w-full max-w-3xl max-h-[85vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden text-card-foreground">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">System Diagnostics & Analytics</h2>
              <p className="text-xs text-muted-foreground">Real-time performance metrics, storage usage, and companion server status</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchServerStats()}
              disabled={isLoadingServer}
              className="p-2 rounded-lg border border-input bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition disabled:opacity-50 cursor-pointer"
              title="Refresh Stats"
              aria-label="Refresh Stats"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingServer ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition cursor-pointer"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Service Health Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Companion Server Status */}
            <div className="p-4 rounded-xl border border-border bg-background/50 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-indigo-400" />
                  Companion Server
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${serverStats ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">
                  {serverStats ? 'Online' : 'Offline'}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {serverStats ? `Uptime: ${formatUptime(serverStats.process.uptime)}` : (serverError || 'No connection')}
                </div>
              </div>
            </div>

            {/* Client Storage Status */}
            <div className="p-4 rounded-xl border border-border bg-background/50 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  IndexedDB RAG & Chat
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">
                  {localStats.chatCount} Chats / {localStats.ragDocsCount} RAG Docs
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {localStats.totalMessages} total message nodes stored
                </div>
              </div>
            </div>

            {/* Background Workers & Crons */}
            <div className="p-4 rounded-xl border border-border bg-background/50 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Active Background Crons
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">
                  {serverStats ? `${serverStats.activeCronJobsCount} Active Crons` : `${localStats.schedulesCount} Configured`}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {serverStats ? `${serverStats.storageStats.totalTaskRuns} task runs logged` : 'Local schedules stored'}
                </div>
              </div>
            </div>

          </div>

          {/* Process & System Metrics */}
          {serverStats && (
            <div className="p-5 rounded-xl border border-border bg-background/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  Node.js Companion Memory & Hardware
                </h3>
                <span className="text-xs text-muted-foreground font-mono">
                  {serverStats.system.platform} ({serverStats.system.cpus} CPU cores)
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg bg-card border border-border">
                  <div className="text-[11px] text-muted-foreground">RSS Memory</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{serverStats.process.memoryUsageMb.rss} MB</div>
                </div>
                <div className="p-3 rounded-lg bg-card border border-border">
                  <div className="text-[11px] text-muted-foreground">Heap Used</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{serverStats.process.memoryUsageMb.heapUsed} / {serverStats.process.memoryUsageMb.heapTotal} MB</div>
                </div>
                <div className="p-3 rounded-lg bg-card border border-border">
                  <div className="text-[11px] text-muted-foreground">System Free RAM</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{formatBytes(serverStats.system.free)}</div>
                </div>
                <div className="p-3 rounded-lg bg-card border border-border">
                  <div className="text-[11px] text-muted-foreground">Total System RAM</div>
                  <div className="text-sm font-bold text-foreground mt-0.5">{formatBytes(serverStats.system.total)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Workspace Storage Breakdown */}
          <div className="p-5 rounded-xl border border-border bg-background/30 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              Workspace Inventory Breakdown
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-card border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground">Conversations</div>
                  <div className="text-[11px] text-muted-foreground">{localStats.chatCount} sessions</div>
                </div>
                <span className="text-xs font-mono font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                  {localStats.totalMessages} msgs
                </span>
              </div>

              <div className="p-3 rounded-lg bg-card border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground">RAG Vector Storage</div>
                  <div className="text-[11px] text-muted-foreground">IndexedDB pipeline</div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10">
                  {localStats.ragDocsCount} docs
                </span>
              </div>

              <div className="p-3 rounded-lg bg-card border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground">Custom Prompts</div>
                  <div className="text-[11px] text-muted-foreground">System Persona presets</div>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10">
                  {localStats.customPromptsCount} presets
                </span>
              </div>

              <div className="p-3 rounded-lg bg-card border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground">Persistent Memories</div>
                  <div className="text-[11px] text-muted-foreground">Long-term context items</div>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10">
                  {localStats.memoriesCount} items
                </span>
              </div>

              <div className="p-3 rounded-lg bg-card border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground">Task Schedules</div>
                  <div className="text-[11px] text-muted-foreground">Cron / Interval jobs</div>
                </div>
                <span className="text-xs font-mono font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-500/10">
                  {localStats.schedulesCount} jobs
                </span>
              </div>

              <div className="p-3 rounded-lg bg-card border border-border flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground">Browser Screenshots</div>
                  <div className="text-[11px] text-muted-foreground">Automated task frames</div>
                </div>
                <span className="text-xs font-mono font-bold text-rose-400 px-2 py-0.5 rounded bg-rose-500/10">
                  {serverStats ? serverStats.storageStats.screenshotFiles : 0} frames
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary"
            />
            <span>Auto-refresh every 5s</span>
          </label>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
