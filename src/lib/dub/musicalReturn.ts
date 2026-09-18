/**
 * Gate L1 — musical return quantization.
 *
 * When a move gives something back — the skank creeping back into a
 * `riddimSection`, a muted channel returning, a drop resolving — the moment it
 * returns is a musical decision. It was arithmetic: 60% of the hold duration,
 * which lands wherever it lands. Sixty percent of four bars at 143 BPM is
 * 4.03 seconds, which is the middle of a bar, and the mix comes back in the
 * wrong place by an amount that varies with tempo.
 *
 * Returns now land on a boundary: the next beat, eighth, bar or phrase. Which
 * one depends on what the gesture was for — a quick ANSWER should come back
 * within the bar, a DROP wants the phrase edge — so the choice is made from
 * the intention rather than from a constant.
 *
 * Pure. Rows in, milliseconds out, the grid from the clock.
 */

import type { MusicalClockSettings } from './musicalClock';
import { computeMusicalPosition } from './musicalClock';
import type { Intention } from './performanceContext';

export type ReturnBoundary = 'beat' | '1/8' | 'bar' | 'phrase' | 'half-bar';

/**
 * Where a gesture with this intention should hand the music back.
 *
 * The rule of thumb is that the bigger the gesture, the bigger the seam it
 * should resolve on: taking a whole section away and giving it back mid-bar
 * sounds like a mistake, while an accent that waits for the phrase edge has
 * stopped being an accent.
 */
export function boundaryForIntention(intention: Intention): ReturnBoundary {
  switch (intention) {
    case 'DROP':
    case 'TRANSITION':
      return 'phrase';
    case 'BUILD':
    case 'SPACE':
      return 'bar';
    case 'ANSWER':
    case 'ACCENT':
      return 'beat';
    case 'TEXTURE':
      return 'half-bar';
    case 'RESET':
    case 'REST':
      return 'bar';
  }
}

/**
 * Rows until the next `boundary` strictly after `row`.
 *
 * Strictly after, so a gesture fired exactly on a downbeat does not "return"
 * in the same instant it started — the zero-length return being the way
 * boundary arithmetic usually goes wrong.
 */
export function rowsUntilBoundary(
  row: number,
  ticksPerRow: number,
  boundary: ReturnBoundary,
  settings?: Partial<MusicalClockSettings>,
): number {
  const pos = computeMusicalPosition(row, ticksPerRow, settings);
  switch (boundary) {
    case 'beat':
      return pos.nextBeatRow - row;
    case '1/8':
      return stepUntil(row, pos.rowsPerBeat / 2);
    case 'half-bar':
      return stepUntil(row, pos.rowsPerBar / 2);
    case 'bar':
      return pos.nextBarRow - row;
    case 'phrase':
      return pos.nextPhraseRow - row;
  }
}

/**
 * Milliseconds until that boundary.
 *
 * A row is `ticksPerRow` ticks at the tracker's tick rate, which is what the
 * BPM describes: 24 ticks to the quarter note. Deriving the row length from
 * BPM and speed rather than taking a duration in seconds is what keeps this
 * correct when the song changes tempo mid-pattern.
 */
export function msUntilBoundary(
  row: number,
  ticksPerRow: number,
  bpm: number,
  boundary: ReturnBoundary,
  settings?: Partial<MusicalClockSettings>,
): number {
  const rows = rowsUntilBoundary(row, ticksPerRow, boundary, settings);
  const safeBpm = Math.max(30, Math.min(300, Number.isFinite(bpm) && bpm > 0 ? bpm : 120));
  const rowMs = (60000 / safeBpm) * (ticksPerRow / 24);
  return Math.max(0, rows * rowMs);
}

/**
 * The return moment for a gesture, with a ceiling.
 *
 * The ceiling matters: a phrase boundary can be fifteen bars away, and a drop
 * that holds for fifteen bars because the arithmetic said so is not a musical
 * decision either. When the next boundary is further than `maxMs`, the gesture
 * falls back to the largest boundary that fits — which is the answer a player
 * would give, not a clamp to an arbitrary duration.
 */
export function msUntilMusicalReturn(
  row: number,
  ticksPerRow: number,
  bpm: number,
  intention: Intention,
  maxMs: number,
  settings?: Partial<MusicalClockSettings>,
): { ms: number; boundary: ReturnBoundary } {
  const order: ReturnBoundary[] = ['phrase', 'bar', 'half-bar', 'beat'];
  const preferred = boundaryForIntention(intention);
  const startAt = Math.max(0, order.indexOf(preferred === '1/8' ? 'beat' : preferred));

  for (let i = startAt; i < order.length; i++) {
    const boundary = order[i];
    const ms = msUntilBoundary(row, ticksPerRow, bpm, boundary, settings);
    if (ms <= maxMs) return { ms, boundary };
  }
  // Even the next beat is further away than the ceiling allows — rare, and
  // only at absurd tempos. Return the beat anyway: a return has to happen
  // somewhere musical, and the beat is the smallest somewhere there is.
  return {
    ms: msUntilBoundary(row, ticksPerRow, bpm, 'beat', settings),
    boundary: 'beat',
  };
}

/** Rows to the next multiple of `step`, strictly after `row`. */
function stepUntil(row: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const next = Math.floor(row / step) * step + step;
  return next - row;
}
