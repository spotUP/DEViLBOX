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
 *   2. Ron Klaren (`song.ronKlarenFileData` + `song.uadePatternLayout`): the
 *      Ron Klaren WASM replayer gets the note through rk_set_cell, addressed by
 *      the same file offset the chip-RAM write uses.
 *   3. TFMX direct-write (`song.tfmxFileData` + `song.uadePatternLayout`): the
 *      TFMX WASM engine reads its module bytes from `tfmxFileData`, so the
 *      re-encoded cell is written into that buffer in place.
 *   4. Eagleplayer runner (`song.eaglePlayerFileData` + `song.uadePatternLayout`):
 *      the format's own player runs on EaglePlayerEngine and reads its song
 *      data from the module in its chip RAM, so the re-encoded cell goes
 *      into that module (EaglePlayerEngine.writeModule) and into the song's
 *      copy of it (the next load and the export play the edit). Such a song
 *      is not in UADE, so the UADE chip-RAM write (1) is skipped for it - it
 *      would land in whatever song UADE last held.
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
import { ronKlarenNoteIndex } from './encoders/RonKlarenEncoder';

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
  if (layout && !song.eaglePlayerFileData) {
    try {
      if (UADEEngine.hasInstance()) {
        const editor = new UADEChipEditor(UADEEngine.getInstance());
        await editor.patchPatternCell(layout, patternIdx, row, channel, cell);
      }
    } catch { /* UADE not active */ }
  }

  // 2. Ron Klaren WASM replayer: the note of the track command the cell maps
  //    to. The replayer keeps the command's wait byte (the row's duration the
  //    grid derives its rows from) and removes the position's transpose.
  if (song.ronKlarenFileData && layout) {
    const offset = getCellFileOffset(layout, patternIdx, row, channel);
    const note = ronKlarenNoteIndex(cell.note ?? 0);
    if (offset >= 0 && note >= 0) {
      try {
        const { RonKlarenEngine } = await import('../ronklaren/RonKlarenEngine');
        if (RonKlarenEngine.hasInstance()) RonKlarenEngine.getInstance().setCell(patternIdx, channel, offset, note);
      } catch { /* Ron Klaren not active */ }
    }
  }

  // 3. TFMX direct-write into the tfmxFileData buffer (WASM playback path).
  if (song.tfmxFileData && layout) {
    try {
      const offset = getCellFileOffset(layout, patternIdx, row, channel);
      if (offset >= 0) {
        const buf = new Uint8Array(song.tfmxFileData);
        const stored = layout.encodeOverStored ? buf.slice(offset, offset + layout.bytesPerCell) : undefined;
        const encoded = layout.encodeCell(cell, stored);
        for (let i = 0; i < encoded.length && offset + i < buf.length; i++) {
          buf[offset + i] = encoded[i];
        }
      }
    } catch { /* TFMX not active */ }
  }

  // 4. Eagleplayer runner: the module the player is playing, and the song's copy.
  if (song.eaglePlayerFileData && layout) {
    const offset = getCellFileOffset(layout, patternIdx, row, channel);
    const buf = new Uint8Array(song.eaglePlayerFileData);
    if (offset >= 0 && offset + layout.bytesPerCell <= buf.length) {
      const stored = layout.encodeOverStored ? buf.slice(offset, offset + layout.bytesPerCell) : undefined;
      const encoded = layout.encodeCell(cell, stored);
      buf.set(encoded, offset);
      try {
        const { EaglePlayerEngine } = await import('../eagleplayer/EaglePlayerEngine');
        if (EaglePlayerEngine.hasInstance()) EaglePlayerEngine.getInstance().writeModule(offset, encoded);
      } catch { /* EaglePlayer not active */ }
    }
  }
}
