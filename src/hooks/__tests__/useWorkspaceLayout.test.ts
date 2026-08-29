import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceLayout } from '../useWorkspaceLayout';
import { Storage } from '../../utils/storage';

describe('useWorkspaceLayout Hook', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default workspace state', () => {
    const { result } = renderHook(() => useWorkspaceLayout());

    expect(typeof result.current.isWorkspaceOpen).toBe('boolean');
    expect(['browser', 'schedules']).toContain(result.current.workspaceTab);
    expect(result.current.workspaceWidth).toBeGreaterThan(0);
    expect(result.current.isResizingWorkspace).toBe(false);
  });

  it('toggles workspace open state', () => {
    const { result } = renderHook(() => useWorkspaceLayout());

    act(() => {
      result.current.toggleWorkspace(true);
    });
    expect(result.current.isWorkspaceOpen).toBe(true);
    expect(Storage.getWorkspaceOpen()).toBe(true);

    act(() => {
      result.current.toggleWorkspace(false);
    });
    expect(result.current.isWorkspaceOpen).toBe(false);
    expect(Storage.getWorkspaceOpen()).toBe(false);
  });

  it('changes workspace tab', () => {
    const { result } = renderHook(() => useWorkspaceLayout());

    act(() => {
      result.current.changeWorkspaceTab('schedules');
    });
    expect(result.current.workspaceTab).toBe('schedules');
    expect(Storage.getWorkspaceTab()).toBe('schedules');

    act(() => {
      result.current.changeWorkspaceTab('browser');
    });
    expect(result.current.workspaceTab).toBe('browser');
    expect(Storage.getWorkspaceTab()).toBe('browser');
  });

  it('adjusts workspace width via keyboard helper adjustWorkspaceWidth', () => {
    const { result } = renderHook(() => useWorkspaceLayout());
    const initialWidth = result.current.workspaceWidth;

    act(() => {
      result.current.adjustWorkspaceWidth(50);
    });
    expect(result.current.workspaceWidth).toBeGreaterThanOrEqual(initialWidth);

    act(() => {
      result.current.adjustWorkspaceWidth(-50);
    });
    expect(result.current.workspaceWidth).toBeGreaterThanOrEqual(320);
  });

  it('handles mouse resize start and finish events', () => {
    const { result } = renderHook(() => useWorkspaceLayout());

    act(() => {
      result.current.handleMouseDownResize({ preventDefault: vi.fn() } as unknown as React.MouseEvent);
    });
    expect(result.current.isResizingWorkspace).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
    });

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(result.current.isResizingWorkspace).toBe(false);
  });
});
