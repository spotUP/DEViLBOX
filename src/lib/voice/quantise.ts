/**
 * quantise.ts - notes (seconds) to pattern rows.
 *
 * Pure. A tracker row lasts `speed * 2.5 / bpm` seconds (tick = 2.5 / bpm).
 */
import type { VoiceNote } from './pitchNotes';

export interface QuantiseSettings {
  bpm: number;
  /** Ticks per row */
  speed: number;
  /** 0..1: odd rows are delayed by swing * half a row (0 = straight). */
  swing: number;
  /** Shortest note kept, in rows (>= 1). */
  minLengthRows: number;
  /**
   * Latency nudge in milliseconds. Positive = the take arrives late (mic and
   * output latency), so the notes move earlier by this amount.
   */
  latencyNudgeMs: number;
  /**
   * 0..1: how far a note moves to its nearest row. 1 lands on the row, 0 keeps
   * the timing as sung (the offset is kept in `offsetRows`).
   */
  strength: number;
  /**
   * 0..0.5 rows: an offset this small counts as on the row and is dropped
   * whatever the strength, so a slightly late note is still written on its row.
   */
  toleranceRows: number;
}

export interface QuantisedTime {
  /** Nearest (swung) row. */
  row: number;
  /**
   * Signed distance from the row that is kept after strength and tolerance,
   * in rows; 0 when fully snapped. The writer turns a positive offset into a
   * note delay; a negative one is written on the row.
   */
  offsetRows: number;
  /** Where the note was sung, after the latency nudge. */
  heardSeconds: number;
  /** Where the note is written: the row's grid time plus the kept offset. */
  writtenSeconds: number;
}

export interface QuantisedNote {
  /** Row relative to the take start */
  row: number;
  /** Timing kept off the row after strength and tolerance (see QuantisedTime). */
  offsetRows: number;
  /** Where the note was sung, in seconds from the take start. */
  heardSeconds: number;
  lengthRows: number;
  midi: number;
  /** 0..1 */
  velocity: number;
  /** Per-note instrument (drum maps); falls back to the write target's. */
  instrumentId?: number;
  /** false = write no note-off after the note (drum hits). Default true. */
  noteOff?: boolean;
}

export function rowSeconds(bpm: number, speed: number): number {
  return (speed * 2.5) / bpm;
}

/** Grid time of a row, with swing on odd rows. */
export function rowTime(row: number, rs: number, swing: number): number {
  return row * rs + (row % 2 === 1 ? swing * 0.5 * rs : 0);
}

/** The row whose (swung) grid time is nearest to `t`. */
export function nearestRow(t: number, rs: number, swing: number): number {
  const guess = Math.round(t / rs);
  let best = Math.max(0, guess - 1);
  for (let r = Math.max(0, guess - 1); r <= guess + 1; r++) {
    if (Math.abs(rowTime(r, rs, swing) - t) < Math.abs(rowTime(best, rs, swing) - t)) best = r;
  }
  return best;
}

/**
 * One time to its row and the timing kept off it. Pure: the row is the nearest
 * swung grid row; the signed offset (in rows) is zeroed inside the tolerance,
 * otherwise scaled by `1 - strength`.
 */
export function quantiseTime(t: number, s: QuantiseSettings): QuantisedTime {
  const rs = rowSeconds(s.bpm, s.speed);
  const row = nearestRow(t, rs, s.swing);
  const off = (t - rowTime(row, rs, s.swing)) / rs;
  const strength = Math.min(1, Math.max(0, s.strength));
  const kept = Math.abs(off) <= Math.max(0, s.toleranceRows) ? 0 : off * (1 - strength);
  return { row, offsetRows: kept, heardSeconds: t, writtenSeconds: rowTime(row, rs, s.swing) + kept * rs };
}

/**
 * Snap notes to rows. Output: strictly increasing rows (one note per row; on a
 * collision the louder note wins), lengths >= minLengthRows and clipped so a
 * note ends no later than the next note starts (no overlaps).
 */
export function quantiseNotes(
  notes: readonly VoiceNote[],
  s: QuantiseSettings,
): QuantisedNote[] {
  const rs = rowSeconds(s.bpm, s.speed);
  const shift = s.latencyNudgeMs / 1000;
  const minLen = Math.max(1, Math.round(s.minLengthRows));

  const byRow = new Map<number, QuantisedNote & { end: number }>();
  for (const n of notes) {
    const start = n.startTimeSeconds - shift;
    const end = start + n.durationSeconds;
    if (end <= 0) continue;
    const time = quantiseTime(Math.max(0, start), s);
    const row = time.row;
    const endRow = nearestRow(end, rs, s.swing);
    const q = {
      row,
      offsetRows: time.offsetRows,
      heardSeconds: time.heardSeconds,
      lengthRows: Math.max(minLen, endRow - row),
      midi: n.pitchMidi,
      velocity: n.amplitude,
      end: endRow,
    };
    const prev = byRow.get(row);
    if (!prev || prev.velocity < q.velocity) byRow.set(row, q);
  }

  const sorted = [...byRow.values()].sort((a, b) => a.row - b.row);
  return sorted.map((q, i) => {
    const next = sorted[i + 1];
    const room = next ? next.row - q.row : Infinity;
    return {
      row: q.row,
      offsetRows: q.offsetRows,
      heardSeconds: q.heardSeconds,
      lengthRows: Math.max(1, Math.min(q.lengthRows, room)),
      midi: q.midi,
      velocity: q.velocity,
    };
  });
}
