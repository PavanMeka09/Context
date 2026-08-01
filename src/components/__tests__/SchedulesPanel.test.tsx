import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SchedulesPanel } from '../SchedulesPanel';

describe('SchedulesPanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/schedules/runs')) {
        return Promise.resolve({
          ok: true,
          json: async () => []
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => []
      });
    });
  });

  it('does not render content when isOpen is false', () => {
    render(
      <SchedulesPanel
        isOpen={false}
        onClose={vi.fn()}
        chats={[]}
        onShowToast={vi.fn()}
      />
    );

    expect(screen.queryByText('Task Scheduling')).toBeNull();
  });

  it('renders schedule panel when isOpen is true', async () => {
    render(
      <SchedulesPanel
        isOpen={true}
        onClose={vi.fn()}
        chats={[]}
        onShowToast={vi.fn()}
      />
    );

    expect(await screen.findByText('Task Scheduling')).toBeDefined();
    expect(screen.getByText('Create Schedule')).toBeDefined();
  });

  it('opens create task form modal when Create Schedule button is clicked', async () => {
    render(
      <SchedulesPanel
        isOpen={true}
        onClose={vi.fn()}
        chats={[]}
        onShowToast={vi.fn()}
      />
    );

    const createBtn = await screen.findByText('Create Schedule');
    fireEvent.click(createBtn);

    expect(screen.getByPlaceholderText('e.g. Daily Market Summary')).toBeDefined();
  });
});
