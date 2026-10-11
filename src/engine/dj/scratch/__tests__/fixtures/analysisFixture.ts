/** A hand-built DJTrackAnalysis and performance context for the scratch tests (120 BPM, first beat 0.18 s). */
import type { DJPerformanceContext, DJTrackAnalysis } from '../../../autodj/types';

/** A 120 BPM, 4/4 track whose first beat is at 0.18 s; 100 bars; 8-bar phrases; vocal timeline ramps with time. */
export function fixtureAnalysis(): DJTrackAnalysis {
  const beatSec = 0.5, firstBeat = 0.18, nBeats = 400;
  const beats = Array.from({ length: nBeats }, (_, i) => ({ time: firstBeat + i * beatSec, index: i, strength: 1, isDownbeat: i % 4 === 0 }));
  const bars = Array.from({ length: nBeats / 4 }, (_, i) => ({ index: i, start: firstBeat + i * 2, end: firstBeat + (i + 1) * 2, downbeat: firstBeat + i * 2, beats: [i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3], complete: true }));
  const hop = 0.5;
  const ramp = Array.from({ length: 200 }, (_, i) => Math.min(1, i / 200));
  const flat = (v: number) => ({ hopSec: hop, values: Array(200).fill(v) as number[], confidence: 0.9 });
  return {
    id: 'fixture', durationSec: 200, version: 1, bpm: 120, bpmConfidence: 0.9, tempoSource: 'audio',
    beatGrid: { bpm: 120, firstBeat, beats, confidence: 0.92 },
    downbeats: { bars, confidence: 0.9 },
    meter: { beatsPerBar: 4, confidence: 0.9, alternatives: [] },
    sections: [
      { kind: 'intro', start: 0, end: 32, startBar: 0, endBar: 16, confidence: 0.8, energy: 0.3, alternatives: [] },
      { kind: 'chorus', start: 32, end: 64, startBar: 16, endBar: 32, confidence: 0.8, energy: 0.8, alternatives: [] },
      { kind: 'breakdown', start: 64, end: 96, startBar: 32, endBar: 48, confidence: 0.8, energy: 0.4, alternatives: [] },
    ],
    phrases: Array.from({ length: 12 }, (_, i) => ({ index: i, start: i * 16, end: (i + 1) * 16, startBar: i * 8, lengthBars: 8, confidence: 0.85, sectionIndex: Math.floor(i / 2) })),
    phraseLengthBars: 8,
    vocalActivity: { hopSec: hop, values: ramp, confidence: 0.9 },
    drumActivity: flat(0.7), bassActivity: flat(0.6), harmonicActivity: flat(0.2), intensity: flat(0.55),
  } as unknown as DJTrackAnalysis;
}

export function fixturePerf(track: DJTrackAnalysis, position: number, over: Partial<DJPerformanceContext> = {}): DJPerformanceContext {
  return {
    currentDeck: 'A', currentTrack: track, incomingTrack: null, currentPosition: position, currentBeat: 0, currentBar: 0,
    timeRemainingSec: 100, setEnergy: 0.5, targetEnergy: 0.7, setPhase: 'CRUISING', candidateTracks: [], creativeRisk: 0.3, confidence: 0.8,
    ...over,
  } as unknown as DJPerformanceContext;
}
