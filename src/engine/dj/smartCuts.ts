/**
 * Smart Cuts — pattern-data-driven transition decisions for Auto DJ.
 *
 * Pure functions that inspect a tracker song's patterns to decide whether a
 * hard `cut` transition sounds better than the default crossfade. Invoked
 * from `DJAutoDJ.selectTransitionType()` only when the `autoDJSmartCuts`
 * feature flag is true — the 2026-04-18 gig-fix comment forbids random
 * cuts, so this code path is strictly opt-in and evidence-based.
 *
 * Primary heuristic for Phase 4 MVP: if the outgoing track ends on a
 * drum-break pattern (percussion-dominated tail), cut to the incoming
 * track on the break boundary. Other look-ahead tricks (chord-change
 * avoidance, harmonic bass-swap) are stretch work.
 */

import type { Pattern } from '@/types/tracker';
import { classifyPattern, detectChordChangeRows } from '@/bridge/analysis/MusicAnalysis';

export interface DrumBreakInput {
  /** The outgoing deck's full song. Null if deck isn't tracker-format. */
  song: { patterns: Pattern[] } | null | undefined;
  /** The outgoing pattern index being audited. Usually the LAST pattern
   *  (tracks typically end on a break); callers may pass a specific index. */
  patternIndex?: number;
}

/**
 * Return true if the given pattern ends in a drum-break: the final 8 rows
 * have active notes on percussion-role channels with minimal activity on
 * other non-empty roles.
 *
 * Rules:
 *   - Song must have ≥ 1 pattern with ≥ 16 rows.
 *   - At least one channel classifies as 'percussion'.
 *   - In the final 8 rows, active percussion notes ≥ 4 AND at least 3× the
 *     count of active non-percussion / non-empty notes.
 *
 * Returns false for missing / too-short / non-break patterns — callers
 * fall through to the default transition selection.
 */
export function detectDrumBreakTail(input: DrumBreakInput): boolean {
  const { song } = input;
  if (!song || !Array.isArray(song.patterns) || song.patterns.length === 0) {
    return false;
  }

  const idx = input.patternIndex ?? (song.patterns.length - 1);
  const pattern = song.patterns[idx];
  if (!pattern || !Array.isArray(pattern.channels) || pattern.channels.length === 0) {
    return false;
  }

  const analyses = classifyPattern(pattern);
  const hasPerc = analyses.some(a => a.role === 'percussion');
  if (!hasPerc) return false;

  const numRows = pattern.channels[0]?.rows.length ?? 0;
  if (numRows < 16) return false;

  const tailStart = Math.max(0, numRows - 8);
  let percActive = 0;
  let nonPercActive = 0;

  for (let row = tailStart; row < numRows; row++) {
    for (let ch = 0; ch < pattern.channels.length; ch++) {
      const cell = pattern.channels[ch].rows[row];
      if (!cell || cell.note < 1 || cell.note > 96) continue;
      const role = analyses[ch].role;
      if (role === 'percussion') percActive += 1;
      else if (role !== 'empty') nonPercActive += 1;
    }
  }

  return percActive >= 4 && percActive >= nonPercActive * 3;
}

// ─── Chord-change avoidance ──────────────────────────────────────────────────

export interface ChordChangeImminentInput {
  /** The outgoing deck's full song. Null if deck isn't tracker-format. */
  song: { patterns: Pattern[] } | null | undefined;
  /** Current pattern index being played (songPos → patternOrder lookup).
   *  Callers can pass -1 to scan the last pattern (tail analysis). */
  patternIndex: number;
  /** Current row within the current pattern. */
  currentRow: number;
  /** How many rows ahead to scan for a chord change (typically 1 bar
   *  worth of rows: 16 for a 16-row-per-bar song at rowsPerBeat=4). */
  windowRows?: number;
  /** Rows-per-beat for chord-change sampling (default 4 — matches the
   *  detectChordProgression default). */
  rowsPerBeat?: number;
}

/**
 * Return true if a chord change will occur within the next `windowRows`
 * rows on the outgoing song. Used by Auto-DJ Smart Cuts to DEFER a hard
 * cut when the outgoing track is mid-turnaround — crossfading through a
 * chord change sounds smooth; cutting across one sounds broken.
 *
 * Returns false for missing / out-of-range inputs — callers fall through
 * to the default (non-avoidance) transition path.
 */
export function isChordChangeImminent(input: ChordChangeImminentInput): boolean {
  const { song } = input;
  if (!song || !Array.isArray(song.patterns) || song.patterns.length === 0) {
    return false;
  }

  const patternCount = song.patterns.length;
  const patternIndex = input.patternIndex < 0
    ? patternCount - 1
    : Math.min(input.patternIndex, patternCount - 1);
  const pattern = song.patterns[patternIndex];
  if (!pattern || !Array.isArray(pattern.channels) || pattern.channels.length === 0) {
    return false;
  }

  const windowRows = input.windowRows ?? 16;
  const rowsPerBeat = input.rowsPerBeat ?? 4;
  const currentRow = Math.max(0, input.currentRow);

  const changes = detectChordChangeRows(pattern, rowsPerBeat);
  for (const { row } of changes) {
    if (row > currentRow && row <= currentRow + windowRows) return true;
  }
  return false;
}
