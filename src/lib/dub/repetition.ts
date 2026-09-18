/**
 * Gate K4 — intentional repetition versus algorithmic repetition.
 *
 * Both look identical in a log: the same move, again. Musically they are
 * opposites. A dub engineer who throws echo on the third bar of every phrase
 * is building a motif — the listener starts to expect it, and the version gets
 * its shape from that expectation. A rule engine that throws echo six times in
 * a row because the dice kept landing there is in a rut, and the listener
 * stops hearing it at all.
 *
 * What separates them is WHERE in the phrase the repeats land, not how many
 * there are:
 *
 *  - a MOTIF recurs at the same musical position, roughly a phrase apart;
 *  - a RUT recurs at scattered positions, close together.
 *
 * So the performer should protect the first and break the second, and it
 * cannot do either while it only counts occurrences.
 *
 * Pure. Moves and a grid in, a verdict out.
 */

import type { RecentMove } from './performanceContext';

export type RepetitionKind = 'motif' | 'rut' | 'varied';

export interface RepetitionVerdict {
  kind: RepetitionKind;
  /** The move the verdict is about, when there is one. */
  moveId?: string;
  /** How consistently it lands in the same spot, 0..1. */
  positionConsistency: number;
  /** Occurrences considered. */
  occurrences: number;
  reason: string;
}

export interface RepetitionOptions {
  rowsPerBar: number;
  rowsPerPhrase: number;
  /** How many recent moves to consider. */
  window?: number;
  /** Position spread (in bars) below which repeats count as "the same spot". */
  tolerance?: number;
}

/**
 * Classify what the performer has been doing lately.
 *
 * Looks at the most repeated move in the window; everything else is variety by
 * definition. A move used once or twice is not a pattern either way.
 */
export function classifyRepetition(
  moves: readonly RecentMove[],
  options: RepetitionOptions,
): RepetitionVerdict {
  const window = options.window ?? 8;
  const tolerance = options.tolerance ?? 0.5;
  const recent = moves.slice(-window);

  if (recent.length < 3) {
    return {
      kind: 'varied',
      positionConsistency: 0,
      occurrences: recent.length,
      reason: 'not enough history to call it a pattern',
    };
  }

  // The most repeated move in the window.
  const counts = new Map<string, RecentMove[]>();
  for (const move of recent) {
    const list = counts.get(move.moveId) ?? [];
    list.push(move);
    counts.set(move.moveId, list);
  }
  let subject: { moveId: string; occurrences: RecentMove[] } | null = null;
  for (const [moveId, occurrences] of counts) {
    if (!subject || occurrences.length > subject.occurrences.length) {
      subject = { moveId, occurrences };
    }
  }
  if (!subject || subject.occurrences.length < 3) {
    return {
      kind: 'varied',
      positionConsistency: 0,
      occurrences: subject?.occurrences.length ?? 0,
      reason: 'no move repeated often enough to be a pattern',
    };
  }

  const { moveId, occurrences } = subject;
  const rowsPerBar = Math.max(1, options.rowsPerBar);
  const rowsPerPhrase = Math.max(rowsPerBar, options.rowsPerPhrase);

  // Where in the PHRASE each occurrence landed, in bars.
  const positions = occurrences.map(m => ((m.row % rowsPerPhrase) + rowsPerPhrase) % rowsPerPhrase / rowsPerBar);
  const spread = circularSpread(positions, rowsPerPhrase / rowsPerBar);
  const positionConsistency = Math.max(0, 1 - spread / Math.max(tolerance, 0.001) / 2);

  // How far apart in time, in phrases.
  const rows = occurrences.map(m => m.row).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i++) gaps.push((rows[i] - rows[i - 1]) / rowsPerPhrase);
  const medianGap = median(gaps);

  // A motif lands in the same spot, about a phrase (or a few) apart. A rut
  // lands anywhere, close together.
  if (spread <= tolerance && medianGap >= 0.5) {
    return {
      kind: 'motif',
      moveId,
      positionConsistency,
      occurrences: occurrences.length,
      reason: `${moveId} recurs at bar ${positions[0].toFixed(1)} of the phrase — a motif`,
    };
  }

  if (medianGap < 0.5 && spread > tolerance) {
    return {
      kind: 'rut',
      moveId,
      positionConsistency,
      occurrences: occurrences.length,
      reason: `${moveId} ${occurrences.length} times at scattered positions — a rut`,
    };
  }

  return {
    kind: 'varied',
    moveId,
    positionConsistency,
    occurrences: occurrences.length,
    reason: `${moveId} repeats, but neither tightly placed nor tightly spaced`,
  };
}

