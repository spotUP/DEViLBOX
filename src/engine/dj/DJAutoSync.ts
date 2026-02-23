/**
 * DJAutoSync — Phase-locked beat sync using analysis beat grids
 *
 * Extends the existing DJBeatSync with:
 *   1. Beat-grid-aware BPM matching (uses analysis BPM, more accurate)
 *   2. Phase alignment (align downbeats between decks)
 *   3. Quantized launch (start playback on the next beat/bar boundary)
 *
 * Works with both tracker and audio playback modes using the analysis-derived
 * beat grid from the DJPipeline.
 */

import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from './DJEngine';
import type { DeckId } from './DeckEngine';
import type { BeatGridData } from './DJAudioCache';

// ── Types ────────────────────────────────────────────────────────────────────

export type SyncMode = 'bpm' | 'beat' | 'bar';

interface PhaseInfo {
  /** Current position in seconds */
  position: number;
  /** Index of the nearest beat */
  nearestBeatIdx: number;
  /** Time of the nearest beat */
  nearestBeatTime: number;
  /** Phase within current beat (0-1, where 0 = on beat) */
  beatPhase: number;
  /** Index of the nearest downbeat */
  nearestDownbeatIdx: number;
  /** Phase within current bar (0-1, where 0 = on downbeat) */
  barPhase: number;
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Sync one deck's BPM to another using the most accurate BPM source available.
 *
 * Priority: analysis BPM > Serato BPM > tracker-detected BPM
 * Returns the semitone offset applied.
 */
export function syncBPMToOther(deckId: DeckId, otherDeckId: DeckId): number {
  const store = useDJStore.getState();
  const thisDeck = store.decks[deckId];
  const otherDeck = store.decks[otherDeckId];

  // Get best available BPM for both decks
  const targetBPM = getBestBPM(otherDeck);
  const sourceBPM = getBestBPM(thisDeck);

  if (targetBPM <= 0 || sourceBPM <= 0) return 0;

  // Calculate semitone offset to match BPMs
  const ratio = targetBPM / sourceBPM;
  const semitones = 12 * Math.log2(ratio);
  const clamped = Math.max(-16, Math.min(16, semitones));

  store.setDeckPitch(deckId, clamped);

  return clamped;
}

/**
 * Phase-align this deck to the other deck's beat grid.
 * Seeks to a position that aligns beats (or downbeats for bar sync).
 *
 * @param mode - 'beat' aligns to nearest beat, 'bar' aligns to nearest downbeat
 */
export function phaseAlign(
  deckId: DeckId,
  otherDeckId: DeckId,
  mode: SyncMode = 'beat',
): void {
  const store = useDJStore.getState();
  const otherState = store.decks[otherDeckId];

  if (!otherState.beatGrid) return;

  const otherPhase = getPhaseInfo(otherDeckId);
  if (!otherPhase) return;

  const thisState = store.decks[deckId];
  if (!thisState.beatGrid) return;

  const thisBeatGrid = thisState.beatGrid;
  const thisPosition = getCurrentPosition(deckId);

  // Find nearest beat/downbeat in this deck
  const beats = mode === 'bar' ? thisBeatGrid.downbeats : thisBeatGrid.beats;
  if (beats.length === 0) return;

  // Find the beat in this deck that's closest to the current phase of the other deck
  const otherBeatPhase = mode === 'bar' ? otherPhase.barPhase : otherPhase.beatPhase;

  // We want to seek to a position where our beat phase matches their beat phase
  // Find the nearest beat, then offset by the phase difference
  let bestBeatIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < beats.length; i++) {
    const dist = Math.abs(beats[i] - thisPosition);
    if (dist < bestDist) {
      bestDist = dist;
      bestBeatIdx = i;
    }
  }

  // Calculate the beat period (average time between beats)
  const beatPeriod = thisBeatGrid.bpm > 0 ? 60 / thisBeatGrid.bpm : 0.5;
  const barPeriod = beatPeriod * thisBeatGrid.timeSignature;
  const period = mode === 'bar' ? barPeriod : beatPeriod;

  // Target: snap to the nearest beat, then apply the other deck's phase offset
  const targetBeat = beats[bestBeatIdx];
  const phaseOffset = otherBeatPhase * period;
  const seekTarget = targetBeat + phaseOffset;

  // Perform the seek
  seekDeck(deckId, seekTarget);
}

/**
 * Full sync: match BPM + align phase.
 */
export function fullSync(
  deckId: DeckId,
  otherDeckId: DeckId,
  mode: SyncMode = 'beat',
): number {
  const semitones = syncBPMToOther(deckId, otherDeckId);
  phaseAlign(deckId, otherDeckId, mode);
  return semitones;
}

/**
 * Get the time until the next beat boundary in the given deck.
 * Useful for quantized effect triggers.
 */
export function timeToNextBeat(deckId: DeckId): number {
  const phase = getPhaseInfo(deckId);
  if (!phase) return 0;

  const state = useDJStore.getState().decks[deckId];
  if (!state.beatGrid || state.beatGrid.bpm <= 0) return 0;

  const beatPeriod = 60 / state.beatGrid.bpm;
  return beatPeriod * (1 - phase.beatPhase);
}

/**
 * Get the time until the next downbeat (bar start) in the given deck.
 */
