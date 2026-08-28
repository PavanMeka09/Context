import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatArea } from '../ChatArea';
import type { Chat } from '../../utils/storage';

describe('ChatArea Component', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  const mockChat: Chat = {
    id: 'chat-1',
    title: 'Test Conversation',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    messages: [
      { id: 'm1', role: 'user', content: 'Hello AI', timestamp: '10:00 AM' },
      { id: 'm2', role: 'assistant', content: 'Hello user! How can I assist you today?', timestamp: '10:01 AM' }
    ]
  };

  const defaultProps = {
    chat: mockChat,
    onSendMessage: vi.fn(),
    isGenerating: false,
    onEditMessage: vi.fn(),
    onDeleteMessage: vi.fn(),
    onRegenerateResponse: vi.fn(),
    isSidebarCollapsed: false,
    onToggleSidebar: vi.fn()
  };

  it('renders chat messages when chat is provided', () => {
    render(<ChatArea {...defaultProps} />);

    expect(screen.getByText('Hello AI')).toBeDefined();
    expect(screen.getByText('Hello user! How can I assist you today?')).toBeDefined();
  });

  it('renders clean empty view when chat has no messages', () => {
    const emptyChat: Chat = { ...mockChat, messages: [] };
    render(<ChatArea {...defaultProps} chat={emptyChat} />);

    expect(screen.queryByText('how can I help you today?')).toBeNull();
  });

  it('triggers onRegenerateResponse with user message id when resend button is clicked', () => {
    const onRegenerateResponse = vi.fn();
    render(<ChatArea {...defaultProps} onRegenerateResponse={onRegenerateResponse} />);

    const resendButtons = screen.getAllByTitle('Resend message');
    expect(resendButtons.length).toBeGreaterThan(0);
    
    fireEvent.click(resendButtons[0]);
    expect(onRegenerateResponse).toHaveBeenCalledWith('m1');
  });
  it('renders workspace panel toggle buttons and model badge in header', () => {
    const onToggleWorkspace = vi.fn();
    const onSelectWorkspaceTab = vi.fn();
    
    render(
      <ChatArea
        {...defaultProps}
        settings={{
          provider: 'gemini',
          apiKey: 'key',
          model: 'gemini-3.6-flash',
          isWebSearchEnabled: true,
          thinkingLevel: 'off',
          isMemoryEnabled: true,
          isBrowserAgentEnabled: true
        }}
        isWorkspaceOpen={false}
        onToggleWorkspace={onToggleWorkspace}
        onSelectWorkspaceTab={onSelectWorkspaceTab}
      />
    );

    expect(screen.getByText('gemini-3.6-flash')).toBeDefined();
    expect(screen.getAllByText('Browser').length).toBeGreaterThan(0);
    const workspaceBtn = screen.getByTitle('Toggle Workspace Panel (Ctrl+\\)');
    fireEvent.click(workspaceBtn);
    expect(onToggleWorkspace).toHaveBeenCalledTimes(1);

    const artifactsTabBtn = screen.getByTitle('Artifact Inspector Workspace Tab');
    fireEvent.click(artifactsTabBtn);
    expect(onSelectWorkspaceTab).toHaveBeenCalledWith('artifacts');
  });

  it('does not render Queued status badge inside chat message list', () => {
    const queuedChat: Chat = {
      ...mockChat,
      messages: [
        { id: 'm1', role: 'user', content: 'Hello AI', timestamp: '10:00 AM' },
        { id: 'm2', role: 'assistant', content: 'Processing...', timestamp: '10:01 AM' },
        { id: 'm3', role: 'user', content: 'Queued user message', timestamp: '10:02 AM' }
      ]
    };
    render(
      <ChatArea
        {...defaultProps}
        chat={queuedChat}
        isGenerating={true}
        queuedMessageIds={new Set(['m3'])}
      />
    );

    expect(screen.queryByText('Queued')).toBeNull();
  });
});
