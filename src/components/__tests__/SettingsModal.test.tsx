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
  }),
  fetchOllamaRunningModels: vi.fn().mockResolvedValue({
    success: true,
    models: [
      {
        name: 'llama3.2:latest',
        model: 'llama3.2:latest',
        size_vram: 2147483648,
        expires_at: '2026-08-30T05:00:00.000Z',
        details: { parameter_size: '3.2B' }
      }
    ]
  }),
  unloadOllamaModel: vi.fn().mockResolvedValue({
    success: true,
    message: 'Model llama3.2:latest unloaded'
  }),
  formatShutdownCountdown: vi.fn().mockReturnValue({
    formattedTime: '05:00:00 AM',
    countdownText: '4m 0s',
    isExpired: false,
    isIndefinite: false,
    remainingSeconds: 240
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

    const apiKeyInput = screen.getByPlaceholderText('Not required for local Ollama') as HTMLInputElement;
    expect(apiKeyInput.value).toBe('');
  });

  it('allows clearing API key to empty value in input field', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const apiKeyInput = screen.getByPlaceholderText('Enter Gemini API Key...') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(apiKeyInput, { target: { value: 'temp-key' } });
    });
    expect(apiKeyInput.value).toBe('temp-key');

    await act(async () => {
      fireEvent.change(apiKeyInput, { target: { value: '' } });
    });
    expect(apiKeyInput.value).toBe('');
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

  it('switches between squircle profiles by clicking inactive profile squircle', async () => {
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

    // Both profiles should now be visible as squircles
    const defaultProfileSquircle = screen.getByText('Default Profile');
    await act(async () => {
      fireEvent.click(defaultProfileSquircle);
    });

    // Default Profile is now active and shows its rename button
    expect(screen.getByText('Default Profile')).toBeDefined();
    expect(screen.getByTitle('Rename profile')).toBeDefined();
  });

  it('cancels profile rename with cancel button and escape key', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const renameBtn = screen.getByTitle('Rename profile');
    await act(async () => {
      fireEvent.click(renameBtn);
    });

    const cancelBtn = screen.getByTitle('Cancel');
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(screen.queryByTitle('Cancel')).toBeNull();
    expect(screen.getByText('Default Profile')).toBeDefined();

    // Start rename again with button and cancel with Escape
    const renameBtn2 = screen.getByTitle('Rename profile');
    await act(async () => {
      fireEvent.click(renameBtn2);
    });

    const input = screen.getByDisplayValue('Default Profile');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });

    expect(screen.queryByDisplayValue('Default Profile')).toBeNull();
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

  it('renders Ollama model shutdown countdown and allows unloading model', async () => {
    await act(async () => {
      render(<SettingsModal {...defaultProps} />);
    });

    const providerSelect = screen.getByLabelText('API Provider');
    await act(async () => {
      fireEvent.change(providerSelect, { target: { value: 'ollama' } });
    });

    expect(screen.getByText('Ollama Model Runtime & Shutdown Status')).toBeDefined();
    expect(screen.getByText('llama3.2:latest')).toBeDefined();
    expect(screen.getByText(/In 4m 0s/i)).toBeDefined();
    expect(screen.getByText(/(at 05:00:00 AM)/i)).toBeDefined();
    expect(screen.getByText('2.00 GB VRAM')).toBeDefined();

    const unloadBtn = screen.getByText('Unload Now');
    await act(async () => {
      fireEvent.click(unloadBtn);
    });

    expect(screen.getByText('Unload Now')).toBeDefined();
  });
});
