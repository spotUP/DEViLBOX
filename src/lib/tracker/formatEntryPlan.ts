/**
 * Where a typed note goes, and where the cursor goes next - one rule for every editor.
 *
 * Modelled on the two reference trackers (cited in thoughts/shared/plans/2026-10-06-fix-all-open.md, P14):
 *
 *   edit mode off          keys only jam (play the note); nothing is written
 *                          (pt2-clone pt2_edit.c jamAndPlaceSample: the write is gated on MODE_EDIT/MODE_RECORD;
 *                           ft2-clone ft2_edit.c testNoteKeys: only `editmode || recmode` calls recordNote)
 *   edit mode on, stopped  the note is written at the cursor row, then the cursor moves down by the edit step
 *                          and wraps at the pattern end
 *                          (ft2_edit.c: setPos(-1, (row + editor.editRowSkip) % numRows) when PLAYMODE_EDIT;
 *                           pt2_edit.c: modSetPos(DONT_SET_ORDER, (currRow + editMoveAdd) & 63))
 *   recording, playing     the note is written at the PLAYBACK row (snapped by record quantize), the cursor stays
 *                          (ft2_edit.c evaluateTimeStamp + recordNote; pt2_edit.c quantizeCheck)
 *
 * DEViLBOX's one `recordMode` flag is FT2's edit mode when stopped and its record mode while playing.
 */

export interface EntryContext {
  recordMode: boolean;
  isPlaying: boolean;
  cursorRow: number;
  playbackRow: number;
  editStep: number;
  numRows: number;
  recQuantEnabled: boolean;
  recQuantRes: number;
}

export type EntryPlan =
  | { write: false }
  /** `row` is where the cell is written; `nextCursorRow` is the cursor's new row, or null to leave it. */
  | { write: true; row: number; nextCursorRow: number | null };

/** FT2 evaluateTimeStamp / PT2 quantizeCheck: snap a recorded row to the nearest multiple of `res`. */
export function quantizeRecordRow(row: number, res: number, numRows: number): number {
  if (res <= 0) return row;
  const remainder = row % res;
  return remainder >= res / 2 ? Math.min(row + (res - remainder), numRows - 1) : row - remainder;
}

export function planNoteEntry(c: EntryContext): EntryPlan {
  if (!c.recordMode || c.numRows <= 0) return { write: false };
  if (c.isPlaying) {
    const row = c.recQuantEnabled ? quantizeRecordRow(c.playbackRow, c.recQuantRes, c.numRows) : c.playbackRow;
    return { write: true, row, nextCursorRow: null };
  }
  const next = c.editStep > 0 ? (c.cursorRow + c.editStep) % c.numRows : null;
  return { write: true, row: c.cursorRow, nextCursorRow: next };
}

/**
 * Typing into a hex column (instrument, effect) and Delete are edit-mode only: FT2 ignores them
 * while playing (ft2_edit.c: `editmode` = PLAYMODE_EDIT), and they land on the cursor row.
 */
export function planCursorEntry(c: EntryContext): EntryPlan {
  if (!c.recordMode || c.isPlaying || c.numRows <= 0) return { write: false };
  return planNoteEntry(c);
}

import { NOTE_MAP } from '@/hooks/tracker/input/inputConstants';
import { stringNoteToXM } from '@/lib/xmConversions';

/** Semitones above C-0 of the note a piano key types at `octave` (FT2 layout), or null for a non-note key. */
export function typedPitch(key: string, octave: number): number | null {
  const m = NOTE_MAP[key.toLowerCase()];
  if (!m) return null;
  const xm = stringNoteToXM(`${m.note}-${octave + m.octaveOffset}`); // 1 = C-0, 0 = out of range
  return xm > 0 ? xm - 1 : null;
}
