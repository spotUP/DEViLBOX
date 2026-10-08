/**
 * DJPerformanceContext (plan section 34): one object with the current state
 * every subsystem reads, built from the deck store, the deck analyses, the
 * session memory and the set plan. No subsystem reconstructs it.
 *
 * Pure given its inputs.
 */
import { barIndexAt } from './beatGrid';
import type { DJPerformanceContext, DJStyleProfile, DJTrackAnalysis, DJTrackCandidate, DJTransitionPlan, SessionMemorySnapshot, SetEnergyPhase } from './types';

export interface ContextInput {
  currentDeck: 'A' | 'B';
  incomingDeck?: 'A' | 'B';
  currentTrack: DJTrackAnalysis | null;
  incomingTrack: DJTrackAnalysis | null;
  currentPosition: number;
  timeRemainingSec: number;
  setPhase: SetEnergyPhase;
  targetEnergy: number;
  memory: SessionMemorySnapshot;
  candidates: DJTrackCandidate[];
  transition?: DJTransitionPlan;
  style: DJStyleProfile;
  creativeRisk: number;
}

export function buildPerformanceContext(input: ContextInput): DJPerformanceContext {
  const a = input.currentTrack;
  let currentBeat = 0, currentBar = 0;
  let currentPhrase: DJPerformanceContext['currentPhrase'];
  let currentSection: DJPerformanceContext['currentSection'];
  if (a) {
    const beats = a.beatGrid.beats;
    if (beats.length) {
      let lo = 0, hi = beats.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (beats[mid].time <= input.currentPosition) lo = mid; else hi = mid - 1; }
      currentBeat = lo;
    } else if (a.bpm > 0) currentBeat = Math.floor(input.currentPosition / (60 / a.bpm));
    currentBar = barIndexAt(a.downbeats, input.currentPosition);
    currentPhrase = a.phrases.find((p) => p.start <= input.currentPosition && input.currentPosition < p.end);
    currentSection = a.sections.find((s) => s.start <= input.currentPosition && input.currentPosition < s.end);
  }
  const setEnergy = a ? a.energy.perceivedIntensity : (input.memory.recentEnergy[input.memory.recentEnergy.length - 1] ?? 0.5);
  const confidence = Math.min(a?.analysisConfidence.overall ?? 0, input.incomingTrack?.analysisConfidence.overall ?? (a ? 1 : 0));
  return {
    currentDeck: input.currentDeck,
    incomingDeck: input.incomingDeck,
    currentTrack: a,
    incomingTrack: input.incomingTrack,
    currentPosition: input.currentPosition,
    currentBeat,
    currentBar,
    currentPhrase,
    currentSection,
    timeRemainingSec: input.timeRemainingSec,
    setEnergy,
    targetEnergy: input.targetEnergy,
    setPhase: input.setPhase,
    recentHistory: input.memory,
    candidateTracks: input.candidates,
    transition: input.transition,
    style: input.style,
    creativeRisk: input.creativeRisk,
    confidence,
  };
}
