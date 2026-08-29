import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserLiveView } from '../BrowserLiveView';

describe('BrowserLiveView Component', () => {
  const defaultProps = {
    url: 'https://example.com',
    title: 'Example Page',
    status: 'idle' as const,
    steps: [],
    screenshotUrl: '/api/browser/screenshot',
    screenshotTimestamp: 123456789,
    sessionId: 'test-session'
  };

  it('renders url, title, and default elements', () => {
    render(<BrowserLiveView {...defaultProps} />);

    expect(screen.getByText('https://example.com')).toBeDefined();
    expect(screen.getByText('Example Page')).toBeDefined();
  });

  it('renders Enlarge button and triggers onInteract when clicked', () => {
    const handleInteract = vi.fn();
    render(<BrowserLiveView {...defaultProps} onInteract={handleInteract} />);

    const enlargeBtn = screen.getByLabelText('Enlarge browser view');
    expect(enlargeBtn).toBeDefined();

    fireEvent.click(enlargeBtn);
    expect(handleInteract).toHaveBeenCalledWith('test-session');
  });

  it('renders Interact & Control button and triggers onInteract when clicked', () => {
    const handleInteract = vi.fn();
    render(<BrowserLiveView {...defaultProps} onInteract={handleInteract} />);

    const interactBtn = screen.getByText('Interact & Control');
    expect(interactBtn).toBeDefined();

    fireEvent.click(interactBtn);
    expect(handleInteract).toHaveBeenCalledWith('test-session');
  });

  it('triggers onInteract from window maximize dot', () => {
    const handleInteract = vi.fn();
    render(<BrowserLiveView {...defaultProps} onInteract={handleInteract} />);

    const maximizeDot = screen.getByLabelText('Maximize window dot');
    expect(maximizeDot).toBeDefined();

    fireEvent.click(maximizeDot);
    expect(handleInteract).toHaveBeenCalledWith('test-session');
  });

  it('falls back to interactive session mode when sessionId is missing and Enlarge is clicked', () => {
    const handleInteract = vi.fn();
    const propsWithoutSession = { ...defaultProps, sessionId: undefined };
    render(<BrowserLiveView {...propsWithoutSession} onInteract={handleInteract} />);

    const enlargeBtn = screen.getByLabelText('Enlarge browser view');
    fireEvent.click(enlargeBtn);
    expect(handleInteract).toHaveBeenCalledWith('interactive');
  });
});
