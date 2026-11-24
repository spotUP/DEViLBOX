/**
 * The GoatTracker key map as data: feeds the "?" help sheet and tooltip text.
 * GTKeyboardHandler.ts still dispatches by if-chain; when a binding changes there, change it here too.
 */
export interface GTKeyBinding { keys: string; action: string }
export interface GTKeyGroup { title: string; bindings: GTKeyBinding[] }

export const GT_KEY_GROUPS: GTKeyGroup[] = [
  { title: 'Playback', bindings: [
    { keys: 'Space', action: 'Play or stop' },
    { keys: 'F1', action: 'Play from the start' },
    { keys: 'F2', action: 'Play from the cursor' },
    { keys: 'F3', action: 'Stop' },
  ] },
  { title: 'Editing mode', bindings: [
    { keys: 'Escape', action: 'Toggle Record: on writes into the pattern, off only jams notes' },
    { keys: 'Z to M, Q to P', action: 'Play and enter notes (note column)' },
    { keys: '0 to 9, A to F', action: 'Enter hex digits (instrument, command, data columns)' },
    { keys: 'F9 / F10', action: 'Octave down / up' },
    { keys: 'Shift+Z', action: 'Cycle auto-advance after entry: note, all, off' },
    { keys: 'F5 / F6 / F7 / F8', action: 'Edit step 0 / 1 / 2 / 4 rows' },
    { keys: '+ / -', action: 'Next / previous instrument' },
  ] },
  { title: 'Moving', bindings: [
    { keys: 'Arrow keys', action: 'Move the cursor' },
    { keys: 'Page Up / Page Down', action: 'Move 16 rows' },
    { keys: 'Home / End', action: 'First / last row' },
    { keys: 'Tab / Shift+Tab', action: 'Next / previous channel' },
  ] },
  { title: 'Pattern', bindings: [
    { keys: 'Delete', action: 'Clear the cell' },
    { keys: 'Insert / Backspace', action: 'Insert / delete a row' },
    { keys: 'Shift+Arrows', action: 'Extend the block selection' },
    { keys: 'Ctrl+C / Ctrl+V / Ctrl+X', action: 'Copy / paste / cut the block' },
    { keys: 'Ctrl+Z / Ctrl+Y', action: 'Undo / redo' },
    { keys: 'Ctrl+I', action: 'Interpolate the selection' },
    { keys: 'Ctrl+Shift+Up / Down', action: 'Transpose up / down' },
    { keys: 'Shift+O / Shift+P', action: 'Shrink / expand the pattern length' },
  ] },
  { title: 'Instruments and orders', bindings: [
    { keys: 'Shift+C / Shift+V / Shift+S', action: 'Copy / paste / swap instrument' },
    { keys: 'Shift+F5 / Shift+F6', action: 'Copy / paste order list entry' },
  ] },
  { title: 'Help', bindings: [
    { keys: '?', action: 'Show this sheet' },
  ] },
];

/** Tooltip text: "Label (Key)". */
export function withKey(label: string, keys: string): string {
  return `${label} (${keys})`;
}
