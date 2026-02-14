import type { NormalizedKeyEvent } from './types';

/**
 * KeyComboFormatter - Converts keyboard events to standardized combo strings
 *
 * Formats normalized keyboard events into strings like:
 * - "Ctrl+C"
 * - "Alt+F5"
 * - "Ctrl+Shift+Delete"
 *
 * Used to match key events against keyboard scheme mappings.
 */
export class KeyComboFormatter {
  private static readonly KEY_NAMES: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': 'ArrowUp',
    'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft',
    'ArrowRight': 'ArrowRight',
    'Enter': 'Enter',
    'Escape': 'Escape',
    'Tab': 'Tab',
    'Backspace': 'Backspace',
    'Delete': 'Delete',
    'Insert': 'Insert',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PageUp',
    'PageDown': 'PageDown',
  };

  /**
   * Format a normalized keyboard event into a combo string
   * @param event - Normalized keyboard event
   * @returns Formatted combo string (e.g., "Ctrl+Shift+C")
   */
  static format(event: NormalizedKeyEvent): string {
    const parts: string[] = [];

    // Add modifiers in consistent order
    if (event.ctrl) parts.push('Ctrl');
    if (event.shift) parts.push('Shift');
    if (event.alt) parts.push('Alt');

    // Normalize and add key
    const key = this.KEY_NAMES[event.key] || event.key.toUpperCase();
    parts.push(key);

    return parts.join('+');
  }
}
