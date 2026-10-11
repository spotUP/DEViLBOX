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
import { getDJEngine, getDJEngineIfActive } from './DJEngine';
import { setDeckPitch } from './DJActions';
import type { DeckId } from './DeckEngine';
import type { BeatGridData } from './DJAudioCache';
import { clockNowMs, deckPositionAt } from '@/engine/audioLatency';

// ── Types ────────────────────────────────────────────────────────────────────

export type SyncMode = 'bpm' | 'beat' | 'bar';

interface PhaseInfo {
  /** Current position in seconds */
  position: number;
  /** Index of the beat in progress: the last grid beat at or before the position (-1 before the first beat) */
  beatIdx: number;
  /** How far into the beat in progress the position is, from the grid (0 = on the beat, 1 = next beat) */
  beatFraction: number;
  /** Beat of the bar in progress, 0-based (0 = downbeat); -1 before the first beat */
  beatInBar: number;
  /** Phase within the beat period (0-1, where 0 = on beat), referenced to the nearest beat */
  beatPhase: number;
  /** Phase within current bar (0-1, where 0 = on downbeat) */
  barPhase: number;
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Max semitone shift applied by auto-sync. Anything beyond ±4 semitones starts
 * to sound chipmunk'd or muddy — if BPMs can't be matched within this window
 * (even with half/double-time fallback), we'd rather have a small tempo
 * mismatch than a musically ruined tune. Users can still manually push pitch
 * further via the pitch fader (engine clamp is ±16).
 */
const AUTO_SYNC_MAX_SEMITONES = 4;

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

  // The one pitch action: it moves the deck engine's playback rate AND the
  // store. Writing only the store left the incoming deck at its own tempo
  // while the UI showed it matched.
  setDeckPitch(deckId, clamped);

  return clamped;
}

/**
 * How a phase correction moves the deck: 'auto' bends the rate of a playing
 * deck (never a seek - a seek of a playing deck is an audible skip and a
 * platter jump) and seeks a stopped one; 'seek' always snaps (the user's own
 * sync key).
 */
export type PhaseAlignMethod = 'auto' | 'seek';

/**
 * Phase-align this deck to the other deck's beat grid: beats (or downbeats
 * for bar sync) of this deck land on the other deck's.
 *
 * @param mode - 'beat' aligns to nearest beat, 'bar' aligns to nearest downbeat
 * @param method - 'auto': bend a playing deck, seek a stopped one; 'seek': always seek
 */
export function phaseAlign(
  deckId: DeckId,
  otherDeckId: DeckId,
  mode: SyncMode = 'beat',
  method: PhaseAlignMethod = 'auto',
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

  const errorSec = phaseDiff * period;
  if (method === 'auto' && isDeckPlaying(deckId)) {
    bendToPhase(deckId, errorSec);
    return;
  }

  const seekTarget = thisPosition + errorSec;
  if (seekTarget < 0) return; // don't seek before start

  seekDeck(deckId, seekTarget);
}

/** Phase errors below this are inaudible and left alone (seconds). */
const BEND_DEADBAND_SEC = 0.003;
/** Bend amount bounds (fraction of the rest rate) and the time a small error takes to close. */
const BEND_MIN = 0.01;
const BEND_MAX = 0.06;
const BEND_TARGET_SEC = 2;

/**
 * Close a phase error on a playing deck with a rate bend: `errorSec` (in this
 * deck's track time, positive = this deck is behind) is gained back by
 * playing up to 6 % faster or slower - at least 1 %, finished in about 2 s for
 * small errors. The bend length accounts for the deck's fader rate, since a
 * bend of `amount` gains `rest * amount` track seconds per second.
 */
export function bendToPhase(deckId: DeckId, errorSec: number): void {
  if (!Number.isFinite(errorSec) || Math.abs(errorSec) < BEND_DEADBAND_SEC) return;
  const amount = Math.min(BEND_MAX, Math.max(BEND_MIN, Math.abs(errorSec) / BEND_TARGET_SEC));
  const rest = Math.pow(2, (useDJStore.getState().decks[deckId].pitchOffset || 0) / 12);
  const durationMs = (Math.abs(errorSec) / (rest * amount)) * 1000;
  getDJEngine().getDeck(deckId).bendRate(errorSec > 0 ? 1 + amount : 1 - amount, durationMs);
}

