/**
 * useArrangementKeyboard - Keyboard shortcuts for Arrangement view
 */

import { useEffect, useCallback } from 'react';
import { registerViewHandler } from '@/engine/keyboard/KeyboardRouter';
import type { NormalizedKeyEvent } from '@/engine/keyboard/types';
import { useArrangementStore } from '@/stores/useArrangementStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useUIStore } from '@/stores/useUIStore';

export function useArrangementKeyboard(): void {
  const handleKeyDown = useCallback((_normalized: NormalizedKeyEvent, e: KeyboardEvent): boolean => {
    const { selectedClipIds, removeClips, duplicateClips, moveClips, setTool, undo, redo } =
      useArrangementStore.getState();
    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    // Delete / Backspace: remove selected clips
    if ((key === 'Delete' || key === 'Backspace') && selectedClipIds.size > 0) {
      e.preventDefault();
      removeClips([...selectedClipIds]);
      return true;
    }

    // Ctrl+D: Duplicate selected clips
    if (ctrl && key.toLowerCase() === 'd' && selectedClipIds.size > 0) {
      e.preventDefault();
      duplicateClips([...selectedClipIds]);
      return true;
    }

    // Ctrl+Z: Undo
    if (ctrl && key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return true;
    }

    // Ctrl+Shift+Z or Ctrl+Y: Redo
    if ((ctrl && e.shiftKey && key.toLowerCase() === 'z') || (ctrl && key.toLowerCase() === 'y')) {
      e.preventDefault();
      redo();
      return true;
    }

    // Arrow keys: nudge selected clips by 1 row / 1 track
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && selectedClipIds.size > 0) {
      e.preventDefault();
      const delta = key === 'ArrowLeft' ? -1 : 1;
      moveClips([...selectedClipIds], delta, 0);
      return true;
    }

    if ((key === 'ArrowUp' || key === 'ArrowDown') && selectedClipIds.size > 0) {
      e.preventDefault();
      const delta = key === 'ArrowUp' ? -1 : 1;
      moveClips([...selectedClipIds], 0, delta);
      return true;
    }

    // S: Select tool
    if (key.toLowerCase() === 's' && !ctrl) {
      setTool('select');
      useUIStore.getState().setStatusMessage('Tool: Select', false, 800);
      return true;
    }

    // P: Pencil/Draw tool
    if (key.toLowerCase() === 'p' && !ctrl) {
      setTool('draw');
      useUIStore.getState().setStatusMessage('Tool: Draw', false, 800);
      return true;
    }

    // E: Erase tool
    if (key.toLowerCase() === 'e' && !ctrl) {
      setTool('erase');
      useUIStore.getState().setStatusMessage('Tool: Erase', false, 800);
      return true;
    }

    // Space: Play/Stop (defer to transport)
    if (key === ' ') {
      e.preventDefault();
      const transport = useTransportStore.getState();
      if (transport.isPlaying) {
        transport.stop();
      } else {
        void transport.play();
      }
      return true;
    }

    return false;
  }, []);

  useEffect(() => {
    const unregister = registerViewHandler('arrangement', handleKeyDown);
    return unregister;
  }, [handleKeyDown]);
}