export function timeToNextDownbeat(deckId: DeckId): number {
  const phase = getPhaseInfo(deckId);
  if (!phase) return 0;

  const state = useDJStore.getState().decks[deckId];
  if (!state.beatGrid || state.beatGrid.bpm <= 0) return 0;

  const barPeriod = (60 / state.beatGrid.bpm) * state.beatGrid.timeSignature;
  return barPeriod * (1 - phase.barPhase);
}

/**
 * Schedule a callback to fire on the next beat boundary.
 * Returns a cancel function.
 */
export function onNextBeat(deckId: DeckId, callback: () => void): () => void {
  const delay = timeToNextBeat(deckId);
  const timer = setTimeout(callback, delay * 1000);
  return () => clearTimeout(timer);
}

/**
 * Schedule a callback to fire on the next downbeat boundary.
 * Returns a cancel function.
 */
export function onNextDownbeat(deckId: DeckId, callback: () => void): () => void {
  const delay = timeToNextDownbeat(deckId);
  const timer = setTimeout(callback, delay * 1000);
  return () => clearTimeout(timer);
}

// ── Exported helpers (used by UI components) ─────────────────────────────────

export { type PhaseInfo };

/**
 * Get beat/bar phase info for a deck. Used by DeckBeatPhase UI component.
 * Returns null if no beat grid is available.
 */
export function getBeatPhaseInfo(deckId: DeckId): PhaseInfo | null {
  return getPhaseInfo(deckId);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function getBestBPM(deckState: { beatGrid: BeatGridData | null; detectedBPM: number; effectiveBPM: number }): number {
  // Analysis BPM is most accurate
  if (deckState.beatGrid?.bpm && deckState.beatGrid.bpm > 0) {
    return deckState.beatGrid.bpm;
  }
  // Detected BPM (from tracker pattern analysis or Serato metadata)
  if (deckState.detectedBPM > 0) return deckState.detectedBPM;
  // Effective BPM (includes pitch offset)
  if (deckState.effectiveBPM > 0) return deckState.effectiveBPM;
  return 0;
}

function getCurrentPosition(deckId: DeckId): number {
  const state = useDJStore.getState().decks[deckId];
  if (state.playbackMode === 'audio') {
    return state.audioPosition;
  }
  // For tracker mode, convert position to approximate seconds
  return state.elapsedMs / 1000;
}

function getPhaseInfo(deckId: DeckId): PhaseInfo | null {
  const state = useDJStore.getState().decks[deckId];
  const beatGrid = state.beatGrid;
  if (!beatGrid || beatGrid.beats.length === 0) return null;

  const position = getCurrentPosition(deckId);
  const beats = beatGrid.beats;
  const downbeats = beatGrid.downbeats;

  // Find nearest beat
  let nearestBeatIdx = 0;
  let nearestBeatDist = Math.abs(position - beats[0]);
  for (let i = 1; i < beats.length; i++) {
    const dist = Math.abs(position - beats[i]);
    if (dist < nearestBeatDist) {
      nearestBeatDist = dist;
      nearestBeatIdx = i;
    }
    if (beats[i] > position + nearestBeatDist) break; // Early exit — beats are sorted
  }

  // Compute beat phase (0 = on beat, 0.5 = between beats)
  const beatPeriod = beatGrid.bpm > 0 ? 60 / beatGrid.bpm : 0.5;
  const beatPhase = ((position - beats[nearestBeatIdx]) % beatPeriod + beatPeriod) % beatPeriod / beatPeriod;

  // Find nearest downbeat
  let nearestDownbeatIdx = 0;
  if (downbeats.length > 0) {
    let downbeatDist = Math.abs(position - downbeats[0]);
    for (let i = 1; i < downbeats.length; i++) {
      const dist = Math.abs(position - downbeats[i]);
      if (dist < downbeatDist) {
        downbeatDist = dist;
        nearestDownbeatIdx = i;
      }
      if (downbeats[i] > position + downbeatDist) break;
    }
  }

  // Bar phase
  const barPeriod = beatPeriod * beatGrid.timeSignature;
  const barRef = downbeats.length > 0 ? downbeats[nearestDownbeatIdx] : beats[0];
  const barPhase = ((position - barRef) % barPeriod + barPeriod) % barPeriod / barPeriod;

  return {
    position,
    nearestBeatIdx,
    nearestBeatTime: beats[nearestBeatIdx],
    beatPhase,
    nearestDownbeatIdx,
    barPhase,
  };
}

function seekDeck(deckId: DeckId, targetSec: number): void {
  try {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    const state = useDJStore.getState().decks[deckId];

    if (deck.playbackMode === 'audio') {
      deck.audioPlayer.seek(Math.max(0, targetSec));
      useDJStore.getState().setDeckState(deckId, {
        audioPosition: targetSec,
        elapsedMs: targetSec * 1000,
      });
    } else {
      // For tracker mode, convert seconds back to song position
      const totalDuration = state.durationMs > 0 ? state.durationMs / 1000 : 1;
      const totalPositions = Math.max(state.totalPositions, 1);
      const targetPos = Math.min(
        Math.max(0, Math.floor((targetSec / totalDuration) * totalPositions)),
        totalPositions - 1,
      );
      deck.cue(targetPos, 0);
      useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
    }
  } catch {
    // Engine not ready
  }
}
