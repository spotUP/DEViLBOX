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
 * Max semitone shift applied by auto-sync. Anything beyond ±3 semitones starts
 * to sound chipmunk'd or muddy — if BPMs can't be matched within this window
 * (even with half/double-time fallback), we'd rather have a small tempo
 * mismatch than a musically ruined tune. Users can still manually push pitch
 * further via the pitch fader (engine clamp is ±16).
 */
const AUTO_SYNC_MAX_SEMITONES = 3;

/**
 * Sync one deck's BPM to another using the most accurate BPM source available.
 *
 * Priority: analysis BPM > Serato BPM > tracker-detected BPM
 *
 * Considers half-time and double-time as match candidates so a 170 BPM track
 * and an 85 BPM track sync cleanly at 0 semitones. Clamps the final shift to
 * ±AUTO_SYNC_MAX_SEMITONES.
 *
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

  // Pick the BPM ratio that needs the least pitch shift — direct, half-time
  // (source was playing double-time), or double-time (source was half-time).
  const candidates = [
    targetBPM / sourceBPM,
    targetBPM / (sourceBPM * 2),
    (targetBPM * 2) / sourceBPM,
  ];
  const bestRatio = candidates.reduce((best, r) =>
    Math.abs(Math.log2(r)) < Math.abs(Math.log2(best)) ? r : best
  );

  const semitones = 12 * Math.log2(bestRatio);
  const clamped = Math.max(-AUTO_SYNC_MAX_SEMITONES, Math.min(AUTO_SYNC_MAX_SEMITONES, semitones));

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

  const thisState = store.decks[deckId];
  if (!thisState.beatGrid) return;

  const otherPhase = getPhaseInfo(otherDeckId);
  const thisPhase = getPhaseInfo(deckId);
  if (!otherPhase || !thisPhase) return;

  const thisPosition = getCurrentPosition(deckId);
  const beatPeriod = thisState.beatGrid.bpm > 0 ? 60 / thisState.beatGrid.bpm : 0.5;
  const barPeriod = beatPeriod * thisState.beatGrid.timeSignature;
  const period = mode === 'bar' ? barPeriod : beatPeriod;

  const otherPh = mode === 'bar' ? otherPhase.barPhase : otherPhase.beatPhase;
  const thisPh = mode === 'bar' ? thisPhase.barPhase : thisPhase.beatPhase;

  // Minimal phase correction: how much to nudge this deck so phases match
  // Normalize to [-0.5, 0.5] so we never shift more than half a period
  let phaseDiff = otherPh - thisPh;
  if (phaseDiff > 0.5) phaseDiff -= 1;
  if (phaseDiff < -0.5) phaseDiff += 1;

  const seekTarget = thisPosition + phaseDiff * period;
  if (seekTarget < 0) return; // don't seek before start

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

/**
 * Quantized play: Start playback of a deck on the next beat/bar boundary of
 * the master deck (the other playing deck). This makes mixing much easier!
 * 
 * @param deckId - The deck to start playing
 * @param mode - 'beat' for next beat, 'bar' for next downbeat (recommended)
 * @returns Promise that resolves when playback starts, or immediately if no master
 */
