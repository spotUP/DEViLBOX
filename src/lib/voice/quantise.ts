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
}

export interface QuantisedNote {
  /** Row relative to the take start */
  row: number;
  lengthRows: number;
  midi: number;
  /** 0..1 */
  velocity: number;
}

export function rowSeconds(bpm: number, speed: number): number {
  return (speed * 2.5) / bpm;
}

/** Grid time of a row, with swing on odd rows. */
function rowTime(row: number, rs: number, swing: number): number {
  return row * rs + (row % 2 === 1 ? swing * 0.5 * rs : 0);
}

/** The row whose (swung) grid time is nearest to `t`. */
function nearestRow(t: number, rs: number, swing: number): number {
  const guess = Math.round(t / rs);
  let best = Math.max(0, guess - 1);
  for (let r = Math.max(0, guess - 1); r <= guess + 1; r++) {
    if (Math.abs(rowTime(r, rs, swing) - t) < Math.abs(rowTime(best, rs, swing) - t)) best = r;
  }
  return best;
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
    const row = nearestRow(Math.max(0, start), rs, s.swing);
    const endRow = nearestRow(end, rs, s.swing);
    const q = {
      row,
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
      lengthRows: Math.max(1, Math.min(q.lengthRows, room)),
      midi: q.midi,
      velocity: q.velocity,
    };
  });
}
