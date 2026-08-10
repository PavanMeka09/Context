import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';

vi.mock('../../utils/api', () => ({
  fetchModels: vi.fn().mockResolvedValue([
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' }
  ])
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

  it('does not render when isOpen is false', () => {
    const { container } = render(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when isOpen is true', () => {
    render(<SettingsModal {...defaultProps} />);

    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('AI Provider')).toBeDefined();
  });
  it('switches provider dropdown and updates provider selection', () => {
    render(<SettingsModal {...defaultProps} />);

    const providerSelect = screen.getByLabelText('API Provider');
    fireEvent.change(providerSelect, { target: { value: 'anthropic' } });

    expect(screen.getByText('Anthropic Claude API Key')).toBeDefined();
  });

  it('switches tabs when tab buttons are clicked', () => {
    render(<SettingsModal {...defaultProps} />);

    const memoryTab = screen.getByText('Memory');
    fireEvent.click(memoryTab);

    expect(screen.getByText('Add Custom Memory')).toBeDefined();
  });

  it('saves settings when Save Settings button is clicked', () => {
    render(<SettingsModal {...defaultProps} />);

    const saveBtn = screen.getByText('Save Settings');
    fireEvent.click(saveBtn);

    expect(defaultProps.onSettingsSaved).toHaveBeenCalled();
  });
  it('renders provider profile management UI with Default Profile', () => {
    render(<SettingsModal {...defaultProps} />);

    expect(screen.getByText('Provider Profile')).toBeDefined();
    expect(screen.getByText('Default Profile')).toBeDefined();
    expect(screen.getByText('New Profile')).toBeDefined();
  });

  it('adds a new profile and switches active profile', () => {
    render(<SettingsModal {...defaultProps} />);

    const newProfileBtn = screen.getByText('New Profile');
    fireEvent.click(newProfileBtn);

    expect(screen.getByDisplayValue('Profile 2')).toBeDefined();
  });

  it('renames a profile when edit button is clicked', () => {
    render(<SettingsModal {...defaultProps} />);

    const renameBtn = screen.getByTitle('Rename profile');
    fireEvent.click(renameBtn);

    const input = screen.getByDisplayValue('Default Profile');
    fireEvent.change(input, { target: { value: 'Personal Gemini' } });

    const saveNameBtn = screen.getByTitle('Save name');
    fireEvent.click(saveNameBtn);

    expect(screen.getByText('Personal Gemini')).toBeDefined();
  });

  it('deletes active profile when delete button is clicked', () => {
    render(<SettingsModal {...defaultProps} />);

    const newProfileBtn = screen.getByText('New Profile');
    fireEvent.click(newProfileBtn);

    const saveNameBtn = screen.getByTitle('Save name');
    fireEvent.click(saveNameBtn);

    const deleteBtn = screen.getByTitle('Delete profile');
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('Profile 2')).toBeNull();
    expect(screen.getByText('Default Profile')).toBeDefined();
  });
});
