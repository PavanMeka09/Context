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
});