/** Whether a deck is audibly playing: the engine first, the store when the engine is not up. */
function isDeckPlaying(deckId: DeckId): boolean {
  try { return getDJEngine().getDeck(deckId).isPlaying(); } catch { return useDJStore.getState().decks[deckId].isPlaying; }
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

/** A deck's effective BPM: its base BPM at a pitch offset in semitones, to 0.01 BPM. */
export function pitchedBpm(baseBpm: number, semitones: number): number {
  return Math.round(baseBpm * Math.pow(2, semitones / 12) * 100) / 100;
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

/**
 * The heard position now. An audio deck answers itself
 * (DeckEngine.getHeardPosition: played position minus output and key-lock
 * latency) - the store anchor lags a seek until the next 20 Hz deck-state
 * write, so a phase correction right after a seek + play measured the deck
 * where it was before the seek. Otherwise (tracker decks, engine not up) the
 * deck's clock anchor extrapolated to this moment, so beat events land on the
 * frame they are heard instead of the next store write.
 */
function getCurrentPosition(deckId: DeckId): number {
  const state = useDJStore.getState().decks[deckId];
  try {
    const deck = getDJEngineIfActive()?.getDeck(deckId);
    if (deck?.playbackMode === 'audio') {
      const pos = deck.getHeardPosition();
      if (Number.isFinite(pos)) return state.durationMs > 0 ? Math.min(pos, state.durationMs / 1000) : pos;
    }
  } catch { /* engine not ready: the store anchor */ }
  return deckPositionAt(state, clockNowMs());
}

export function getPhaseInfo(deckId: DeckId): PhaseInfo | null {
  const state = useDJStore.getState().decks[deckId];
  const beatGrid = state.beatGrid;
  if (!beatGrid || beatGrid.beats.length === 0) return null;
  return phaseAt(beatGrid, getCurrentPosition(deckId));
}

/** Index of the last entry of a sorted list at or before `t`; -1 when `t` precedes them all. */
function floorIndex(sorted: number[], t: number): number {
  let lo = 0, hi = sorted.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/** Index of the entry of a sorted list nearest to `t` (the list is non-empty). */
function nearestIndex(sorted: number[], t: number): number {
  const f = floorIndex(sorted, t);
  if (f < 0) return 0;
  if (f >= sorted.length - 1) return f;
  return t - sorted[f] <= sorted[f + 1] - t ? f : f + 1;
}

/**
 * Beat and bar phase of a beat grid at a position (seconds). Pure.
 *
 * The current beat is the last grid beat at or before the position (a beat
 * event happens when the heard position CROSSES a beat), never the nearest
 * one - the nearest beat flips half a beat early.
 */
export function phaseAt(beatGrid: BeatGridData, position: number): PhaseInfo | null {
  const beats = beatGrid.beats;
  const downbeats = beatGrid.downbeats;
  if (beats.length === 0) return null;
  const beatPeriod = beatGrid.bpm > 0 ? 60 / beatGrid.bpm : 0.5;
  const timeSignature = beatGrid.timeSignature > 0 ? beatGrid.timeSignature : 4;

  // The beat in progress and how far into it the position is, from the grid.
  const beatIdx = floorIndex(beats, position);
  let beatFraction = 0;
  if (beatIdx >= 0) {
    const next = beatIdx + 1 < beats.length ? beats[beatIdx + 1] : beats[beatIdx] + beatPeriod;
    const len = next - beats[beatIdx];
    beatFraction = len > 0 ? Math.min(1, Math.max(0, (position - beats[beatIdx]) / len)) : 0;
  }

  // Beat of the bar: grid beats counted from the bar's downbeat (the last
  // downbeat at or before the position; the first one before it).
  let beatInBar = -1;
  if (beatIdx >= 0) {
    let barBeatIdx = 0;
    if (downbeats.length > 0) {
      const d = Math.max(0, floorIndex(downbeats, position));
      barBeatIdx = nearestIndex(beats, downbeats[d]);
    }
    beatInBar = (((beatIdx - barBeatIdx) % timeSignature) + timeSignature) % timeSignature;
  }

  // Phase within the beat period, referenced to the nearest grid beat
  // (0 = on beat). Sync and quantize measure phase this way.
  const nearestBeatIdx = nearestIndex(beats, position);
  const beatPhase = ((position - beats[nearestBeatIdx]) % beatPeriod + beatPeriod) % beatPeriod / beatPeriod;

  // Bar phase, referenced to the nearest downbeat.
  const barPeriod = beatPeriod * timeSignature;
  const barRef = downbeats.length > 0 ? downbeats[nearestIndex(downbeats, position)] : beats[0];
  const barPhase = ((position - barRef) % barPeriod + barPeriod) % barPeriod / barPeriod;

  return { position, beatIdx, beatFraction, beatInBar, beatPhase, barPhase };
}

/**
 * True when a beat-event consumer (flash, lights) should fire: the current
 * beat changed since the previous reading and the position is on a beat.
 * `prevBeatIdx` null means there was no previous reading (no event).
 */
export function beatCrossed(prevBeatIdx: number | null, beatIdx: number): boolean {
  return prevBeatIdx !== null && beatIdx >= 0 && beatIdx !== prevBeatIdx;
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
