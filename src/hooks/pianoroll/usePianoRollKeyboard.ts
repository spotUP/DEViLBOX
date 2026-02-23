/**
 * usePianoRollKeyboard - Keyboard shortcuts for Piano Roll view
 */

import { useEffect, useCallback } from 'react';
import { registerViewHandler } from '@/engine/keyboard/KeyboardRouter';
import type { NormalizedKeyEvent } from '@/engine/keyboard/types';

export function usePianoRollKeyboard(): void {
  const handleKeyDown = useCallback((_normalized: NormalizedKeyEvent, _originalEvent: KeyboardEvent): boolean => {
    // TODO: Implement piano roll-specific keyboard shortcuts
    // - Note entry (QWERTY keyboard piano)
    // - Grid navigation
    // - Selection tools
    // - Quantization shortcuts
    // - etc.
    
    return false; // Not handled yet
  }, []);

  useEffect(() => {
    const unregister = registerViewHandler('pianoroll', handleKeyDown);
    return unregister;
  }, [handleKeyDown]);
}
