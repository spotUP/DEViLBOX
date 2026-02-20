/**
 * DJBeatSync - Beat matching between DJ decks
 *
 * Provides:
 * - Instant BPM sync (match deck B to deck A's BPM)
 * - Gradual slide sync (smoothly adjust over N ticks)
 * - Phase nudge (align beat grids)
 */

import type { DeckEngine } from './DeckEngine';

export class DJBeatSync {
  /**
   * Instantly match target deck's BPM to source deck.
   * Calculates the required pitch offset in semitones.
   * Accounts for source deck's tempo multiplier (pitch slider position).
   */
  static syncBPM(source: DeckEngine, target: DeckEngine): number {
    // Source effective BPM = base BPM * tempo multiplier (includes its pitch offset)
    const sourceBPM = source.replayer.getBPM() * source.replayer.getTempoMultiplier();
    // Target base BPM = raw BPM without multiplier — we're computing what multiplier to apply
    const targetBaseBPM = target.replayer.getBPM();

    if (targetBaseBPM <= 0 || sourceBPM <= 0) return 0;

    // Calculate the pitch offset needed to match source BPM
    // BPM ratio = 2^(semitones/12), so semitones = 12 * log2(ratio)
    const ratio = sourceBPM / targetBaseBPM;
    const semitones = 12 * Math.log2(ratio);

    // Clamp to ±16 semitone range
    const clamped = Math.max(-16, Math.min(16, semitones));

    return clamped;
  }

  /**
   * Nudge target deck toward phase alignment with source.
   * Uses a small temporary BPM bump to shift the beat grid.
   *
   * @param source - The deck to sync to
   * @param target - The deck to adjust
   * @param direction - 'forward' or 'backward'
   */
  static nudgeToPhase(
    source: DeckEngine,
    target: DeckEngine,
    direction: 'forward' | 'backward' = 'forward',
  ): void {
    // Calculate phase difference based on current row positions
    const sourceRow = source.replayer.getCurrentRow();
    const targetRow = target.replayer.getCurrentRow();
    const sourceSpeed = source.replayer.getSpeed();

    // Phase difference in rows
    const phaseDiff = sourceRow - targetRow;

    if (Math.abs(phaseDiff) < 1) return; // Already aligned

    // Apply a nudge to bring target closer to source's phase
    const nudgeAmount = direction === 'forward' ? 3 : -3;
    const nudgeTicks = Math.min(Math.abs(phaseDiff) * sourceSpeed, 32);

    target.nudge(nudgeAmount, nudgeTicks);
  }

  /**
   * Calculate the effective BPM difference between two decks.
   * Accounts for tempo multipliers (pitch slider positions).
   */
  static getBPMDifference(deckA: DeckEngine, deckB: DeckEngine): number {
    const aBPM = deckA.replayer.getBPM() * deckA.replayer.getTempoMultiplier();
    const bBPM = deckB.replayer.getBPM() * deckB.replayer.getTempoMultiplier();
    return aBPM - bBPM;
  }

  /**
   * Check if two decks are BPM-matched (within tolerance).
   */
  static isSynced(deckA: DeckEngine, deckB: DeckEngine, tolerance: number = 0.5): boolean {
    return Math.abs(this.getBPMDifference(deckA, deckB)) < tolerance;
  }
}
