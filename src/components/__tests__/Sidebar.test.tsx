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
        onOpenSettings={vi.fn()}
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
        onOpenSettings={vi.fn()}
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
        onOpenSettings={vi.fn()}
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

  it('calls onDeleteChat when delete button is clicked', () => {
    const handleDeleteChat = vi.fn();
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    const optionsBtn = screen.getByLabelText('Options for First Conversation');
    fireEvent.click(optionsBtn);

    const deleteBtn = screen.getByLabelText('Delete chat First Conversation');
    fireEvent.click(deleteBtn);

    expect(handleDeleteChat).toHaveBeenCalledWith('chat-1');
  });

  it('allows renaming chat on double-click and saves on Enter', () => {
    const handleRenameChat = vi.fn();
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onRenameChat={handleRenameChat}
        onOpenSettings={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    const chatButton = screen.getByText('First Conversation').closest('button');
    expect(chatButton).toBeDefined();

    // Double-click chat button to start rename
    fireEvent.doubleClick(chatButton!);

    // Input should appear
    const editInput = screen.getByLabelText('Edit chat title') as HTMLInputElement;
    expect(editInput).toBeDefined();
    expect(editInput.value).toBe('First Conversation');

    // Change title and press Enter
    fireEvent.change(editInput, { target: { value: 'Renamed Project Alpha' } });
    fireEvent.keyDown(editInput, { key: 'Enter', code: 'Enter' });

    expect(handleRenameChat).toHaveBeenCalledWith('chat-1', 'Renamed Project Alpha');
    expect(screen.queryByLabelText('Edit chat title')).toBeNull();
  });

  it('cancels renaming when Escape key is pressed', () => {
    const handleRenameChat = vi.fn();
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onRenameChat={handleRenameChat}
        onOpenSettings={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    const chatButton = screen.getByText('First Conversation').closest('button');
    fireEvent.doubleClick(chatButton!);

    const editInput = screen.getByLabelText('Edit chat title');
    fireEvent.change(editInput, { target: { value: 'Should Not Save' } });
    fireEvent.keyDown(editInput, { key: 'Escape', code: 'Escape' });

    expect(handleRenameChat).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Edit chat title')).toBeNull();
  });

  it('saves renamed title on blur', () => {
    const handleRenameChat = vi.fn();
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onRenameChat={handleRenameChat}
        onOpenSettings={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    const chatButton = screen.getByText('First Conversation').closest('button');
    fireEvent.doubleClick(chatButton!);

    const editInput = screen.getByLabelText('Edit chat title');
    fireEvent.change(editInput, { target: { value: 'Saved On Blur' } });
    fireEvent.blur(editInput);

    expect(handleRenameChat).toHaveBeenCalledWith('chat-1', 'Saved On Blur');
    expect(screen.queryByLabelText('Edit chat title')).toBeNull();
  });

  it('calls onOpenSettings when Settings button is clicked', () => {
    const handleOpenSettings = vi.fn();
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onOpenSettings={handleOpenSettings}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    const settingsBtn = screen.getByLabelText('Open settings');
    expect(settingsBtn).toBeDefined();
    fireEvent.click(settingsBtn);

    expect(handleOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('calls onThemeChanged when Theme button is clicked', () => {
    const handleThemeChanged = vi.fn();
    render(
      <Sidebar
        chats={mockChats}
        activeChatId="chat-1"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onOpenSettings={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={handleThemeChanged}
      />
    );

    const themeBtn = screen.getByLabelText('Switch to light theme');
    expect(themeBtn).toBeDefined();
    fireEvent.click(themeBtn);

    expect(handleThemeChanged).toHaveBeenCalledWith('light');
  });

  it('correctly buckets chats chronologically into Today, Yesterday, Previous 7 Days, and Older', () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOf7DaysAgo = startOfToday - 7 * 86400000;
    const startOf8DaysAgo = startOfToday - 8 * 86400000;
    const startOf9DaysAgo = startOfToday - 9 * 86400000;

    const dateBucketedChats: Chat[] = [
      {
        id: 'chat-today',
        title: 'Today Chat',
        createdAt: new Date(startOfToday + 3600000).toISOString(),
        updatedAt: new Date(startOfToday + 3600000).toISOString(),
        messages: []
      },
      {
        id: 'chat-yesterday',
        title: 'Yesterday Chat',
        createdAt: new Date(startOfYesterday + 3600000).toISOString(),
        updatedAt: new Date(startOfYesterday + 3600000).toISOString(),
        messages: []
      },
      {
        id: 'chat-7days',
        title: '7 Days Ago Chat',
        createdAt: new Date(startOf7DaysAgo + 3600000).toISOString(),
        updatedAt: new Date(startOf7DaysAgo + 3600000).toISOString(),
        messages: []
      },
      {
        id: 'chat-8days',
        title: '8 Days Ago Chat',
        createdAt: new Date(startOf8DaysAgo + 3600000).toISOString(),
        updatedAt: new Date(startOf8DaysAgo + 3600000).toISOString(),
        messages: []
      },
      {
        id: 'chat-older',
        title: 'Older Chat',
        createdAt: new Date(startOf9DaysAgo).toISOString(),
        updatedAt: new Date(startOf9DaysAgo).toISOString(),
        messages: []
      }
    ];

    render(
      <Sidebar
        chats={dateBucketedChats}
        activeChatId="chat-today"
        settings={mockSettings}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteChat={vi.fn()}
        onOpenSettings={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        theme="dark"
        onThemeChanged={vi.fn()}
      />
    );

    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.getByText('Today Chat')).toBeDefined();

    expect(screen.getByText('Yesterday')).toBeDefined();
    expect(screen.getByText('Yesterday Chat')).toBeDefined();

    expect(screen.getByText('Previous 7 Days')).toBeDefined();
    expect(screen.getByText('7 Days Ago Chat')).toBeDefined();
    expect(screen.getByText('8 Days Ago Chat')).toBeDefined();

    expect(screen.getByText('Older')).toBeDefined();
    expect(screen.getByText('Older Chat')).toBeDefined();
  });
});

