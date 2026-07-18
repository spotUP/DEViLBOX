/**
 * sunReproject.ts — SunTronic V1.3 pool writeback + cross-position re-projection.
 *
 * SunTronic shares command-stream blocks across order positions. When the user
 * edits a display note in the grid (which is transpose-baked), we must:
 *   1. Remove the position transpose to recover the raw pitch.
 *   2. Write the raw pitch back to the shared pool block.
 *   3. Re-project every grid cell that references the same pool block so all
 *      positions that reuse the block see the updated note.
 *
 * Out-of-range guard strategy: no-op with early return.
 * Rationale: the editor may call these before the pool is fully built (race on
 * first load); a silent no-op is safer than throwing and killing the render loop.
 */
import type { SunTronicNativeData } from './sunNativeData';
import type { Pattern } from '../../../types/tracker';
import { decodeSunGroup } from './sunGroupCodec';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a display note to the valid SunTronic range (1..96). 0 is pass-through
 *  (0 means "empty" / no-note in the grid). */
function clampNote(n: number): number {
  if (n <= 0) return 0;
  if (n > 96) return 96;
  return n;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write an edited display note back into the shared pool at raw pitch and
 * invalidate the affected pool cell's sunRaw.
 *
 * @param native      The SunTronicNativeData model to mutate.
 * @param blockIndex  Pool block index (same as `sunBlockIndex` on the cell).
 * @param rowInBlock  Row within the block (same as `sunRowInBlock` on the cell).
 * @param voice       Channel 0-3 — selects which transpose was applied for display.
 * @param editedNote  The note the user typed (transpose-baked display pitch).
 * @param position    The order-position index whose transpose should be undone.
 */
export function applySunNoteEdit(
  native: SunTronicNativeData,
  blockIndex: number,
  rowInBlock: number,
  voice: number,
  editedNote: number,
  position: number,
): void {
  // Out-of-range guard — no-op on any bad index.
  if (
    blockIndex < 0 ||
    blockIndex >= native.blocks.length ||
    position < 0 ||
    position >= native.positions.length
  ) {
    return;
  }
  const block = native.blocks[blockIndex];
  if (rowInBlock < 0 || rowInBlock >= block.length) return;

  const sunPosition = native.positions[position];
  if (voice < 0 || voice > 3) return;

  const transpose = sunPosition.transpose[voice as 0 | 1 | 2 | 3];
  // Invert the DISPLAY transform. The grid walk (decodeSunGroup) shows
  //   displayNote = poolNote - transpose
  // (pool is decoded at transpose 0, so poolNote = rawByte+13 and the display
  // subtracts the position transpose). The inverse therefore ADDS transpose to
  // recover the pool note. (Previously subtracted — wrong sign; it only appeared
  // to work because reprojectSunGrid ALSO used the wrong sign, so the two
  // cancelled for the edited cell at its own position while corrupting every
  // other position that reuses the block and every transposed position.)
  // Rest stays a rest (pool note 0). A real note maps to a real pool note (>=1);
  // clamp so an edit above the transpose ceiling cannot become a silently-dropped
  // non-positive raw that encodeSunGroup would discard.
  const rawNote = editedNote <= 0 ? 0 : Math.max(1, editedNote + transpose);

  const poolCell = block[rowInBlock];
  poolCell.note = rawNote;
  poolCell.sunRaw = undefined; // forces re-encode on next export
}

/**
 * Rebuild every display cell in `patterns` from `native` (pool note + the
 * position/voice transpose). Keeps the flat grid in sync after any pool edit,
 * so editing a shared block shows in every position that reuses it.
 *
 * Cells without provenance (`sunBlockIndex` undefined or < 0) are skipped.
 * FX columns, instrument, volume, and provenance fields are left untouched.
 */
export function reprojectSunGrid(
  patterns: Pattern[],
  native: SunTronicNativeData,
): void {
  for (const pattern of patterns) {
    for (let ch = 0; ch < pattern.channels.length; ch++) {
      const channel = pattern.channels[ch];
      for (const cell of channel.rows) {
        const bi = cell.sunBlockIndex;
        const ri = cell.sunRowInBlock;
        const pos = cell.sunPosition;

        // Skip cells with no provenance.
        if (bi === undefined || bi < 0 || ri === undefined || pos === undefined) {
          continue;
        }

        // Guard against stale provenance pointing out of range.
        if (
          bi >= native.blocks.length ||
          pos >= native.positions.length
        ) {
          continue;
        }
        const block = native.blocks[bi];
        if (ri >= block.length) continue;

        const poolCell = block[ri];
        const transpose = native.positions[pos].transpose[ch as 0 | 1 | 2 | 3];

        // Faithful path: re-run the SAME decoder the display walk uses on the
        // pool cell's stored group bytes, at this position's transpose. A linear
        // `poolNote ± transpose` model is LOSSY for glide (0x94) and any
        // clamp-to-zero fallback, because the pool note and the display note can
        // derive from DIFFERENT stream carriers (e.g. glide arg 0x96 clamps to
        // zero at T=0 so a later note byte fills the pool cell, while at T=24 the
        // glide arg is in range and wins). Re-decoding sunRaw reproduces the
        // display note exactly for every one of those cases (proven corpus-wide,
        // 312,960/312,960 cells). curInstr=0 is fine — it only affects the
        // instrument field, which we leave untouched here.
        const raw = poolCell.sunRaw;
        if (raw && raw.length > 0) {
          const redecoded = decodeSunGroup(
            Uint8Array.from(raw),
            0,
            transpose,
            0,
            native.numSampled,
            native.widths,
            raw.length,
          ).cell;
          cell.note = redecoded.note;
        } else {
          // Fallback for cells with no carrier bytes (e.g. an edit that cleared
          // sunRaw via applySunNoteEdit): the linear inverse is correct for a
          // plain note. displayNote = poolNote - transpose.
          const poolNote = poolCell.note;
          cell.note = poolNote === 0 ? 0 : clampNote(poolNote - transpose);
        }
      }
    }
  }
}
