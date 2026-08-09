import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../Sidebar';
import type { Chat, Settings } from '../../utils/storage';

describe('Sidebar Component', () => {
  const mockChats: Chat[] = [
    {
      id: 'chat-1',
      title: 'First Conversation',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      messages: [{ id: 'm1', role: 'user', content: 'Hello world', timestamp: '1' }]
    },
    {
      id: 'chat-2',
      title: 'Python Script Debugging',
      createdAt: '2026-01-02',
      updatedAt: '2026-01-02',
      messages: [{ id: 'm2', role: 'user', content: 'Help with python', timestamp: '2' }]
    }
  ];

  const mockSettings: Settings = {
    provider: 'gemini',
    apiKey: 'test-key',
    model: 'gemini-2.5-flash',
    isWebSearchEnabled: false,
    thinkingLevel: 'off',
    isMemoryEnabled: true,
    isBrowserAgentEnabled: false
  };

  it('renders list of chats and model info', () => {
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onRenameChat={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenSchedules={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    expect(screen.getByText('First Conversation')).toBeDefined();
    expect(screen.getByText('Python Script Debugging')).toBeDefined();
    expect(screen.getByText('Gemini')).toBeDefined();
  });

  it('filters chats based on search query', () => {
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onRenameChat={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenSchedules={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search chats...');
    fireEvent.change(searchInput, { target: { value: 'Python' } });

    expect(screen.queryByText('First Conversation')).toBeNull();
    expect(screen.getByText('Python Script Debugging')).toBeDefined();
  });

  it('calls onNewChat when New Chat button is clicked', () => {
    const handleNewChat = vi.fn();
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={handleNewChat}
        onDeleteChat={vi.fn()}
        onRenameChat={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenSchedules={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    const newChatBtn = screen.getByText('New Chat');
    fireEvent.click(newChatBtn);

    expect(handleNewChat).toHaveBeenCalledTimes(1);
  });

  it('shows inline deletion confirmation when delete button is clicked and calls onDeleteChat on confirm', () => {
    const handleDeleteChat = vi.fn();
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={handleDeleteChat}
        onRenameChat={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenSchedules={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    const deleteBtn = screen.getByLabelText('Delete chat First Conversation');
    fireEvent.click(deleteBtn);

    expect(screen.getByText('Delete?')).toBeDefined();
    expect(handleDeleteChat).not.toHaveBeenCalled();

    const confirmBtn = screen.getByLabelText('Confirm delete chat First Conversation');
    fireEvent.click(confirmBtn);

    expect(handleDeleteChat).toHaveBeenCalledWith('chat-1');
  });
});
