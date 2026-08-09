import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Calendar, Clock, Play, Trash2, Plus, 
  ToggleLeft, ToggleRight, CheckCircle2, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, History, ClipboardList, Info, Download, Upload
} from 'lucide-react';
import type { Chat } from '../utils/storage';

export interface TaskSchedule {
  id: string;
  title: string;
  prompt: string;
  targetChatId: string;
  scheduleType: 'cron' | 'interval' | 'once';
  cronExpression?: string;
  intervalMinutes?: number;
  dateTime?: string;
  isActive: boolean;
  agentMode: 'standard' | 'browser';
  isWebSearchEnabled?: boolean;
  webhookUrl?: string;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

export interface ExecutionRun {
  id: string;
  scheduleId: string;
  scheduleTitle: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'success' | 'failed';
  output?: string;
  log?: string[];
  browserSession?: {
    url: string;
    title: string;
    status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
    steps: {
      id: string;
      thought?: string;
      action: string;
      targetId?: string;
      text?: string;
      url?: string;
      status: 'pending' | 'success' | 'error';
      logMessage?: string;
      timestamp: string;
    }[];
    screenshotTimestamp: number;
  };
}

interface SchedulesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  onShowToast: (msg: string, type: 'success' | 'error') => void;
  onOpenBrowserModal?: (sessionId: string) => void;
}

