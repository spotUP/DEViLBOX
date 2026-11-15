/**
 * Leaf module: beat-phase maths and the DJEngine accessor with no static import
 * of DJEngine/DeckEngine/DJActions. DubActions (reached from TrackerReplayer)
 * needs these; importing DJAutoSync instead pulled the whole DJ graph into the
 * song-persistence import cycle.
 */
import { useDJStore } from '@/stores/useDJStore';
import type { DJEngine } from './DJEngine';
import type { DeckId } from './DeckEngine';
import type { BeatGridData } from './DJAudioCache';
import { clockNowMs, deckPositionAt } from '@/engine/audioLatency';

let djEngineHolder: DJEngine | null = null;

/** DJEngine registers itself here on creation and clears it on dispose. */
export function setDJEngineHolder(engine: DJEngine | null): void {
  djEngineHolder = engine;
}

/** The existing DJEngine or null (does NOT create one). */
export function getDJEngineIfActive(): DJEngine | null {
  return djEngineHolder;
}

export interface PhaseInfo {
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
 * Schedule a callback to fire on the next downbeat boundary.
 * Returns a cancel function.
 */
export function onNextDownbeat(deckId: DeckId, callback: () => void): () => void {
  const delay = timeToNextDownbeat(deckId);
  const timer = setTimeout(callback, delay * 1000);
  return () => clearTimeout(timer);
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
export function getCurrentPosition(deckId: DeckId): number {
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

