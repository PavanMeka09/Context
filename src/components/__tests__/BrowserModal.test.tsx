import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserModal } from '../BrowserModal';

describe('BrowserModal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    activeChatId: 'chat-1',
    activeChatTitle: 'Test Chat',
    initialSessionId: 'interactive'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/browser/state')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            url: 'https://example.com',
            title: 'Example Domain',
            elements: [],
            screenshot: '',
            agentStatus: 'idle'
          })
        });
      }
      if (url.includes('/api/browser/sessions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            sessions: [{ id: 'interactive', url: 'https://example.com', title: 'Example Domain' }]
          })
        });
      }
      if (url.includes('/api/browser/tabs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            tabs: [{ id: 'tab-1', url: 'https://example.com', title: 'Example Domain', isActive: true }]
          })
        });
      }
      if (url.includes('/api/browser/logs')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            logs: []
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });
    });
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<BrowserModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders browser viewport header and navigation inputs', async () => {
    render(<BrowserModal {...defaultProps} />);

    expect(screen.getByText('Browser Sandbox')).toBeDefined();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/browser/state'));
    });
  });

  it('calls onClose when close button is clicked', () => {
    render(<BrowserModal {...defaultProps} />);

    const closeBtn = screen.getByLabelText('Close browser modal');
    fireEvent.click(closeBtn);

    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
