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
  // Iterate PER VOICE across all patterns in grid-row order — this reconstructs
  // `voices[ch].cells` exactly (SunTronicParser slices that flat array into
  // pattern rows). walkV13Voice threads a running `curInstr` (the staged select)
  // across the whole voice; decodeSunGroup's note emission is GATED on it (a
  // pitch byte with no instrument ever staged fires no note-on in the player, so
  // the grid shows no note). To reproduce those gated notes, reproject must
  // thread the SAME curInstr — passing 0 per cell suppresses every bare
  // `[note,0x00]` melody group that reuses a previously-staged instrument.
  for (let ch = 0; ch < 4; ch++) {
    let curInstr = 0;
    for (const pattern of patterns) {
      const channel = pattern.channels[ch];
      if (!channel) continue;
      for (const cell of channel.rows) {
        const bi = cell.sunBlockIndex;
        const ri = cell.sunRowInBlock;
        const pos = cell.sunPosition;

        // Non-provenanced cells (padding / empty positions) still advance the
        // running select if they carry group bytes, so later provenanced cells
        // decode against the correct curInstr.
        const provenanced =
          bi !== undefined && bi >= 0 && ri !== undefined && pos !== undefined &&
          bi < native.blocks.length && pos < native.positions.length &&
          ri < native.blocks[bi].length;

        if (!provenanced) {
          curInstr = advanceCurInstr(cell.sunRaw, curInstr, native);
          continue;
        }

        const poolCell = native.blocks[bi!][ri!];
        const transpose = native.positions[pos!].transpose[ch as 0 | 1 | 2 | 3];

        // Faithful path: re-run the SAME decoder the display walk uses on the
        // pool cell's stored group bytes, at this position's transpose AND the
        // threaded curInstr. A linear `poolNote ± transpose` model is LOSSY for
        // glide (0x94) and any clamp-to-zero fallback, because the pool note and
        // the display note can derive from DIFFERENT stream carriers. Re-decoding
        // sunRaw reproduces the display note exactly (proven corpus-wide).
        const raw = poolCell.sunRaw;
        if (raw && raw.length > 0) {
          const decoded = decodeSunGroup(
            Uint8Array.from(raw),
            0,
            transpose,
            curInstr,
            native.numSampled,
            native.widths,
            raw.length,
          );
          cell.note = decoded.cell.note;
          curInstr = decoded.curInstr;
        } else {
          // Fallback for cells with no carrier bytes (e.g. an edit that cleared
          // sunRaw via applySunNoteEdit): the linear inverse is correct for a
          // plain note. displayNote = poolNote - transpose. Advance curInstr from
          // the grid cell's original group bytes so later cells stay in sync.
          const poolNote = poolCell.note;
          cell.note = poolNote === 0 ? 0 : clampNote(poolNote - transpose);
          curInstr = advanceCurInstr(cell.sunRaw, curInstr, native);
        }
      }
    }
  }
}

/** Advance the running select cursor by decoding a group's raw bytes. curInstr
 *  update is transpose-independent (selects map the same regardless of pitch), so
 *  transpose 0 is used. Returns curInstr unchanged when there are no bytes. */
function advanceCurInstr(
  raw: number[] | undefined,
  curInstr: number,
  native: SunTronicNativeData,
): number {
  if (!raw || raw.length === 0) return curInstr;
  return decodeSunGroup(
    Uint8Array.from(raw),
    0,
    0,
    curInstr,
    native.numSampled,
    native.widths,
    raw.length,
  ).curInstr;
}
