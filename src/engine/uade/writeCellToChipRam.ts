/**
 * writeCellToChipRam — single source of truth for writing one edited pattern
 * cell into the live UADE playback state.
 *
 * Historically this dance (lazy-import UADEChipEditor + UADEEngine, check
 * `hasInstance()`, `new UADEChipEditor(...)`, `patchPatternCell(...)`) was
 * copy-pasted at three sites in useTrackerStore, plus a fourth divergent path
 * that patched the TFMX `tfmxFileData` buffer directly. This helper unifies all
 * of them.
 *
 * Two independent write targets, each guarded on its own precondition (a given
 * song only satisfies one at playback time — UADE-chip formats run inside the
 * UADE engine, TFMX runs its own WASM engine, so their guards are mutually
 * exclusive in practice):
 *
 *   1. Fixed-length chip-RAM layout (`song.uadePatternLayout`): the 68k replayer
 *      runs inside UADE and reads pattern data from emulated chip RAM, so the
 *      edit is poked straight into chip RAM via `UADEChipEditor.patchPatternCell`.
 *   2. TFMX direct-write (`song.tfmxFileData` + `song.uadePatternLayout`): the
 *      TFMX WASM engine reads its module bytes from `tfmxFileData`, so the
 *      re-encoded cell is written into that buffer in place.
 *
 * Variable-length layouts (`song.uadeVariableLayout`) are re-encoded per channel
 * via `UADEChipEditor.rewriteVariablePattern`, not per cell, so they are not a
 * concern of this per-cell helper.
 *
 * Safe no-op when no layout/engine is present (matches the previous guard
 * behavior). Fire-and-forget: callers do not await the returned promise.
 */

import type { TrackerSong } from '../TrackerReplayer';
import type { TrackerCell } from '@/types';
import { UADEChipEditor } from './UADEChipEditor';
import { UADEEngine } from './UADEEngine';
import { getCellFileOffset } from './UADEPatternEncoder';

export async function writeCellToChipRam(
  song: TrackerSong | null | undefined,
  patternIdx: number,
  row: number,
  channel: number,
  cell: TrackerCell,
): Promise<void> {
  if (!song) return;
  const layout = song.uadePatternLayout;

  // 1. Fixed-length chip-RAM layout → patch chip RAM via the live UADE engine.
  if (layout) {
    try {
      if (UADEEngine.hasInstance()) {
        const editor = new UADEChipEditor(UADEEngine.getInstance());
        await editor.patchPatternCell(layout, patternIdx, row, channel, cell);
      }
    } catch { /* UADE not active */ }
  }

  // 2. TFMX direct-write into the tfmxFileData buffer (WASM playback path).
  if (song.tfmxFileData && layout) {
    try {
      const offset = getCellFileOffset(layout, patternIdx, row, channel);
      if (offset >= 0) {
        const encoded = layout.encodeCell(cell);
        const buf = new Uint8Array(song.tfmxFileData);
        for (let i = 0; i < encoded.length && offset + i < buf.length; i++) {
          buf[offset + i] = encoded[i];
        }
      }
    } catch { /* TFMX not active */ }
  }
}
