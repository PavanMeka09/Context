import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutsModal } from '../ShortcutsModal';

describe('ShortcutsModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(<ShortcutsModal isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when isOpen is true and shows key shortcuts', () => {
    render(<ShortcutsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Keyboard Navigation')).toBeDefined();
    expect(screen.getByText('Toggle universal command palette')).toBeDefined();
    expect(screen.getByText('Create a new conversation session')).toBeDefined();
  });

  it('calls onClose when close button or background overlay is clicked', () => {
    const onCloseMock = vi.fn();
    render(<ShortcutsModal isOpen={true} onClose={onCloseMock} />);

    const closeBtn = screen.getByLabelText('Close shortcuts guide');
    fireEvent.click(closeBtn);

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
