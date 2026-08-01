import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renders welcome view when chat has no messages', () => {
    const emptyChat: Chat = { ...mockChat, messages: [] };
    render(<ChatArea {...defaultProps} chat={emptyChat} />);

    expect(screen.getByText('how can I help you today?')).toBeDefined();
  });
});