export async function quantizedPlay(
  deckId: DeckId,
  mode: 'beat' | 'bar' = 'bar',
): Promise<void> {
  const store = useDJStore.getState();
  const otherDeckId: DeckId = deckId === 'A' ? 'B' : deckId === 'B' ? 'A' : 'A';
  const otherDeck = store.decks[otherDeckId];
  
  // If other deck isn't playing or doesn't have a beat grid, just play immediately
  if (!otherDeck.isPlaying || !otherDeck.beatGrid) {
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    await deck.play();
    store.setDeckPlaying(deckId, true);
    return;
  }
  
  // Sync BPM first (this also sets up the pitch)
  syncBPMToOther(deckId, otherDeckId);
  
  // Calculate delay until the next beat/bar boundary of the playing deck
  const delay = mode === 'bar' 
    ? timeToNextDownbeat(otherDeckId) 
    : timeToNextBeat(otherDeckId);
  
  // If delay is very short (< 50ms), wait for the NEXT boundary instead
  // This prevents starting mid-beat due to timing jitter
  const beatPeriod = 60 / (otherDeck.beatGrid.bpm || 120);
  const barPeriod = beatPeriod * (otherDeck.beatGrid.timeSignature || 4);
  const period = mode === 'bar' ? barPeriod : beatPeriod;
  const effectiveDelay = delay < 0.05 ? delay + period : delay;
  
  // Set a pending state for visual feedback (optional)
  console.log(`[DJAutoSync] Quantized play: waiting ${(effectiveDelay * 1000).toFixed(0)}ms for ${mode}`);
  
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        
        // Phase-align just before starting so we're perfectly in sync
        const thisDeckState = useDJStore.getState().decks[deckId];
        if (thisDeckState.beatGrid) {
          phaseAlign(deckId, otherDeckId, mode);
        }
        
        await deck.play();
        useDJStore.getState().setDeckPlaying(deckId, true);
        resolve();
      } catch (err) {
        console.warn('[DJAutoSync] Quantized play failed:', err);
        resolve();
      }
    }, effectiveDelay * 1000);
  });
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

// ── Snap helpers (used by foolproof quantize wiring) ─────────────────────────

/**
 * Snap a position (in seconds) to the nearest beat or downbeat in this deck's
 * own beat grid. Returns the input unchanged if no grid is available.
 *
 * Used by cueDeck / triggerHotCue / setAudioLoop to ensure stored positions
 * always sit on the grid.
 */
export function snapPositionToBeat(
  deckId: DeckId,
  positionSec: number,
  mode: 'beat' | 'bar' = 'beat',
): number {
  const state = useDJStore.getState().decks[deckId];
  const grid = state.beatGrid;
  if (!grid) return positionSec;
  const arr = mode === 'bar' ? grid.downbeats : grid.beats;
  if (!arr || arr.length === 0) return positionSec;

  // Binary search for nearest entry
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < positionSec) lo = mid + 1;
    else hi = mid;
  }
  const candA = arr[lo];
  const candB = lo > 0 ? arr[lo - 1] : candA;
  return Math.abs(candA - positionSec) < Math.abs(candB - positionSec) ? candA : candB;
}

/**
 * Snap a loop length (in beats) to the nearest power-of-2 in [0.25, 16].
 * Used by setAudioLoop and activateSeratoLoop to keep loops musical.
 */
const LOOP_LENGTHS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;
export function snapLoopLength(beats: number): number {
  if (!Number.isFinite(beats) || beats <= 0) return LOOP_LENGTHS[0];
  let best: number = LOOP_LENGTHS[0];
  let bestDist = Math.abs(beats - best);
  for (let i = 1; i < LOOP_LENGTHS.length; i++) {
    const d = Math.abs(beats - LOOP_LENGTHS[i]);
    if (d < bestDist) {
      bestDist = d;
      best = LOOP_LENGTHS[i];
    }
  }
  return best;
}

/**
 * Auto-match this deck to the other (master) deck if the master is currently
 * playing and both decks have analysis-derived beat grids.
 *
 * Called by DJPipeline once a freshly-loaded deck's beat grid is populated.
 * Result: load → press play and the new deck drops in on the next bar.
 */
export function autoMatchOnLoad(deckId: DeckId): void {
  const otherDeckId: DeckId = deckId === 'A' ? 'B' : deckId === 'B' ? 'A' : 'A';
  const store = useDJStore.getState();
  const thisDeck = store.decks[deckId];
  const otherDeck = store.decks[otherDeckId];

  if (!otherDeck.isPlaying) return;
  if (!otherDeck.beatGrid || !thisDeck.beatGrid) return;

  syncBPMToOther(deckId, otherDeckId);
  // Pre-phase-align to the bar grid so quantizedPlay drops in cleanly later.
  phaseAlign(deckId, otherDeckId, 'bar');
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

export function getPhaseInfo(deckId: DeckId): PhaseInfo | null {
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
