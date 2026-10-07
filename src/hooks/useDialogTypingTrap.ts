/**
 * Keys typed in an open dialog belong to the dialog. Spread the returned props
 * on the dialog's overlay element:
 *
 *  - data-captures-typing: the shared marker (lib/keyboard/isTextEntryTarget),
 *    so note entry, global shortcuts and the keyboard router ignore every key
 *    whose target is inside the dialog, wherever their listeners sit;
 *  - onKeyDown/onKeyUp stop the native event from reaching window and document
 *    bubble listeners (undo, drum pads, ...). React handlers inside the dialog
 *    still run (React dispatches from the root, before this stop takes effect),
 *    and Escape-to-close is a document capture listener, so it still fires;
 *  - onKey: the dialog's own type-ahead or shortcuts, called before the stop;
 *  - focus moves into the dialog when it appears, so a key pressed right after
 *    opening has a target inside it instead of the tracker behind.
 */
import { useCallback } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export function useDialogTypingTrap<T extends HTMLElement = HTMLDivElement>(onKey?: (e: KeyboardEvent) => void) {
  const ref = useCallback((el: T | null) => {
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, []);
  return {
    ref,
    tabIndex: -1,
    'data-captures-typing': '',
    onKeyDown: (e: ReactKeyboardEvent) => { onKey?.(e.nativeEvent); e.nativeEvent.stopPropagation(); },
    onKeyUp: (e: ReactKeyboardEvent) => { e.nativeEvent.stopPropagation(); },
  } as const;
}
