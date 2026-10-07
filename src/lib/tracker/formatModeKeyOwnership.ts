/**
 * Format-mode key ownership — single source of truth for which edit keystrokes
 * the format-specific editor (Hively, Furnace, etc.) owns, so the classic
 * `useTrackerInput` window handler stays out of the way.
 *
 * Background: in a non-classic editor mode, `PatternEditorCanvas.handleFormatKeyDown`
 * (a React onKeyDown on the focused grid) handles undo/redo, transpose, and the
 * full clipboard set (copy/cut/paste/select-all, both Ctrl+key and F3/F4/F5)
 * against the format store. It calls `preventDefault` but neither `stopPropagation`
 * nor the `__handled` sentinel, so the same physical keypress still bubbles to the
 * window listener in `useTrackerInput`. That handler previously bailed only on
 * Ctrl+Z/Y and Ctrl+Arrow, so Ctrl+C/X/V (and Ctrl+A, F3/F4/F5) fell through to
 * the classic clipboard branches and mutated the *tracker* store as well — a
 * double edit (double paste / stray cut) on a single keypress.
 *
 * Centralising the decision here means the delegation boundary is defined once
 * and can be unit-tested without a DOM.
 */

import type { EditorMode } from '@/types/tracker';

/** Minimal, DOM-free view of a keydown event for the ownership decision. */
export interface FormatKeyDescriptor {
  /** `KeyboardEvent.key` verbatim (case preserved for the F-keys / arrows). */
  key: string;
  /** True when Ctrl or Meta (Cmd) is held. */
  ctrlOrMeta: boolean;
  shift: boolean;
  alt: boolean;
}

const FORMAT_CURSOR_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'PageUp', 'PageDown', 'Home', 'End',
  'Insert', 'Delete', 'Backspace',
]);

/**
 * True when, in the given editor mode, the format-specific handler owns this key
 * and `useTrackerInput` must delegate (return early) rather than run its classic
 * equivalent.
 *
 * Mirrors exactly the edit keys consumed by `handleFormatKeyDown`. Navigation,
 * octave, and note-entry keys are intentionally NOT included — they are not the
 * store-mutating clipboard/history operations that double-fire.
 */
export function formatModeOwnsEditKey(
  editorMode: string,
  e: FormatKeyDescriptor,
): boolean {
  if (editorMode === 'classic') return false;

  const key = e.key;
  const lower = key.toLowerCase();

  // Bare F3/F4/F5 = cut/copy/paste in the format editor.
  if (key === 'F3' || key === 'F4' || key === 'F5') return true;

  // A canvas-owned mode also owns the cursor keys: the format keyboard moves the ONE cursor (P14f), bounded by the
  // format's own channels and columns. The classic handler would move it against the tracker pattern's bounds.
  if (ENTRY_OWNER[editorMode as EditorMode] === 'canvas' && !e.ctrlOrMeta && !e.alt && FORMAT_CURSOR_KEYS.has(key)) return true;

  // Everything else the format handler owns is a Ctrl/Cmd chord without Alt.
  const chord = e.ctrlOrMeta && !e.alt;
  if (!chord) return false;

  // Undo / redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y). Y is a no-op in format mode but
  // is still owned so the classic redo does not fire underneath.
  if (lower === 'z' || lower === 'y') return true;

  // Transpose (Ctrl+Arrow up/down).
  if (key === 'ArrowUp' || key === 'ArrowDown') return true;

  // Clipboard + select-all. Copy is only owned without Shift (Ctrl+Shift+C is a
  // separate classic command the format handler does not consume).
  if (lower === 'c') return !e.shift;
  if (lower === 'x' || lower === 'v' || lower === 'a') return true;

  return false;
}

/**
 * Who writes a typed note / effect digit into the song, per editor mode (P14).
 *
 *   'window'  the view draws the tracker store, so the classic window handler (useTrackerInput) writes it
 *   'canvas'  the view draws the format's own native data, and PatternEditorCanvas.handleFormatKeyDown
 *             writes it through the view's onFormatCellChange; the window handler may only jam
 *   'none'    the view has no keyboard entry (a visualiser, or a grid edited by double click); typing only jams
 *
 * A Record over EditorMode: adding a mode without deciding who owns its keys is a type error. Before this,
 * the window handler wrote the tracker store in EVERY mode, so a Hively edit landed in a grid the Hively
 * view does not draw (owner 2026-10-07, amanda.ahx).
 */

export type EntryOwner = 'window' | 'canvas' | 'none';

export const ENTRY_OWNER: Record<EditorMode, EntryOwner> = {
  classic: 'window',
  furnace: 'window',
  suntronic: 'window',
  tfmx: 'window',
  hively: 'canvas',
  klystrack: 'canvas',
  jamcracker: 'canvas',
  sidfactory2: 'canvas',
  cheesecutter: 'canvas',
  musicline: 'canvas',
  goattracker: 'canvas',
  maxtrax: 'none',
  sc68: 'none',
};

/** True when the classic window handler may write the tracker store in this mode. */
export function windowHandlerWritesCells(editorMode: EditorMode): boolean {
  return ENTRY_OWNER[editorMode] === 'window';
}
