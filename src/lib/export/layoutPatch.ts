/**
 * The module of a format with a fixed cell layout and no exporter of its own: the loaded module with each edited grid cell's bytes
 * written where the layout says that cell lives (the in-place write the chip-RAM route and the engines' file-data routes make).
 *
 * One function for the three places that need it - the next play (editedModuleForPlay), Export (nativeExportRouter) and the
 * tests - so a layout format that reaches an engine reaches a file the same way. A cell the layout has no place for (-1: a row inside a
 * wait, past a track's end) is counted in `unplaced`, never written.
 */
import type { Pattern } from '@/types';
import type { UADEPatternLayout, UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { getCellFileOffset, encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
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
    const encoded = layout.encodeCell(cell, stored, channel);
    for (let i = 0; i < encoded.length; i++) if (buf[offset + i] !== encoded[i]) { buf[offset + i] = encoded[i]; patched++; }
  }
  return { bytes: buf, patched, unplaced };
}

/**
 * A format of variable-length packed blocks and no exporter that carries the edit: each block an edited cell belongs to is
 * re-encoded (the raw carrier when the block is unedited) and written over its slot, the bytes behind it zero-filled. A block that
 * no longer fits its slot is refused (`refused`), as growing a block needs the format's pointers moved, which only the format's
 * own exporter knows (G5). The one writer for the next play (editedModuleForPlay) and the live chip-RAM route (liveModuleEdits).
 */
export interface VariableLayoutPatchResult {
  bytes: Uint8Array;
  patched: number;
  refused: Array<{ pattern: number; channel: number; encoded: number; slot: number }>;
}

export function patchModuleByVariableLayout(source: ArrayBuffer | Uint8Array, layout: UADEVariablePatternLayout, patterns: readonly Pattern[]): VariableLayoutPatchResult {
  const buf = new Uint8Array(source instanceof Uint8Array ? source : new Uint8Array(source)).slice();
  const blocks = new Set<string>();
  for (const { pattern, channel } of editedCells(patterns)) blocks.add(`${pattern}:${channel}`);
  const refused: VariableLayoutPatchResult['refused'] = [];
  let patched = 0;
  for (const key of blocks) {
    const [pattern, channel] = key.split(':').map(Number);
    const fp = layout.trackMap[pattern]?.[channel];
    const addr = fp == null || fp < 0 ? undefined : layout.filePatternAddrs[fp];
    const size = fp == null || fp < 0 ? undefined : layout.filePatternSizes[fp];
    if (fp == null || addr == null || size == null || addr + size > buf.length) continue;
    const encoded = encodeVariableBlock(layout, fp, patterns[pattern].channels[channel].rows, channel);
    if (encoded.length > size) {
      refused.push({ pattern, channel, encoded: encoded.length, slot: size });
      continue;
    }
    const padded = new Uint8Array(size);
    padded.set(encoded);
    for (let i = 0; i < size; i++) if (buf[addr + i] !== padded[i]) { buf[addr + i] = padded[i]; patched++; }
  }
  return { bytes: buf, patched, refused };
}
