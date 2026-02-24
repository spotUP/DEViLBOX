/**
 * Global keys that work in ALL views regardless of activeView.
 * These are transport, navigation, and system-level shortcuts.
 */

import type { NormalizedKeyEvent } from './types';

/**
 * View type matching useUIStore.activeView
 */
export type ViewType = 'tracker' | 'arrangement' | 'dj' | 'drumpad' | 'pianoroll' | 'vj';

/**
 * Keys that should work globally across all views.
 * Format: 'key' or 'Ctrl+key' or 'Shift+key' etc.
 */
export const GLOBAL_KEY_COMBOS = new Set([
  // Transport
  'Space',
  'F5',           // Play from start
  'F6',           // Play from pattern
  'F7',           // Play from row
  'F8',           // Stop
  'Ctrl+Space',   // Play/stop toggle
  'Shift+Space',  // Record toggle
  
  // Navigation
  'Tab',          // Next channel/section
  'Shift+Tab',    // Previous channel/section
  'Escape',       // Cancel/close dialog
  
  // Pattern queue (1-9)
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  
  // System shortcuts
  'Ctrl+S',       // Save
  'Ctrl+Z',       // Undo
  'Ctrl+Y',       // Redo
  'Ctrl+Shift+Z', // Redo (Mac style)
  'Meta+S',       // Save (Mac)
  'Meta+Z',       // Undo (Mac)
  'Meta+Y',       // Redo (Mac)
  'Meta+Shift+Z', // Redo (Mac)
  
  // Function keys (global navigation/help)
  'F1',           // Help
  'F2',           // Rename
  'F3',           // Sample editor
  'F4',           // Instrument editor
  'F9',           // Order list
  'F10',          // Toggle fullscreen / menu
  'F11',          // Toggle fullscreen
  'F12',          // Dev tools (browser)
  
  // View switching
  'Ctrl+Shift+D', // Toggle DJ view
  'Ctrl+Shift+V', // Toggle VJ view
  'Ctrl+Shift+T', // Toggle tracker view
  'Ctrl+Shift+A', // Toggle arrangement view
]);

/**
 * Convert a NormalizedKeyEvent to a combo string for matching.
 */
export function eventToComboString(e: NormalizedKeyEvent): string {
  const parts: string[] = [];
  
  // Use Meta for Mac, Ctrl for PC (but include both for cross-platform)
  if (e.ctrl) parts.push('Ctrl');
  if (e.meta) parts.push('Meta');
  if (e.alt) parts.push('Alt');
  if (e.shift) parts.push('Shift');
  
  // Normalize key name
  let key = e.key;
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toUpperCase();
  
  parts.push(key);
  return parts.join('+');
}

/**
 * Check if a key event matches a global key combo.
 * Handles Mac/PC differences by checking both Ctrl and Meta variants.
 */
export function isGlobalKey(e: NormalizedKeyEvent): boolean {
  const combo = eventToComboString(e);
  
  if (GLOBAL_KEY_COMBOS.has(combo)) {
    return true;
  }
  
  // Also check cross-platform equivalent (Ctrl <-> Meta)
  if (e.ctrl && !e.meta) {
    const metaCombo = combo.replace('Ctrl+', 'Meta+');
    if (GLOBAL_KEY_COMBOS.has(metaCombo)) return true;
  }
  if (e.meta && !e.ctrl) {
    const ctrlCombo = combo.replace('Meta+', 'Ctrl+');
    if (GLOBAL_KEY_COMBOS.has(ctrlCombo)) return true;
  }
  
  return false;
}
