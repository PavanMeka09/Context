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

    expect(screen.getByPlaceholderText('Ask anything...')).toBeDefined();
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

    const textarea = screen.getByPlaceholderText('Ask anything...');
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

    const textarea = screen.getByPlaceholderText('Ask anything...');
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

    const stopBtn = screen.getByText('Stop generating');
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

    const textarea = screen.getByPlaceholderText('Ask anything...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(handleSend).toHaveBeenCalledTimes(1);
  });

  it('displays Queue box at top of input when messageQueue has items', () => {
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
          { id: 'q1', userGoal: 'First queued prompt' },
          { id: 'q2', userGoal: 'Second queued prompt' }
        ]}
      />
    );

    expect(screen.getByText('Queued Messages (2)')).toBeDefined();
    expect(screen.getByText('First queued prompt')).toBeDefined();
    expect(screen.getByText('Second queued prompt')).toBeDefined();
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

    const contextBtn = screen.getByLabelText('Toggle Web Context');
    expect(contextBtn).toBeDefined();
    fireEvent.click(contextBtn);

    expect(handleSettingsChanged).toHaveBeenCalledWith(
      expect.objectContaining({ isWebContextEnabled: true })
    );
  });
});
