/**
 * writeToPattern.ts - quantised notes to pattern cells, as ONE undo step.
 *
 * Goes through useTrackerStore.bulkBlockEdit (one history entry, one live
 * engine resync). Note encoding is lib/xmConversions.midiToXMNote, the same
 * function the sample editor's Audio to MIDI path uses. The commit functions
 * (voiceToNotes, drumToNotes) pick playable instruments before writing
 * (voiceInstruments.ts).
 */
import type { Pattern, TrackerCell } from '@typedefs';
import { midiToXMNote } from '@/lib/xmConversions';
import { useTrackerStore } from '@/stores/useTrackerStore';
import type { QuantisedNote } from './quantise';

/** XM note-off */
export const NOTE_OFF = 97;

export interface WriteTarget {
  channelIndex: number;
  /** First pattern row the take's row 0 lands on */
  startRow: number;
  instrumentId: number;
}

/** Velocity 0..1 to the XM volume column (0x10..0x50). */
export function velocityToVolume(velocity: number): number {
  return 0x10 + Math.round(Math.max(0, Math.min(1, velocity)) * 64);
}

export interface WriteResult {
  written: number;
  /** Notes that fell outside the pattern */
  dropped: number;
}

export interface TakeCell {
  note: number;
  instrument: number;
  volume: number;
}

export interface TakeCells extends WriteResult {
  /** Pattern row of cells[0] */
  startRow: number;
  /** Every row of the take's span; empty rows are all zero (the span is cleared). */
  cells: TakeCell[];
}

/**
 * The cells a take writes on its channel: the span from `target.startRow`
 * through the last note's note-off, clipped to `rowCount`. The one place the
 * write rules live: the commit copies these cells and the pattern's live
 * preview draws them, so the preview shows exactly what a commit writes.
 */
export function takeCells(notes: readonly QuantisedNote[], target: WriteTarget, rowCount: number): TakeCells {
  const last = notes.length ? notes[notes.length - 1] : null;
  const spanEnd = last ? Math.min(rowCount, target.startRow + last.row + last.lengthRows + 1) : target.startRow;
  const out: TakeCells = { startRow: target.startRow, cells: [], written: 0, dropped: 0 };
  for (let r = target.startRow; r < spanEnd; r++) out.cells.push({ note: 0, instrument: 0, volume: 0 });
  for (const n of notes) {
    const i = n.row;
    const xm = midiToXMNote(n.midi);
    if (target.startRow + i >= rowCount || !xm) {
      out.dropped++;
      continue;
    }
    out.cells[i] = { note: xm, instrument: n.instrumentId ?? target.instrumentId, volume: velocityToVolume(n.velocity) };
    out.written++;
    const off = i + n.lengthRows;
    if (n.noteOff !== false && off < out.cells.length && out.cells[off].note === 0) out.cells[off].note = NOTE_OFF;
  }
  return out;
}

/** Pure part: mutate a pattern in place (replace semantics over the take's span). */
export function applyNotesToPattern(
  pattern: Pattern,
  notes: readonly QuantisedNote[],
  target: WriteTarget,
): WriteResult {
  const channel = pattern.channels[target.channelIndex];
  if (!channel) return { written: 0, dropped: notes.length };
  const rows: TrackerCell[] = channel.rows;
  const take = takeCells(notes, target, rows.length);
  take.cells.forEach((c, i) => {
    const cell = rows[take.startRow + i];
    cell.note = c.note;
    cell.instrument = c.instrument;
    cell.volume = c.volume;
  });
  return { written: take.written, dropped: take.dropped };
}

/** Store part: one undo step on the current pattern. */
export function writeNotesToPattern(
  notes: readonly QuantisedNote[],
  target: WriteTarget,
): WriteResult {
  let result: WriteResult = { written: 0, dropped: 0 };
  useTrackerStore.getState().bulkBlockEdit('Voice to Notes', (pattern) => {
    result = applyNotesToPattern(pattern, notes, target);
  });
  return result;
}