export const SchedulesPanel: React.FC<SchedulesPanelProps> = ({
  isOpen,
  onClose,
  chats,
  onShowToast,
  onOpenBrowserModal
}) => {
  const [schedules, setSchedules] = useState<TaskSchedule[]>([]);
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [activeTab, setActiveTab] = useState<'schedules' | 'history'>('schedules');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [targetChatId, setTargetChatId] = useState('new');
  const [scheduleType, setScheduleType] = useState<'cron' | 'interval' | 'once'>('interval');
  const [cronExpression, setCronExpression] = useState('*/10 * * * *');
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [dateTime, setDateTime] = useState('');
  const [agentMode, setAgentMode] = useState<'standard' | 'browser'>('standard');
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);

  // Expanded runs logs state
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [selectedRunStepId, setSelectedRunStepId] = useState<string | null>(null);

  const handleToggleRun = (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setSelectedRunStepId(null);
    } else {
      setExpandedRunId(runId);
      setSelectedRunStepId(null);
    }
  };

  const schedulesImportRef = useRef<HTMLInputElement | null>(null);

  const handleExportSchedules = async () => {
    try {
      const res = await fetch('/api/schedules/export');
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `context-schedules-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowToast('Schedules backup exported successfully.', 'success');
    } catch (e) {
      console.error('Failed to export schedules', e);
      onShowToast('Failed to export schedules backup.', 'error');
    }
  };

  const handleImportSchedules = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/schedules/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      if (!res.ok) throw new Error('Import API failed');
      onShowToast('Schedules and runs imported successfully.', 'success');
      fetchSchedules();
      fetchRuns();
    } catch (err) {
      console.error('Import schedules failed', err);
      onShowToast('Invalid schedules backup JSON file.', 'error');
    } finally {
      if (schedulesImportRef.current) schedulesImportRef.current.value = '';
    }
  };

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules');
      if (res.ok) {
        const data = await res.json();
        setSchedules(data);
      } else {
        setFetchError('Failed to fetch schedules.');
      }
    } catch (e) {
      console.error('Failed to load schedules', e);
      setFetchError('Failed to load schedules. Is the server running?');
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules/runs');
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } catch (e) {
      console.error('Failed to load runs history', e);
    }
  }, []);

  const loadPanelData = useCallback(async () => {
    setIsFetching(true);
    setFetchError(null);
    await Promise.all([fetchSchedules(), fetchRuns()]);
    setIsFetching(false);
  }, [fetchSchedules, fetchRuns]);

  // Listen for real-time run updates via custom SSE events
  useEffect(() => {
    if (!isOpen) return;

    const handleLiveEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (!customEvent.detail) return;
      const { type, data } = customEvent.detail;

      if (type === 'run-update') {
        const updatedRun = data.run;
        setRuns(prevRuns => {
          const idx = prevRuns.findIndex(r => r.id === updatedRun.id);
          const nextRuns = [...prevRuns];
          if (idx !== -1) {
            nextRuns[idx] = updatedRun;
          } else {
            nextRuns.unshift(updatedRun);
          }
          return nextRuns;
        });

        // Also fetch schedules to update lastRun/nextRun fields
        fetchSchedules();
      }
    };

    window.addEventListener('context-live-event', handleLiveEvent);
    return () => {
      window.removeEventListener('context-live-event', handleLiveEvent);
    };
  }, [isOpen, fetchSchedules]);

  // Poll for runs log history when panel is open (heartbeat fallback)
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        loadPanelData();
      }, 0);

      const interval = setInterval(() => {
        fetchRuns();
      }, 15000); // 15 seconds heartbeat fallback

      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [isOpen, loadPanelData, fetchRuns]);

  const handleCancelRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/schedules/runs/${runId}/cancel`, {
        method: 'POST'
      });
      if (res.ok) {
        onShowToast('Cancellation signal sent to running task.', 'success');
      } else {
        const data = await res.json();
        onShowToast(data.error || 'Failed to cancel task.', 'error');
      }
    } catch (e) {
      console.error('Failed to cancel run', e);
      onShowToast('Failed to contact server to cancel task.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) {
      onShowToast('Please fill out all required fields.', 'error');
      return;
    }

    const payload: Partial<TaskSchedule> = {
      id: editingId || undefined,
      title,
      prompt,
      targetChatId,
      scheduleType,
      isActive: true,
      agentMode,
      isWebSearchEnabled,
      cronExpression: scheduleType === 'cron' ? cronExpression : undefined,
      intervalMinutes: scheduleType === 'interval' ? Number(intervalMinutes) : undefined,
      dateTime: scheduleType === 'once' ? dateTime : undefined
    };

    setIsLoading(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        onShowToast(editingId ? 'Schedule updated successfully!' : 'Schedule created successfully!', 'success');
        resetForm();
        fetchSchedules();
        fetchRuns();
      } else {
        onShowToast('Failed to save schedule.', 'error');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Connection error failed to save.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setPrompt('');
    setTargetChatId('new');
    setScheduleType('interval');
    setCronExpression('*/10 * * * *');
    setIntervalMinutes(10);
    setDateTime('');
    setAgentMode('standard');
    setIsWebSearchEnabled(false);
    setIsFormOpen(false);
  };

  const handleEdit = (sched: TaskSchedule) => {
    setEditingId(sched.id);
    setTitle(sched.title);
    setPrompt(sched.prompt);
    setTargetChatId(sched.targetChatId);
    setScheduleType(sched.scheduleType);
    setCronExpression(sched.cronExpression || '*/10 * * * *');
    setIntervalMinutes(sched.intervalMinutes || 10);
    setDateTime(sched.dateTime || '');
    setAgentMode(sched.agentMode || 'standard');
    setIsWebSearchEnabled(sched.isWebSearchEnabled || false);
    setIsFormOpen(true);
  };

  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}/toggle`, { method: 'POST' });
      if (res.ok) {
        fetchSchedules();
        onShowToast('Schedule toggled.', 'success');
      }
    } catch (e) {
      console.error(e);
      onShowToast('Failed to toggle schedule.', 'error');
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}/run`, { method: 'POST' });
      if (res.ok) {
        onShowToast('Task execution started in the background.', 'success');
        fetchRuns();
      } else {
        onShowToast('Failed to start task.', 'error');
      }
    } catch (e) {
      console.error(e);
      onShowToast('Connection error failed to start task.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSchedules();
        onShowToast('Schedule deleted.', 'success');
      }
    } catch (e) {
      console.error(e);
      onShowToast('Failed to delete schedule.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-end bg-background/60 backdrop-blur-sm animate-fade-in">
      {/* Backdrop Close click area */}
      <div className="absolute inset-0 cursor-pointer" onClick={onClose} />

      <div className="relative w-full max-w-xl h-full border-l border-border bg-popover/95 text-popover-foreground flex flex-col p-6 shadow-2xl z-10 animate-slide-in">
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold tracking-wider uppercase text-foreground">Task Scheduling</h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={schedulesImportRef}
              onChange={handleImportSchedules}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={() => schedulesImportRef.current?.click()}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition cursor-pointer"
              title="Import Schedules JSON backup"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import</span>
            </button>
            <button
              onClick={handleExportSchedules}
              className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition cursor-pointer"
              title="Export Schedules JSON backup"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition cursor-pointer"
              title="Close Panel"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border mt-4 shrink-0 p-0.5 bg-muted/30 rounded-lg">
          <button
            onClick={() => { setActiveTab('schedules'); setIsFormOpen(false); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-semibold text-xs transition cursor-pointer ${
              activeTab === 'schedules' ? 'bg-popover text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            <span>Schedules</span>
          </button>
          <button
            onClick={() => { setActiveTab('history'); fetchRuns(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-semibold text-xs transition cursor-pointer ${
              activeTab === 'history' ? 'bg-popover text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Runs Log</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto mt-4 scrollbar-none">
          {activeTab === 'schedules' ? (
            isFormOpen ? (
              /* Add/Edit Form */
              <form onSubmit={handleSubmit} className="space-y-4 pr-1">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Task Title</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Daily Market Summary"
                    className="w-full text-xs font-semibold px-3 py-2 border border-border bg-muted/20 rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Prompt</label>
                  <textarea
                    required
                    rows={4}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what the scheduled prompt should accomplish..."
                    className="w-full text-xs font-semibold px-3 py-2 border border-border bg-muted/20 rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Target Chat</label>
                    <select
                      value={targetChatId}
                      onChange={(e) => setTargetChatId(e.target.value)}
                      className="w-full text-xs font-semibold px-2 py-2 border border-border bg-popover rounded-md text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="new">Create New Chat Thread</option>
                      {chats.map(chat => (
                        <option key={chat.id} value={chat.id}>
                          {chat.title.slice(0, 30) || 'Untitled Chat'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Agent Mode</label>
                    <select
                      value={agentMode}
                      onChange={(e) => setAgentMode(e.target.value as 'standard' | 'browser')}
                      className="w-full text-xs font-semibold px-2 py-2 border border-border bg-popover rounded-md text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="standard">Standard LLM Model</option>
                      <option value="browser">Browser Agent (Headless)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Trigger Schedule Type</label>
                  <select
                    value={scheduleType}
                    onChange={(e) => setScheduleType(e.target.value as 'cron' | 'interval' | 'once')}
                    className="w-full text-xs font-semibold px-2 py-2 border border-border bg-popover rounded-md text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="interval">Fixed Interval Minutes</option>
                    <option value="cron">Cron Expression</option>
                    <option value="once">Once (Date & Time)</option>
                  </select>
                </div>

                {scheduleType === 'interval' && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Repeat Interval (Minutes)</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={intervalMinutes}
                      onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                      className="w-full text-xs font-semibold px-3 py-2 border border-border bg-muted/20 rounded-md text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                )}

                {scheduleType === 'cron' && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Cron Expression</label>
                    <input
                      type="text"
                      required
                      value={cronExpression}
                      onChange={(e) => setCronExpression(e.target.value)}
                      placeholder="e.g. */10 * * * * (every 10m) or 0 9 * * 1-5"
                      className="w-full text-xs font-semibold px-3 py-2 border border-border bg-muted/20 rounded-md text-foreground focus:outline-none focus:border-primary font-mono"
                    />
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1 leading-none">
                      <Info className="h-3 w-3 inline shrink-0" />
                      Standard format: minute, hour, day-of-month, month, day-of-week.
                    </span>
                  </div>
                )}

                {scheduleType === 'once' && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Execution Date & Time</label>
                    <input
                      type="datetime-local"
                      required
                      value={dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 border border-border bg-muted/20 rounded-md text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/10 p-3 select-none">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground">Web Search Integration</span>
                    <p className="text-[10px] text-muted-foreground font-medium">Perform a real-time web search for the prompt and inject context.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isWebSearchEnabled ? 'bg-primary' : 'bg-muted'
                    }`}
                    role="switch"
                    aria-checked={isWebSearchEnabled}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                        isWebSearchEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Form Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    <span>Save & Schedule</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-border hover:bg-accent rounded-md text-foreground text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              /* Schedules Listing */
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Jobs ({schedules.length})</span>
                  <button
                    onClick={() => setIsFormOpen(true)}
                    className="flex items-center gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md font-bold transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Schedule</span>
                  </button>
                </div>

                {isFetching && schedules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Loading schedules...</span>
                  </div>
                ) : fetchError && schedules.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-destructive/30 rounded-xl bg-destructive/5">
                    <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2 opacity-70" />
                    <span className="text-xs font-semibold text-destructive block">{fetchError}</span>
                    <button
                      type="button"
                      onClick={loadPanelData}
                      className="mt-3 text-[10px] font-bold uppercase tracking-wider text-primary hover:underline cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : schedules.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-border rounded-xl">
                    <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <span className="text-xs font-semibold text-muted-foreground block">No active task schedules found.</span>
                    <span className="text-[10px] text-muted-foreground mt-1 block">Click the button above to create a background task.</span>
                  </div>
                ) : (
                  schedules.map(sched => (
                    <div
                      key={sched.id}
                      className="p-4 border border-border bg-muted/10 hover:bg-muted/15 rounded-xl transition duration-200"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col min-w-0 pr-4">
                          <span className="text-xs font-bold text-foreground truncate">{sched.title}</span>
                          <span className="text-[10px] text-muted-foreground truncate font-semibold mt-1">Prompt: "{sched.prompt}"</span>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[8.5px] uppercase font-bold px-1.5 py-0.5 rounded border border-border text-foreground bg-muted/40">
                              {sched.agentMode || 'standard'}
                            </span>
                            {sched.isWebSearchEnabled && (
                              <span className="text-[8.5px] uppercase font-bold px-1.5 py-0.5 rounded border border-chart-2/20 text-chart-2 bg-chart-2/10">
                                Web Search
                              </span>
                            )}
                            <span className="text-[8.5px] text-muted-foreground font-semibold">
                              {sched.scheduleType === 'interval' ? `Every ${sched.intervalMinutes}m` : sched.scheduleType === 'cron' ? `Cron: ${sched.cronExpression}` : 'One-time'}
                            </span>
                          </div>
                        </div>

                        {/* Switch Toggle & Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggle(sched.id)}
                            className="text-muted-foreground hover:text-foreground transition cursor-pointer p-1"
                            title={sched.isActive ? 'Deactivate schedule' : 'Activate schedule'}
                          >
                            {sched.isActive ? (
                              <ToggleRight className="h-7 w-7 text-primary" />
                            ) : (
                              <ToggleLeft className="h-7 w-7 text-muted-foreground/60" />
                            )}
                          </button>
                          <button
                            onClick={() => handleRunNow(sched.id)}
                            className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-primary transition cursor-pointer"
                            title="Run Now"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(sched)}
                            className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition cursor-pointer"
                            title="Edit"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(sched.id)}
                            className="p-1.5 hover:bg-accent rounded hover:text-destructive transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Runtime metadata indicators */}
                      <div className="mt-3.5 pt-2 border-t border-border grid grid-cols-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
                        <div>Last run: <span className="font-mono lowercase text-foreground">{sched.lastRun ? new Date(sched.lastRun).toLocaleTimeString() : 'never'}</span></div>
                        <div className="text-right">Next run: <span className="font-mono lowercase text-foreground">{sched.isActive && sched.nextRun ? (sched.nextRun.startsWith('See') ? 'cron' : new Date(sched.nextRun).toLocaleTimeString()) : 'paused'}</span></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          ) : (
            /* History Runs Log */
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Runs Log History ({runs.length})</span>
                <button
                  onClick={fetchRuns}
                  className="text-xs text-primary hover:text-primary/80 font-bold transition cursor-pointer"
                >
                  Refresh Logs
                </button>
              </div>

              {runs.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-border rounded-xl">
                  <History className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <span className="text-xs font-semibold text-muted-foreground block">No execution runs logged yet.</span>
                </div>
              ) : (
                runs.map(run => {
                  const isExpanded = expandedRunId === run.id;
                  return (
                    <div
                      key={run.id}
                      className="border border-border bg-muted/15 rounded-xl p-3.5 hover:bg-muted/20 transition duration-150"
                    >
                      <div className="flex justify-between items-start cursor-pointer select-none" onClick={() => handleToggleRun(run.id)}>
                        <div className="flex flex-col min-w-0 pr-4">
                          <span className="text-xs font-bold text-foreground truncate">{run.scheduleTitle}</span>
                          <span className="text-[9px] text-muted-foreground font-mono mt-1 lowercase">
                            Start: {new Date(run.startTime).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {run.status === 'success' && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-primary border border-primary/20 bg-primary/10 px-2 py-0.5 rounded-full uppercase leading-none">
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                              SUCCESS
                            </span>
                          )}
                          {run.status === 'failed' && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-destructive border border-destructive/20 bg-destructive/10 px-2 py-0.5 rounded-full uppercase leading-none">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              FAILED
                            </span>
                          )}
                          {run.status === 'running' && (
                            <div className="flex items-center gap-1.5">
                              <span className="flex items-center gap-1 text-[9px] font-bold text-chart-4 border border-chart-4/20 bg-chart-4/10 px-2 py-0.5 rounded-full uppercase leading-none animate-pulse">
                                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                                RUNNING
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelRun(run.id);
                                }}
                                className="text-[9px] font-bold text-destructive hover:text-destructive border border-destructive/20 hover:border-destructive/40 bg-destructive/10 hover:bg-destructive/20 px-2 py-0.5 rounded-full uppercase transition duration-150 cursor-pointer"
                                title="Cancel executing run"
                              >
                                Cancel
                              </button>
                            </div>
                          )}

                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Expanded View for logs and details */}
                      {isExpanded && (() => {
                        const schedule = schedules.find(s => s.id === run.scheduleId);
                        const isBrowserTask = !!run.browserSession || (schedule ? schedule.agentMode === 'browser' : false);
                        
                        return (
                          <div className="mt-3.5 pt-3.5 border-t border-border space-y-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                            {isBrowserTask && onOpenBrowserModal && run.status === 'running' && (
                              <div className="flex justify-end select-none">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenBrowserModal(run.id);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground font-bold font-sans text-xs transition active:scale-95 cursor-pointer"
                                >
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  <span>Monitor Live Browser Session</span>
                                </button>
                              </div>
                            )}

                            {run.browserSession && run.browserSession.steps && run.browserSession.steps.length > 0 && (
                              <div className="space-y-2.5 font-sans mt-3">
                                <div className="font-bold text-[8.5px] font-mono uppercase text-muted-foreground leading-none select-none">
                                  Browser Automation Walkthrough ({run.browserSession.steps.length} Steps)
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                  {/* Steps List */}
                                  <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1 text-left">
                                    {run.browserSession.steps.map((step, idx: number) => {
                                      const isSelected = selectedRunStepId === step.id;
                                      return (
                                        <div key={step.id} className="space-y-1">
                                          {step.thought && (
                                            <div className="text-[10px] text-primary italic bg-primary/5 border border-primary/10 rounded-lg px-2.5 py-1.5 pl-6 relative leading-normal">
                                              <span className="absolute left-2 text-primary">💡</span>
                                              {step.thought}
                                            </div>
                                          )}
                                          <div
                                            onClick={() => setSelectedRunStepId(isSelected ? null : step.id)}
                                            className={`flex items-center justify-between text-[10.5px] border rounded-lg px-2.5 py-1.5 cursor-pointer transition-all ${
                                              isSelected
                                                ? 'bg-primary/10 border-primary/40 text-primary font-semibold'
                                                : 'bg-muted/20 border-border text-muted-foreground hover:bg-muted/40 hover:border-border'
                                            }`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                                step.status === 'success' 
                                                  ? 'bg-primary' 
                                                  : step.status === 'error'
                                                    ? 'bg-destructive'
                                                    : 'bg-chart-4 animate-pulse'
                                              }`} />
                                              <span className="font-mono text-[9.5px] truncate max-w-[200px]">
                                                [{idx + 1}] {step.logMessage || step.action.toUpperCase()}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[8.5px] font-bold text-muted-foreground uppercase">
                                                {step.status}
                                              </span>
                                              {isSelected && <span className="text-[9px] text-primary">👁️</span>}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Screenshot Viewer Panel */}
                                  <div className="border border-border bg-muted/40 rounded-xl overflow-hidden flex flex-col items-center justify-center p-2.5 min-h-[160px] relative select-none">
                                    {selectedRunStepId ? (
                                      <div className="w-full flex flex-col items-center">
                                        <img
                                          src={`/api/browser/screenshot?stepId=${selectedRunStepId}`}
                                          alt="Step State Screenshot"
                                          className="w-full h-auto max-h-48 object-contain rounded border border-border bg-card"
                                        />
                                        <div className="text-[8.5px] text-muted-foreground font-mono mt-1.5 text-center truncate w-full">
                                          Screenshot for Step: {selectedRunStepId}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-[10px] text-muted-foreground italic text-center px-4 py-8">
                                        Select a step on the left to preview the live browser viewport screenshot at that moment.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {run.output && (
                              <div className="bg-muted/40 border border-border rounded-lg p-2.5 font-mono">
                                <div className="font-bold text-[8.5px] uppercase text-muted-foreground mb-1 leading-none select-none font-sans">Output / Summary</div>
                                <pre className="whitespace-pre-wrap max-h-36 overflow-y-auto scrollbar-thin select-text text-foreground">{run.output}</pre>
                              </div>
                            )}
                          
                            {run.log && run.log.length > 0 && (
                              <div className="bg-muted/20 border border-border rounded-lg p-2.5">
                                <div className="font-bold text-[8.5px] uppercase text-muted-foreground mb-1 leading-none select-none flex items-center gap-1 font-sans">
                                  <ClipboardList className="h-3 w-3" />
                                  <span>Execution Logs</span>
                                </div>
                                <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin text-muted-foreground font-mono">
                                  {run.log.map((logMsg, lIdx) => (
                                    <div key={lIdx}>&gt; {logMsg}</div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
