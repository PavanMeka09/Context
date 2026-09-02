import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Composer } from '../Composer';
import React from 'react';
import type { Settings } from '../../utils/storage';

describe('Composer Component', () => {
  const mockSettings: Settings = {
    provider: 'gemini',
    apiKey: 'test-key',
    model: 'gemini-2.5-flash',
    isWebSearchEnabled: false,
    thinkingLevel: 'off',
    isMemoryEnabled: true,
    isBrowserAgentEnabled: false
  };

  const createRef = () => React.createRef<HTMLTextAreaElement>();

  it('renders input placeholder', () => {
    render(
      <Composer
        input=""
        onChangeInput={vi.fn()}
        onSend={vi.fn()}
        isGenerating={false}
        onStop={vi.fn()}
        inputRef={createRef()}
        settings={mockSettings}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
      />
    );

    expect(screen.getByPlaceholderText('Ask your agent anything...')).toBeDefined();
  });

  it('calls onChangeInput when typing in textarea', () => {
    const handleChangeInput = vi.fn();

    render(
      <Composer
        input=""
        onChangeInput={handleChangeInput}
        onSend={vi.fn()}
        isGenerating={false}
        onStop={vi.fn()}
        inputRef={createRef()}
        settings={mockSettings}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
      />
    );

    const textarea = screen.getByPlaceholderText('Ask your agent anything...');
    fireEvent.change(textarea, { target: { value: 'Hello Assistant' } });

    expect(handleChangeInput).toHaveBeenCalledWith('Hello Assistant');
  });

  it('triggers onSend when Enter is pressed without Shift', () => {
    const handleSend = vi.fn();

    render(
      <Composer
        input="Write code"
        onChangeInput={vi.fn()}
        onSend={handleSend}
        isGenerating={false}
        onStop={vi.fn()}
        inputRef={createRef()}
        settings={mockSettings}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
      />
    );

    const textarea = screen.getByPlaceholderText('Ask your agent anything...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(handleSend).toHaveBeenCalledTimes(1);
  });

  it('shows Stop button when isGenerating is true', () => {
    const handleStop = vi.fn();

    render(
      <Composer
        input="Thinking..."
        onChangeInput={vi.fn()}
        onSend={vi.fn()}
        isGenerating={true}
        onStop={handleStop}
        inputRef={createRef()}
        settings={mockSettings}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
      />
    );

    const stopBtn = screen.getByLabelText('Stop generating');
    fireEvent.click(stopBtn);

    expect(handleStop).toHaveBeenCalledTimes(1);
  });

  it('triggers onSend when Enter is pressed even while isGenerating is true (queuing message)', () => {
    const handleSend = vi.fn();

    render(
      <Composer
        input="Queued message text"
        onChangeInput={vi.fn()}
        onSend={handleSend}
        isGenerating={true}
        onStop={vi.fn()}
        inputRef={createRef()}
        settings={mockSettings}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
      />
    );

    const textarea = screen.getByPlaceholderText('Ask your agent anything...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(handleSend).toHaveBeenCalledTimes(1);
  });

  it('displays Queue box at top of input when messageQueue has items and calls onRemoveQueuedMessage when cancelled', () => {
    const handleRemove = vi.fn();
    render(
      <Composer
        input=""
        onChangeInput={vi.fn()}
        onSend={vi.fn()}
        isGenerating={true}
        onStop={vi.fn()}
        inputRef={createRef()}
        settings={mockSettings}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
        queueCount={2}
        messageQueue={[
          { id: 'q1', chatId: 'chat-1', userMessageId: 'm-1', userGoal: 'First queued prompt' },
          { id: 'q2', chatId: 'chat-1', userMessageId: 'm-2', userGoal: 'Second queued prompt' }
        ]}
        onRemoveQueuedMessage={handleRemove}
      />
    );

    expect(screen.getByText('Queued Messages (2)')).toBeDefined();
    expect(screen.getByText('First queued prompt')).toBeDefined();
    expect(screen.getByText('Second queued prompt')).toBeDefined();

    const removeButtons = screen.getAllByTitle('Remove from queue');
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[0]);
    expect(handleRemove).toHaveBeenCalledWith('q1');
  });
  it('renders voice typing mic button', () => {
    render(
      <Composer
        input=""
        onChangeInput={vi.fn()}
        onSend={vi.fn()}
        isGenerating={false}
        onStop={vi.fn()}
        inputRef={createRef()}
        settings={mockSettings}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
      />
    );

    const micBtn = screen.getByLabelText('Voice typing');
    expect(micBtn).toBeDefined();
  });

  it('triggers error callback when speech recognition is not supported in browser mode', () => {
    const handleError = vi.fn();
    
    // Mock MediaRecorder support so the button is enabled, but WebSpeech is absent
    const origMediaRecorder = window.MediaRecorder;
    const origMediaDevices = navigator.mediaDevices;
    (window as any).MediaRecorder = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      configurable: true,
      writable: true
    });

    try {
      render(
        <Composer
          input=""
          onChangeInput={vi.fn()}
          onSend={vi.fn()}
          isGenerating={false}
          onStop={vi.fn()}
          inputRef={createRef()}
          onError={handleError}
          settings={{ ...mockSettings, speechInputMode: 'browser' }}
          activePromptId="preset-general"
          onSelectPromptId={vi.fn()}
          customPrompts={[]}
        />
      );

      const micBtn = screen.getByLabelText('Voice typing');
      fireEvent.click(micBtn);

      expect(handleError).toHaveBeenCalledWith(
        expect.stringContaining('Browser speech recognition is not supported')
      );
    } finally {
      (window as any).MediaRecorder = origMediaRecorder;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: origMediaDevices,
        configurable: true,
        writable: true
      });
    }
  });

  it('renders Web Context toggle button and triggers onSettingsChanged when clicked', () => {
    const handleSettingsChanged = vi.fn();

    render(
      <Composer
        input=""
        onChangeInput={vi.fn()}
        onSend={vi.fn()}
        isGenerating={false}
        onStop={vi.fn()}
        inputRef={createRef()}
        settings={mockSettings}
        onSettingsChanged={handleSettingsChanged}
        activePromptId="preset-general"
        onSelectPromptId={vi.fn()}
        customPrompts={[]}
      />
    );

    const contextBtn = screen.getByLabelText('Toggle Web Context (Crawl4AI)');
    expect(contextBtn).toBeDefined();
    fireEvent.click(contextBtn);

    expect(handleSettingsChanged).toHaveBeenCalledWith(
      expect.objectContaining({ isWebContextEnabled: true })
    );
  });
});
