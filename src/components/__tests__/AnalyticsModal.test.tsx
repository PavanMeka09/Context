import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsModal } from '../AnalyticsModal';

vi.mock('../../utils/storage', () => ({
  Storage: {
    getChats: vi.fn().mockResolvedValue([
      { id: 'c1', title: 'Test Chat', messages: [{ id: 'm1', content: 'Hello' }] }
    ]),
    getCustomPrompts: vi.fn().mockReturnValue([{ id: 'p1', name: 'Prompt 1' }]),
    getMemories: vi.fn().mockReturnValue([{ id: 'mem1', content: 'Memory 1' }]),
    getSchedules: vi.fn().mockReturnValue([{ id: 's1', title: 'Sched 1' }])
  }
}));

vi.mock('../../utils/vectorDb', () => ({
  vectorDb: {
    getDocuments: vi.fn().mockResolvedValue([{ id: 'd1', name: 'doc1.pdf' }])
  }
}));

describe('AnalyticsModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        timestamp: new Date().toISOString(),
        process: {
          uptime: 300,
          memoryUsageMb: { rss: 120, heapTotal: 80, heapUsed: 50, external: 10 }
        },
        system: { total: 16000000000, free: 8000000000, platform: 'win32', cpus: 8 },
        activeSessionsCount: 1,
        activeBrowserAgentsCount: 0,
        activeCronJobsCount: 2,
        storageStats: { screenshotFiles: 5, totalSchedules: 2, totalTaskRuns: 10 }
      })
    });
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<AnalyticsModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when open and displays title', async () => {
    render(<AnalyticsModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/System Diagnostics & Analytics/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText(/1 Chats \/ 1 RAG Docs/i)).toBeDefined();
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const onCloseMock = vi.fn();
    render(<AnalyticsModal isOpen={true} onClose={onCloseMock} />);
    await waitFor(() => {
      expect(screen.getByText(/System Diagnostics & Analytics/i)).toBeDefined();
    });
    const closeBtn = screen.getByTitle('Close modal');
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
