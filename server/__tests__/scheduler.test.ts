import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startScheduleCron, stopScheduleCron, activeCronJobs } from '../scheduler.cjs';

describe('server/scheduler.cjs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and stops interval scheduled tasks correctly', () => {
    const schedule = {
      id: 'test-sched-1',
      title: 'Test Interval Task',
      prompt: 'Check weather',
      targetChatId: 'new',
      scheduleType: 'interval' as const,
      intervalMinutes: 5,
      isActive: true,
      agentMode: 'standard' as const,
      createdAt: new Date().toISOString()
    };

    startScheduleCron(schedule);
    expect(activeCronJobs.has('test-sched-1')).toBe(true);

    stopScheduleCron('test-sched-1');
    expect(activeCronJobs.has('test-sched-1')).toBe(false);
  });

  it('handles disabling single-run tasks with past dates', () => {
    const schedule = {
      id: 'test-sched-once-past',
      title: 'Past Task',
      prompt: 'Summarize news',
      targetChatId: 'new',
      scheduleType: 'once' as const,
      dateTime: new Date(Date.now() - 60000).toISOString(),
      isActive: true,
      agentMode: 'standard' as const,
      createdAt: new Date().toISOString()
    };

    startScheduleCron(schedule);
    expect(activeCronJobs.has('test-sched-once-past')).toBe(false);
  });
});
