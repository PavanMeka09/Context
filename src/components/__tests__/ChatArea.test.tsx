import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
  it('renders browser and scheduler workspace buttons and settings button in header', () => {
    const onToggleWorkspaceTab = vi.fn();
    const onOpenSettings = vi.fn();
    
    render(
      <ChatArea
        {...defaultProps}
        isWorkspaceOpen={false}
        workspaceTab="browser"
        onToggleWorkspaceTab={onToggleWorkspaceTab}
        onOpenSettings={onOpenSettings}
      />
    );

    const browserBtn = screen.getByTitle('Toggle Browser Panel');
    fireEvent.click(browserBtn);
    expect(onToggleWorkspaceTab).toHaveBeenCalledWith('browser');

    const schedulerBtn = screen.getByTitle('Toggle Scheduler Panel');
    fireEvent.click(schedulerBtn);
    expect(onToggleWorkspaceTab).toHaveBeenCalledWith('schedules');

    const settingsBtn = screen.getByTitle('Open Settings');
    fireEvent.click(settingsBtn);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('does not render queued messages inside chat message list', () => {
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
    expect(screen.queryByText('Queued user message')).toBeNull();
    expect(screen.getByText('Hello AI')).toBeDefined();
    expect(screen.getByText('Processing...')).toBeDefined();
  });

  it('does not spin previous message reload icons but spins active response when isGenerating is true', () => {
    const multiMsgChat: Chat = {
      ...mockChat,
      messages: [
        { id: 'm1', role: 'user', content: 'First message', timestamp: '10:00 AM' },
        { id: 'm2', role: 'assistant', content: 'First reply', timestamp: '10:01 AM' },
        { id: 'm3', role: 'user', content: 'Second message', timestamp: '10:02 AM' },
        { id: 'm4', role: 'assistant', content: 'Generating reply...', timestamp: '10:03 AM' }
      ]
    };

    render(
      <ChatArea
        {...defaultProps}
        chat={multiMsgChat}
        isGenerating={true}
      />
    );

    const resendButtons = screen.getAllByTitle('Resend message');
    expect(resendButtons.length).toBe(2);
    resendButtons.forEach(button => {
      expect(button.hasAttribute('disabled')).toBe(true);
      const icon = button.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon?.classList.contains('animate-spin')).toBe(false);
    });

    const regenerateButton = screen.getByTitle('Regenerate response');
    expect(regenerateButton.hasAttribute('disabled')).toBe(true);
    const regenerateIcon = regenerateButton.querySelector('svg');
    expect(regenerateIcon).not.toBeNull();
    expect(regenerateIcon?.classList.contains('animate-spin')).toBe(true);
  });

  it('renders CrawlStatusBadge when message contains <crawl_status>', () => {
    const crawlChat: Chat = {
      ...mockChat,
      messages: [
        { id: 'm1', role: 'user', content: 'read https://example.com', timestamp: '10:00 AM' },
        {
          id: 'm2',
          role: 'assistant',
          content: '<crawl_status url="https://example.com" status="done" title="Example Domain">[{"title":"Example Domain","content":"Sample web content"}]</crawl_status>\n\nHere is the summary of the webpage.',
          timestamp: '10:01 AM'
        }
      ]
    };

    render(
      <ChatArea
        {...defaultProps}
        chat={crawlChat}
      />
    );

    expect(screen.getByText('Web Context Extracted')).toBeDefined();
    expect(screen.getByText('Example Domain')).toBeDefined();
    expect(screen.getByText('Here is the summary of the webpage.')).toBeDefined();
  });

  it('renders live markdown with typing cursor during streaming response', () => {
    const streamingChat: Chat = {
      ...mockChat,
      messages: [
        { id: 'm1', role: 'user', content: 'Tell me a story', timestamp: '10:00 AM' },
        { id: 'm2', role: 'assistant', content: '**Once upon a time** in a galaxy', timestamp: '10:01 AM' }
      ]
    };

    const { container } = render(
      <ChatArea
        {...defaultProps}
        chat={streamingChat}
        isGenerating={true}
      />
    );

    const typingContainer = container.querySelector('.typing-cursor');
    expect(typingContainer).not.toBeNull();
    expect(screen.getByText('Once upon a time')).toBeDefined();
  });

  it('renders Thinking... TextLoader when streaming begins before tokens arrive', () => {
    const emptyStreamingChat: Chat = {
      ...mockChat,
      messages: [
        { id: 'm1', role: 'user', content: 'What is 2+2?', timestamp: '10:00 AM' },
        { id: 'm2', role: 'assistant', content: '', timestamp: '10:01 AM' }
      ]
    };

    const { container } = render(
      <ChatArea
        {...defaultProps}
        chat={emptyStreamingChat}
        isGenerating={true}
      />
    );

    const loader = container.querySelector('.tl-loader');
    expect(loader).not.toBeNull();
    expect(loader?.getAttribute('data-variant')).toBe('cascade');
    expect(loader?.getAttribute('aria-label')).toBe('Thinking...');
  });

  it('opens enlarged ImageModal when clicking on an image attachment in a message', () => {
    const chatWithImage: Chat = {
      ...mockChat,
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Check out this screenshot',
          timestamp: '10:00 AM',
          attachments: [
            {
              id: 'att-1',
              name: 'screenshot-preview.png',
              type: 'image/png',
              size: 2048,
              data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            }
          ]
        }
      ]
    };

    render(
      <ChatArea
        {...defaultProps}
        chat={chatWithImage}
      />
    );

    expect(screen.getByText('screenshot-preview.png')).toBeDefined();
    
    // Modal is initially not open
    expect(screen.queryByRole('dialog')).toBeNull();

    // Click the attachment button
    const attachmentBtn = screen.getByRole('button', { name: /View enlarged image: screenshot-preview\.png/i });
    fireEvent.click(attachmentBtn);

    // Modal is now open
    const modal = screen.getByRole('dialog');
    expect(modal).toBeDefined();
    expect(within(modal).getByText('screenshot-preview.png')).toBeDefined();
  });

  it('opens enlarged ImageModal when clicking on a markdown image in an assistant message', () => {
    const chatWithAssistantImage: Chat = {
      ...mockChat,
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Generate a chart',
          timestamp: '10:00 AM'
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Here is your chart: ![Quarterly Growth](https://example.com/growth.png)',
          timestamp: '10:01 AM'
        }
      ]
    };

    render(
      <ChatArea
        {...defaultProps}
        chat={chatWithAssistantImage}
      />
    );

    const img = screen.getByAltText('Quarterly Growth');
    expect(img).toBeDefined();

    // Modal is initially not open
    expect(screen.queryByRole('dialog')).toBeNull();

    // Click the markdown image
    fireEvent.click(img);

    // Modal is now open displaying the image
    const modal = screen.getByRole('dialog');
    expect(modal).toBeDefined();
    expect(within(modal).getByAltText('Quarterly Growth')).toBeDefined();
  });

  it('opens conversation dropdown and switches chat when an item is clicked', () => {
    const handleSelectChat = vi.fn();
    const handleNewChat = vi.fn();
    const otherChat = { ...mockChat, id: 'chat-2', title: 'Research Agent' };

    render(
      <ChatArea
        {...defaultProps}
        chats={[mockChat, otherChat]}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
      />
    );

    const titleBtn = screen.getByLabelText('Select conversation');
    fireEvent.click(titleBtn);

    expect(screen.getByText('Conversations')).toBeDefined();
    const targetChat = screen.getByText('Research Agent');
    fireEvent.click(targetChat);

    expect(handleSelectChat).toHaveBeenCalledWith('chat-2');
  });
});


