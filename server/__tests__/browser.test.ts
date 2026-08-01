import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sessions,
  browserAgentStates,
  pauseBrowserAgent,
  resumeBrowserAgent,
  stepBrowserAgent,
  closeBrowser,
  getBrowser,
  setBrowser
} from '../browser.cjs';

describe('server/browser.cjs', () => {
  beforeEach(() => {
    sessions.clear();
    browserAgentStates.clear();
    setBrowser(null);
    vi.restoreAllMocks();
  });

  describe('Agent State Controls', () => {
    it('returns false when pausing an uninitialized session', () => {
      expect(pauseBrowserAgent('non-existent')).toBe(false);
    });

    it('pauses and resumes active browser agent session', () => {
      const sid = 'test-session-1';
      const resolverMock = vi.fn();
      browserAgentStates.set(sid, { state: 'running', pauseResolver: null });

      expect(pauseBrowserAgent(sid)).toBe(true);
      expect(browserAgentStates.get(sid)?.state).toBe('paused');

      browserAgentStates.get(sid)!.pauseResolver = resolverMock;
      expect(resumeBrowserAgent(sid)).toBe(true);
      expect(browserAgentStates.get(sid)?.state).toBe('running');
      expect(resolverMock).toHaveBeenCalledTimes(1);
    });

    it('steps paused browser agent session', () => {
      const sid = 'test-session-2';
      const resolverMock = vi.fn();
      browserAgentStates.set(sid, { state: 'paused', pauseResolver: resolverMock });

      expect(stepBrowserAgent(sid)).toBe(true);
      expect(resolverMock).toHaveBeenCalledTimes(1);
      expect(browserAgentStates.get(sid)?.pauseResolver).toBeNull();
    });
  });

  describe('Browser instance lifecycle', () => {
    it('closes browser instance cleanly', async () => {
      const closeMock = vi.fn().mockResolvedValue(undefined);
      setBrowser({ close: closeMock } as unknown as Parameters<typeof setBrowser>[0]);

      await closeBrowser();

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(getBrowser()).toBeNull();
    });
  });
});
