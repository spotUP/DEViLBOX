/**
 * The module of a format with a fixed cell layout and no exporter of its own: the loaded module with each edited grid cell's bytes
 * written where the layout says that cell lives (the in-place write the chip-RAM route and the engines' file-data routes make).
 *
 * One function for the three places that need it - the next play (editedModuleForPlay), Export (nativeExportRouter) and the
 * tests - so a layout format that reaches an engine reaches a file the same way. A cell the layout has no place for (-1: a row inside a
 * wait, past a track's end) is counted in `unplaced`, never written.
 */
import type { Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { editedCells } from '@/lib/song/gridBaseline';

export interface LayoutPatchResult {
  bytes: Uint8Array;
  /** Bytes that changed. */
  patched: number;
  /** Edited cells with a note that the layout has no place for. */
  unplaced: Array<{ pattern: number; row: number; channel: number }>;
}

export function patchModuleByLayout(source: ArrayBuffer | Uint8Array, layout: UADEPatternLayout, patterns: readonly Pattern[]): LayoutPatchResult {
  const buf = new Uint8Array(source instanceof Uint8Array ? source : new Uint8Array(source)).slice();
  const unplaced: LayoutPatchResult['unplaced'] = [];
  let patched = 0;
  for (const { pattern, row, channel, cell } of editedCells(patterns)) {
    const offset = getCellFileOffset(layout, pattern, row, channel);
    if (offset < 0 || offset + layout.bytesPerCell > buf.length) {
      if ((cell.note ?? 0) > 0) unplaced.push({ pattern, row, channel });
      continue;
    }
    const stored = layout.encodeOverStored ? buf.slice(offset, offset + layout.bytesPerCell) : undefined;
    const encoded = layout.encodeCell(cell, stored);
    for (let i = 0; i < encoded.length; i++) if (buf[offset + i] !== encoded[i]) { buf[offset + i] = encoded[i]; patched++; }
  }
  return { bytes: buf, patched, unplaced };
}
