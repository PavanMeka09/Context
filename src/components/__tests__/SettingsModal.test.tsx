import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';

vi.mock('../../utils/api', () => ({
  fetchModels: vi.fn().mockResolvedValue([
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' }
  ]),
  testOllamaConnection: vi.fn().mockResolvedValue({
    success: true,
    message: 'Successfully connected to Ollama! (2 models found)',
    models: ['llama3.2', 'deepseek-r1']
  })
}));

describe('SettingsModal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    activeChat: null,
    onSettingsSaved: vi.fn(),
    onPromptsChanged: vi.fn(),
    onBackupImported: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('does not render when isOpen is false', async () => {
    let container: HTMLElement;
    await act(async () => {
      const res = render(<SettingsModal {...defaultProps} isOpen={false} />);
      container = res.container;
    });
    expect(container!.firstChild).toBeNull();
  });

  it('renders correctly when isOpen is true', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('AI Provider')).toBeDefined();
  });

  it('switches provider dropdown and updates provider selection', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const providerSelect = screen.getByLabelText('API Provider');
    await act(async () => {
      fireEvent.change(providerSelect, { target: { value: 'anthropic' } });
    });

    expect(screen.getByText('Anthropic Claude API Key')).toBeDefined();
  });

  it('switches provider to Ollama and tests connection', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const providerSelect = screen.getByLabelText('API Provider');
    await act(async () => {
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });
    });

    expect(screen.getByText('Ollama Instance URL')).toBeDefined();
    expect(screen.getByText('Test Connection')).toBeDefined();
    expect(screen.getByText(/Ollama \(Local\) API Key/i)).toBeDefined();

    const testBtn = screen.getByText('Test Connection');
    await act(async () => {
      fireEvent.click(testBtn);
    });

    expect(screen.getByText(/Successfully connected to Ollama/i)).toBeDefined();
  });

  it('switches tabs when tab buttons are clicked', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const memoryTab = screen.getByText('Memory');
    await act(async () => {
      fireEvent.click(memoryTab);
    });

    expect(screen.getByText('Add Custom Memory')).toBeDefined();
  });

  it('saves settings when Save Settings button is clicked', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const saveBtn = screen.getByText('Save Settings');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(defaultProps.onSettingsSaved).toHaveBeenCalled();
  });

  it('renders provider profile management UI with Default Profile', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    expect(screen.getByText('Provider Profile')).toBeDefined();
    expect(screen.getByText('Default Profile')).toBeDefined();
    expect(screen.getByText('New Profile')).toBeDefined();
  });

  it('adds a new profile and switches active profile', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const newProfileBtn = screen.getByText('New Profile');
    await act(async () => {
      fireEvent.click(newProfileBtn);
    });

    expect(screen.getByDisplayValue('Profile 2')).toBeDefined();
  });

  it('renames a profile when edit button is clicked', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const renameBtn = screen.getByTitle('Rename profile');
    await act(async () => {
      fireEvent.click(renameBtn);
    });

    const input = screen.getByDisplayValue('Default Profile');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Personal Gemini' } });
    });

    const saveNameBtn = screen.getByTitle('Save name');
    await act(async () => {
      fireEvent.click(saveNameBtn);
    });

    expect(screen.getByText('Personal Gemini')).toBeDefined();
  });

  it('deletes active profile when delete button is clicked', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const newProfileBtn = screen.getByText('New Profile');
    await act(async () => {
      fireEvent.click(newProfileBtn);
    });

    const saveNameBtn = screen.getByTitle('Save name');
    await act(async () => {
      fireEvent.click(saveNameBtn);
    });

    const deleteBtn = screen.getByTitle('Delete profile');
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(screen.queryByText('Profile 2')).toBeNull();
    expect(screen.getByText('Default Profile')).toBeDefined();
  });

  it('renders Web Search and Web Context toggles in Web Search tab', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const webSearchTab = screen.getByText('Web Search');
    await act(async () => {
      fireEvent.click(webSearchTab);
    });

    expect(screen.getByText('Enable Live Web Search')).toBeDefined();
    expect(screen.getByText('Enable Autonomous Web Context (Crawler)')).toBeDefined();
  });
});
