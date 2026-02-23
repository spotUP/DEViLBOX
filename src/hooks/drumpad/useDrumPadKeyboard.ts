/**
 * useDrumPadKeyboard - Keyboard shortcuts for DrumPad view
 */

import { useEffect, useCallback } from 'react';
import { registerViewHandler } from '@/engine/keyboard/KeyboardRouter';
import type { NormalizedKeyEvent } from '@/engine/keyboard/types';

export function useDrumPadKeyboard(): void {
  const handleKeyDown = useCallback((_normalized: NormalizedKeyEvent, _originalEvent: KeyboardEvent): boolean => {
    // TODO: Implement drum pad-specific keyboard shortcuts
    // - QWERTY pad triggering
    // - Bank switching
    // - Velocity controls
    // - etc.
    
    return false; // Not handled yet
  }, []);

  useEffect(() => {
    const unregister = registerViewHandler('drumpad', handleKeyDown);
    return unregister;
  }, [handleKeyDown]);
}
