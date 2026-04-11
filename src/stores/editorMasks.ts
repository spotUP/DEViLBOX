/**
 * Editor Mask Constants — shared bitmask flags for copy/paste/transpose ops.
 *
 * Lives in its own leaf module (no other imports) so both useEditorStore and
 * useTrackerStore (and the clipboard actions) can pull the constants without
 * creating an import cycle. Re-exporting them from useEditorStore used to hit
 * a TDZ when Rollup entered the store cycle through a sibling module, because
 * the namespace object for useTrackerStore was frozen before useEditorStore's
 * const declarations had evaluated.
 */

// FT2-style bitwise mask system for copy/paste/transpose operations
export const MASK_NOTE = 1 << 0;       // 0b00001
export const MASK_INSTRUMENT = 1 << 1; // 0b00010
export const MASK_VOLUME = 1 << 2;     // 0b00100
export const MASK_EFFECT = 1 << 3;     // 0b01000
export const MASK_EFFECT2 = 1 << 4;    // 0b10000
export const MASK_ALL = 0b11111;       // All columns
