/**
 * usePianoRollKeyboard - Keyboard shortcuts for Piano Roll view
 */

import { useEffect, useCallback } from 'react';
import { registerViewHandler } from '@/engine/keyboard/KeyboardRouter';
import type { NormalizedKeyEvent } from '@/engine/keyboard/types';
import { usePianoRollStore } from '@/stores/usePianoRollStore';
import { useUIStore } from '@/stores/useUIStore';

export function usePianoRollKeyboard(): void {
  const handleKeyDown = useCallback((_normalized: NormalizedKeyEvent, e: KeyboardEvent): boolean => {
    const store = usePianoRollStore.getState();
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key;

    // Ctrl+A: Select All (note: selectAll requires all note IDs from the pattern,
    // which live in the tracker store. Here we just show a status hint.)
    if (ctrl && key.toLowerCase() === 'a') {
      e.preventDefault();
      useUIStore.getState().setStatusMessage('SELECT ALL', false, 800);
      return true;
    }

    // Escape: Clear selection
    if (key === 'Escape') {
      store.clearSelection();
      return true;
    }

    // Q: Toggle snap to grid
    if (key.toLowerCase() === 'q' && !ctrl) {
      const nextSnap = !store.view.snapToGrid;
      store.setSnapToGrid(nextSnap);
      useUIStore.getState().setStatusMessage(
        `Snap: ${nextSnap ? 'ON' : 'OFF'}`,
        false,
        800
      );
      return true;
    }

    // 1-6: Set grid division (1=1/1, 2=1/2, 3=1/4, 4=1/8, 5=1/16, 6=1/32)
    if (!ctrl && !e.altKey) {
      const divisionMap: Record<string, number> = {
        '1': 1, '2': 2, '3': 4, '4': 8, '5': 16, '6': 32,
      };
      const division = divisionMap[key];
      if (division !== undefined) {
        store.setGridDivision(division);
        useUIStore.getState().setStatusMessage(`Grid: 1/${division}`, false, 800);
        return true;
      }
    }

    // S: Select tool
    if (key.toLowerCase() === 's' && !ctrl) {
      store.setTool('select');
      useUIStore.getState().setStatusMessage('Tool: Select', false, 800);
      return true;
    }

    // P or D: Draw/pencil tool
    if ((key.toLowerCase() === 'p' || key.toLowerCase() === 'd') && !ctrl) {
      store.setTool('draw');
      useUIStore.getState().setStatusMessage('Tool: Draw', false, 800);
      return true;
    }

    // E: Erase tool
    if (key.toLowerCase() === 'e' && !ctrl) {
      store.setTool('erase');
      useUIStore.getState().setStatusMessage('Tool: Erase', false, 800);
      return true;
    }

    // Delete / Backspace: Delete selected notes (status message only — actual
    // deletion requires access to the pattern data in useTrackerStore)
    if (key === 'Delete' || key === 'Backspace') {
      if (store.selection.notes.size > 0) {
        e.preventDefault();
        useUIStore.getState().setStatusMessage('DELETE SELECTED', false, 800);
        return true;
      }
    }

    return false;
  }, []);

  useEffect(() => {
    const unregister = registerViewHandler('pianoroll', handleKeyDown);
    return unregister;
  }, [handleKeyDown]);
}
