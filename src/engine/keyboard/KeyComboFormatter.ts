import { NormalizedKeyEvent } from './types';

/**
 * KeyComboFormatter - Converts keyboard events to standardized combo strings
 *
 * Formats normalized keyboard events into strings like:
 * - "Ctrl+C"
 * - "Alt+F5"
 * - "Ctrl+Alt+Delete"
 *
 * Supports Mac-style "Cmd" vs "Ctrl" via preferCmd parameter.
 */
export class KeyComboFormatter {
  /**
   * Format a normalized keyboard event into a combo string
   * @param event - Normalized keyboard event
   * @param preferCmd - Use "Cmd" instead of "Ctrl" on Mac (when event.meta is true)
   * @returns Formatted combo string (e.g., "Ctrl+Alt+C")
   */
  static format(event: NormalizedKeyEvent, preferCmd = false): string {
    const parts: string[] = [];

    // Add modifiers in consistent order: Ctrl → Alt → Shift
    if (event.ctrl) {
      parts.push(preferCmd && event.meta ? 'Cmd' : 'Ctrl');
    }
    if (event.alt) {
      parts.push('Alt');
    }
    if (event.shift) {
      parts.push('Shift');
    }

    // Add main key (uppercase for letters, preserve special keys)
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    parts.push(key);

    return parts.join('+');
  }
}
