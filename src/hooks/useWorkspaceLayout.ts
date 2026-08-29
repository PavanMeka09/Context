import { useState, useEffect } from 'react';
import { Storage } from '../utils/storage';

export type WorkspaceTab = 'browser' | 'schedules' | 'artifacts';

export interface ArtifactData {
  language: string;
  code: string;
  title?: string;
}

export function useWorkspaceLayout() {
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(() => Storage.getWorkspaceOpen());
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(() => Storage.getWorkspaceTab());
  const [workspaceWidth, setWorkspaceWidth] = useState(() => Storage.getWorkspaceWidth());
  const [isResizingWorkspace, setIsResizingWorkspace] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactData | null>(null);

  const toggleWorkspace = (open?: boolean) => {
    const nextState = open !== undefined ? open : !isWorkspaceOpen;
    setIsWorkspaceOpen(nextState);
    Storage.saveWorkspaceOpen(nextState);
  };

  const changeWorkspaceTab = (tab: WorkspaceTab) => {
    setWorkspaceTab(tab);
    Storage.saveWorkspaceTab(tab);
  };

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingWorkspace(true);
  };

  const handleTouchStartResize = () => {
    setIsResizingWorkspace(true);
  };

  const adjustWorkspaceWidth = (delta: number) => {
    setWorkspaceWidth(prev => {
      const minWidth = Math.max(320, Math.floor(window.innerWidth * 0.25));
      const maxWidth = Math.floor(window.innerWidth * 0.7);
      const clamped = Math.min(Math.max(prev + delta, minWidth), maxWidth);
      Storage.saveWorkspaceWidth(clamped);
      return clamped;
    });
  };

  useEffect(() => {
    const handleOpenArtifact = (e: Event) => {
      const customEvent = e as CustomEvent<ArtifactData>;
      if (customEvent.detail) {
        setSelectedArtifact(customEvent.detail);
        setWorkspaceTab('artifacts');
        setIsWorkspaceOpen(true);
        Storage.saveWorkspaceOpen(true);
        Storage.saveWorkspaceTab('artifacts');
      }
    };
    window.addEventListener('open-artifact-inspector', handleOpenArtifact);
    return () => window.removeEventListener('open-artifact-inspector', handleOpenArtifact);
  }, []);

  useEffect(() => {
    if (!isResizingWorkspace) return;

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const minWidth = Math.max(320, Math.floor(window.innerWidth * 0.25));
      const maxWidth = Math.floor(window.innerWidth * 0.7);
      const clamped = Math.min(Math.max(newWidth, minWidth), maxWidth);
      setWorkspaceWidth(clamped);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const newWidth = window.innerWidth - e.touches[0].clientX;
        const minWidth = Math.max(320, Math.floor(window.innerWidth * 0.25));
        const maxWidth = Math.floor(window.innerWidth * 0.7);
        const clamped = Math.min(Math.max(newWidth, minWidth), maxWidth);
        setWorkspaceWidth(clamped);
      }
    };

    const handleEnd = () => {
      setIsResizingWorkspace(false);
      setWorkspaceWidth(w => {
        Storage.saveWorkspaceWidth(w);
        return w;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);

    return () => {
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [isResizingWorkspace]);

  return {
    isWorkspaceOpen,
    setIsWorkspaceOpen,
    toggleWorkspace,
    workspaceTab,
    setWorkspaceTab,
    changeWorkspaceTab,
    workspaceWidth,
    isResizingWorkspace,
    selectedArtifact,
    setSelectedArtifact,
    handleMouseDownResize,
    handleTouchStartResize,
    adjustWorkspaceWidth
  };
}
