import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../App';
import { Storage } from '../../utils/storage';

// Mock scroll and storage helpers
beforeEach(() => {
  global.EventSource = vi.fn().mockImplementation(() => ({ close: vi.fn(), onmessage: null, onerror: null })) as any;
  Element.prototype.scrollTo = vi.fn();
  vi.spyOn(Storage, 'getChats').mockResolvedValue([
    {
      id: 'chat-1',
      title: 'First Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{ id: 'm1', role: 'user', content: 'Hi 1', timestamp: '10:00 AM' }]
    },
    {
      id: 'chat-2',
      title: 'Second Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{ id: 'm2', role: 'user', content: 'Hi 2', timestamp: '10:05 AM' }]
    }
  ]);
  vi.spyOn(Storage, 'getActiveChatId').mockReturnValue('chat-1');
  vi.spyOn(Storage, 'deleteChat').mockImplementation(() => Promise.resolve());
  vi.spyOn(Storage, 'saveChat').mockImplementation(() => Promise.resolve());
  vi.spyOn(Storage, 'saveActiveChatId').mockImplementation(() => Promise.resolve());
});

describe('Chat Deletion and Undo Flow in App', () => {
  it('deletes a chat and restores it when Undo is clicked', async () => {
    render(<App />);

    expect(await screen.findAllByText('First Chat')).not.toHaveLength(0);
    expect(await screen.findAllByText('Second Chat')).not.toHaveLength(0);

    // Click delete on First Chat
    const deleteBtn = screen.getByLabelText('Delete chat First Chat');
    fireEvent.click(deleteBtn);

    // First Chat should be removed from view and toast should appear with Undo
    expect(screen.queryByLabelText('Delete chat First Chat')).toBeNull();
    expect(screen.getByText('Deleted "First Chat".')).toBeDefined();

    const undoBtn = screen.getByText('Undo');
    fireEvent.click(undoBtn);

    // First Chat should be restored to view
    expect(await screen.findAllByText('First Chat')).not.toHaveLength(0);
    expect(screen.getByText('Restored "First Chat".')).toBeDefined();
  });

  it('correctly handles sequential deletions and restores the specific chat clicked', async () => {
    render(<App />);

    await screen.findAllByText('First Chat');
    const deleteBtn1 = screen.getByLabelText('Delete chat First Chat');
    fireEvent.click(deleteBtn1);

    const deleteBtn2 = screen.getByLabelText('Delete chat Second Chat');
    fireEvent.click(deleteBtn2);

    expect(screen.queryByLabelText('Delete chat First Chat')).toBeNull();
    expect(screen.queryByLabelText('Delete chat Second Chat')).toBeNull();

    // Click Undo on the First Chat toast
    const undoButtons = screen.getAllByText('Undo');
    expect(undoButtons.length).toBeGreaterThan(0);

    // Trigger the first Undo
    fireEvent.click(undoButtons[0]);

    // Second Chat (from the latest toast) should be restored
    expect(await screen.findAllByText('Second Chat')).not.toHaveLength(0);
    expect(Storage.saveChat).toHaveBeenCalled();
  });
});