/**
 * Weight multiplier for a move, given the verdict and how much the persona
 * values novelty.
 *
 * A motif is PROTECTED — the move that makes the shape is worth more, not
 * less, when its place in the phrase comes round again. A rut is broken:
 * the repeated move is pushed down so something else wins the weighted pick.
 * Everything else is untouched, because most of the time neither applies.
 */
export function repetitionWeight(
  moveId: string,
  verdict: RepetitionVerdict,
  novelty: number,
  atMotifPosition = false,
): number {
  if (verdict.moveId !== moveId) return 1;
  if (verdict.kind === 'motif') {
    // Only where the motif belongs. A motif repeated in the wrong place is
    // just a rut with better manners.
    return atMotifPosition ? 1 + 0.5 * verdict.positionConsistency : 1;
  }
  if (verdict.kind === 'rut') {
    // A persona that values novelty breaks out harder; one that does not still
    // breaks out, just less.
    return Math.max(0.15, 1 - (0.4 + 0.5 * novelty));
  }
  return 1;
}

/** Is `row` at the same place in the phrase the motif occupies? */
export function atMotifPosition(
  row: number,
  motifRow: number,
  rowsPerPhrase: number,
  rowsPerBar: number,
  tolerance = 0.5,
): boolean {
  const phraseLen = Math.max(1, rowsPerPhrase);
  const a = ((row % phraseLen) + phraseLen) % phraseLen / Math.max(1, rowsPerBar);
  const b = ((motifRow % phraseLen) + phraseLen) % phraseLen / Math.max(1, rowsPerBar);
  const bars = phraseLen / Math.max(1, rowsPerBar);
  const diff = Math.abs(a - b);
  return Math.min(diff, bars - diff) <= tolerance;
}

/** Spread of positions on a circle of `size`, in the same units. */
function circularSpread(positions: readonly number[], size: number): number {
  if (positions.length < 2) return 0;
  let best = Infinity;
  // Try each position as the anchor; the smallest enclosing arc wins. Cheap
  // for the handful of occurrences involved, and correct across the wrap.
  for (const anchor of positions) {
    let max = 0;
    for (const p of positions) {
      const diff = Math.abs(p - anchor);
      max = Math.max(max, Math.min(diff, size - diff));
    }
    best = Math.min(best, max);
  }
  return best;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * How many times in a row the most recent move has just fired.
 *
 * Weighting a rut down proved too gentle in practice: measured live on
 * 2026-09-18, eighteen of AutoDub's twenty-two fires were `echoThrow`, each
 * one bumping echo feedback, so the bus never got back to baseline and the
 * tail never decayed. A 0.55 multiplier does not stop a move that several
 * rules offer and the persona weights at 1.5 from winning the draw again.
 *
 * Some things are better as a rule than as a preference. Nothing musical
 * needs the same move four times running.
 */
export function consecutiveRun(moves: readonly RecentMove[]): { moveId: string; count: number } | null {
  if (moves.length === 0) return null;
  const moveId = moves[moves.length - 1].moveId;
  let count = 0;
  for (let i = moves.length - 1; i >= 0; i--) {
    if (moves[i].moveId !== moveId) break;
    count++;
  }
  return { moveId, count };
}

/** Consecutive fires of one move before it is barred from the next draw. */
export const CONSECUTIVE_LIMIT = 3;

/**
 * Is this move barred right now for having just been played too many times?
 *
 * A MOTIF at its own place in the phrase is exempt: repetition there is the
 * point, and it is spaced a phrase apart rather than back to back — which is
 * what `classifyRepetition` distinguishes and a raw counter cannot.
 */
export function barredForRepetition(
  moveId: string,
  moves: readonly RecentMove[],
  verdict: RepetitionVerdict,
  atMotifPositionNow = false,
): boolean {
  if (verdict.kind === 'motif' && verdict.moveId === moveId && atMotifPositionNow) return false;
  const run = consecutiveRun(moves);
  return run !== null && run.moveId === moveId && run.count >= CONSECUTIVE_LIMIT;
}
