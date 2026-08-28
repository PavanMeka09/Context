import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sessions,
  browserAgentStates,
  pauseBrowserAgent,
  resumeBrowserAgent,
  stepBrowserAgent,
  closeBrowser,
  getBrowser,
  setBrowser,
  navigateToUrl,
  clearSessionStorage
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

  describe('Navigation and Session Storage Helpers', () => {
    it('normalizes URL and navigates Playwright page', async () => {
      const gotoMock = vi.fn().mockResolvedValue(undefined);
      const mockPage = { goto: gotoMock } as unknown as Parameters<typeof navigateToUrl>[0];

      const url = await navigateToUrl(mockPage, 'example.com');
      expect(url).toBe('https://example.com');
      expect(gotoMock).toHaveBeenCalledWith('https://example.com', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
    });

    it('clears session cookies and storage for valid sessions', async () => {
      const clearCookiesMock = vi.fn().mockResolvedValue(undefined);
      const evaluateMock = vi.fn().mockResolvedValue(undefined);

      sessions.set('test-session', {
        context: { clearCookies: clearCookiesMock },
        page: { isClosed: () => false, evaluate: evaluateMock },
        latestScreenshotBuffer: null,
        logs: [],
        lastAccessed: Date.now()
      } as unknown as Parameters<typeof sessions.set>[1]);

      const result = await clearSessionStorage('test-session');
      expect(result).toBe(true);
      expect(clearCookiesMock).toHaveBeenCalledTimes(1);
      expect(evaluateMock).toHaveBeenCalledTimes(1);
    });
  });
});
