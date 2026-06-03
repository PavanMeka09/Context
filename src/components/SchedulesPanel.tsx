import React, { useState, useEffect } from 'react';
import { 
  X, Calendar, Clock, Play, Trash2, Plus, 
  ToggleLeft, ToggleRight, CheckCircle2, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, History, ClipboardList, Info
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
}

interface SchedulesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  onShowToast: (msg: string, type: 'success' | 'error') => void;
}

export const SchedulesPanel: React.FC<SchedulesPanelProps> = ({
  isOpen,
  onClose,
  chats,
  onShowToast
}) => {
  const [schedules, setSchedules] = useState<TaskSchedule[]>([]);
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [activeTab, setActiveTab] = useState<'schedules' | 'history'>('schedules');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

  // Expanded runs logs state
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/schedules');
      if (res.ok) {
        const data = await res.json();
        setSchedules(data);
      }
    } catch (e) {
      console.error('Failed to load schedules', e);
    }
  };

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/schedules/runs');
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } catch (e) {
      console.error('Failed to load runs history', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        fetchSchedules();
        fetchRuns();
      }, 0);
    }
  }, [isOpen]);

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
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition cursor-pointer"
            title="Close Panel"
          >
            <X className="h-4.5 w-4.5" />
          </button>
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
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Jobs ({schedules.length})</span>
                  <button
                    onClick={() => setIsFormOpen(true)}
                    className="flex items-center gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md font-bold transition cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Schedule</span>
                  </button>
                </div>

                {schedules.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-border rounded-xl">
                    <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <span className="text-xs font-semibold text-muted-foreground block">No active task schedules found.</span>
                    <span className="text-[10px] text-muted-foreground mt-1 block">Click the button above to create a background task.</span>
                  </div>
                ) : (
                  schedules.map(sched => (
                    <div
                      key={sched.id}
                      className="p-4 border border-white/[0.04] bg-muted/10 hover:bg-muted/15 rounded-xl transition duration-200"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col min-w-0 pr-4">
                          <span className="text-xs font-bold text-foreground truncate">{sched.title}</span>
                          <span className="text-[10px] text-muted-foreground truncate font-semibold mt-1">Prompt: "{sched.prompt}"</span>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[8.5px] uppercase font-bold px-1.5 py-0.5 rounded border border-border text-foreground bg-muted/40">
                              {sched.agentMode || 'standard'}
                            </span>
                            <span className="text-[8.5px] text-muted-foreground">
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
                            onClick={() => handleEdit(sched)}
                            className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition cursor-pointer"
                            title="Edit"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(sched.id)}
                            className="p-1.5 hover:bg-accent rounded hover:text-red-500 transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Runtime metadata indicators */}
                      <div className="mt-3.5 pt-2 border-t border-white/[0.015] grid grid-cols-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
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
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Runs Log History ({runs.length})</span>
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
                      className="border border-white/[0.04] bg-muted/15 rounded-xl p-3.5 hover:bg-muted/20 transition duration-150"
                    >
                      <div className="flex justify-between items-start cursor-pointer select-none" onClick={() => setExpandedRunId(isExpanded ? null : run.id)}>
                        <div className="flex flex-col min-w-0 pr-4">
                          <span className="text-xs font-bold text-foreground truncate">{run.scheduleTitle}</span>
                          <span className="text-[9px] text-muted-foreground font-mono mt-1 lowercase">
                            Start: {new Date(run.startTime).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {run.status === 'success' && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase leading-none">
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                              SUCCESS
                            </span>
                          )}
                          {run.status === 'failed' && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-red-400 border border-red-500/20 bg-red-500/10 px-2 py-0.5 rounded-full uppercase leading-none">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              FAILED
                            </span>
                          )}
                          {run.status === 'running' && (
                            <span className="flex items-center gap-1 text-[9px] font-bold text-amber-400 border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 rounded-full uppercase leading-none animate-pulse">
                              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                              RUNNING
                            </span>
                          )}

                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Expanded View for logs and details */}
                      {isExpanded && (
                        <div className="mt-3.5 pt-3.5 border-t border-white/[0.03] space-y-3 font-mono text-[10px] leading-relaxed text-slate-300">
                          {run.output && (
                            <div className="bg-slate-950/40 border border-white/[0.03] rounded-lg p-2.5">
                              <div className="font-bold text-[8.5px] uppercase text-muted-foreground mb-1 leading-none select-none">Output / Summary</div>
                              <pre className="whitespace-pre-wrap max-h-36 overflow-y-auto scrollbar-thin select-text text-foreground">{run.output}</pre>
                            </div>
                          )}
                          
                          {run.log && run.log.length > 0 && (
                            <div className="bg-slate-950/20 border border-white/[0.015] rounded-lg p-2.5">
                              <div className="font-bold text-[8.5px] uppercase text-muted-foreground mb-1 leading-none select-none flex items-center gap-1">
                                <ClipboardList className="h-3 w-3" />
                                <span>Execution Logs</span>
                              </div>
                              <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin text-slate-400">
                                {run.log.map((logMsg, lIdx) => (
                                  <div key={lIdx}>&gt; {logMsg}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
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
