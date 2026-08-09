import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';
import type { Chat, Settings } from '../../utils/storage';

describe('CommandPalette Component', () => {
  const mockChats: Chat[] = [];
  const mockSettings: Settings = {
    provider: 'gemini',
    apiKey: 'test-key',
    model: 'gemini-2.5-flash',
    isWebSearchEnabled: false,
    thinkingLevel: 'off',
    isMemoryEnabled: true,
    isBrowserAgentEnabled: false
  };

  it('does not render when isOpen is false', () => {
    render(
      <CommandPalette
        isOpen={false}
        onClose={vi.fn()}
        chats={mockChats}
        activeChatId={null}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        settings={mockSettings}
        onSettingsChanged={vi.fn()}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
        theme="dark"
        onThemeChanged={vi.fn()}
        onToggleSidebar={vi.fn()}
        onToggleSettings={vi.fn()}
        onShowToast={vi.fn()}
      />
    );

    expect(screen.queryByPlaceholderText('Type a command or search...')).toBeNull();
  });

  it('renders command palette input when isOpen is true', () => {
    render(
      <CommandPalette
        isOpen={true}
        onClose={vi.fn()}
        chats={mockChats}
        activeChatId={null}
        onSelectChat={vi.fn()}
        onNewChat={vi.fn()}
        settings={mockSettings}
        onSettingsChanged={vi.fn()}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
        theme="dark"
        onThemeChanged={vi.fn()}
        onToggleSidebar={vi.fn()}
        onToggleSettings={vi.fn()}
        onShowToast={vi.fn()}
      />
    );

    expect(screen.getByPlaceholderText('Type a command or search...')).toBeDefined();
    expect(screen.getByText('New Conversation')).toBeDefined();
  });

  it('triggers action when command item is clicked', () => {
    const handleNewChat = vi.fn();
    const handleClose = vi.fn();

    render(
      <CommandPalette
        isOpen={true}
        onClose={handleClose}
        chats={mockChats}
        activeChatId={null}
        onSelectChat={vi.fn()}
        onNewChat={handleNewChat}
        settings={mockSettings}
        onSettingsChanged={vi.fn()}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
        theme="dark"
        onThemeChanged={vi.fn()}
        onToggleSidebar={vi.fn()}
        onToggleSettings={vi.fn()}
        onShowToast={vi.fn()}
      />
    );

    const newChatCmd = screen.getByText('New Conversation');
    fireEvent.click(newChatCmd);

    expect(handleNewChat).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
