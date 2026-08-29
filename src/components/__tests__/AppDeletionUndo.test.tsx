import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../App';
import { Storage } from '../../utils/storage';

// Mock scroll and storage helpers
beforeEach(() => {
  global.EventSource = vi.fn().mockImplementation(() => ({ close: vi.fn(), onmessage: null, onerror: null })) as unknown as typeof EventSource;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => []
  });
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
    expect(Storage.saveChat).toHaveBeenCalled();
  });

  it('keeps queued messages in yellow box only and adds to transcript upon dequeuing', async () => {
    const apiModule = await import('../../utils/api');
    let completeFirstStream: (text: string) => void = () => {};

    vi.spyOn(apiModule, 'streamChatCompletion').mockImplementation(
      (_settings, _history, _system, callbacks) => {
        completeFirstStream = (text: string) => {
          callbacks.onDone(text);
        };
        return new Promise(() => {});
      }
    );

    render(<App />);

    expect(await screen.findByText('Hi 1')).toBeDefined();

    const input = screen.getByPlaceholderText('Ask anything...');

    // Send 1st message (starts generating)
    fireEvent.change(input, { target: { value: 'First query' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(await screen.findByText('First query')).toBeDefined();
    expect(await screen.findByText('Stop generating')).toBeDefined();

    // While generating, send 2nd message (gets queued)
    fireEvent.change(input, { target: { value: 'Second query (queued)' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    // While generating, send 3rd message (gets queued)
    fireEvent.change(input, { target: { value: 'Third query (queued)' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    // Assert: Yellow box has both queued messages
    expect(await screen.findByText('Queued Messages (2)')).toBeDefined();
    expect(screen.getByText('Second query (queued)')).toBeDefined();
    expect(screen.getByText('Third query (queued)')).toBeDefined();

    // Assert: Chat transcript does NOT contain the queued messages (they are only in the yellow box)
    const messageBodies = document.querySelectorAll('.message-card-body');
    const renderedChatTexts = Array.from(messageBodies).map(el => el.textContent);
    expect(renderedChatTexts.some(t => t?.includes('Second query (queued)'))).toBe(false);
    expect(renderedChatTexts.some(t => t?.includes('Third query (queued)'))).toBe(false);

    // Complete the first stream
    completeFirstStream('First answer');

    // After completion, Second query should be dequeued into chat transcript
    const updatedBodies = await screen.findAllByText('Second query (queued)');
    expect(updatedBodies.length).toBeGreaterThan(0);

    // Yellow box should now show only 1 queued message
    expect(screen.getByText('Queued Messages (1)')).toBeDefined();
    expect(screen.getByText('Third query (queued)')).toBeDefined();

    // Cancel the 3rd queued message via the remove button
    const removeBtn = screen.getByTitle('Remove from queue');
    fireEvent.click(removeBtn);

    // Yellow box should disappear
    expect(screen.queryByText(/Queued Messages/)).toBeNull();
  });

  it('restores pending queued message into composer input when generation is stopped', async () => {
    const apiModule = await import('../../utils/api');

    vi.spyOn(apiModule, 'streamChatCompletion').mockImplementation(
      () => new Promise(() => {}) // Stays in flight
    );

    render(<App />);

    expect(await screen.findByText('Hi 1')).toBeDefined();

    const input = screen.getByPlaceholderText('Ask anything...');

    // Send 1st message
    fireEvent.change(input, { target: { value: 'In flight prompt' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(await screen.findByText('Stop generating')).toBeDefined();

    // Queue 2nd message
    fireEvent.change(input, { target: { value: 'Pending prompt to recover' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(await screen.findByText('Queued Messages (1)')).toBeDefined();
    expect(screen.getByText('Pending prompt to recover')).toBeDefined();

    // Stop generating
    const stopBtn = screen.getByText('Stop generating');
    fireEvent.click(stopBtn);

    // Assert: Stop generating cancelled, yellow box is cleared, and prompt is restored to composer textarea
    expect(screen.queryByText(/Queued Messages/)).toBeNull();
    expect((input as HTMLTextAreaElement).value).toContain('Pending prompt to recover');
  });
});
