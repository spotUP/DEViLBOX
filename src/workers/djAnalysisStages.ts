/**
 * The DJ analysis worker's stage sequence as a pure function, so the product
 * path (worker message -> result) can be driven in a test with the essentia
 * stages stubbed and the extended analysis real.
 *
 * The worker passes its essentia-backed stage functions in; this module adds
 * the Auto DJ extended analysis (activity timelines, loudness set, spectral,
 * chroma) to the result.
 */
import { computeExtendedAnalysis } from '@/engine/dj/autodj/activityTimelines';
import type { ExtendedAnalysis } from '@/engine/dj/autodj/types';

export interface StageGenreResult {
  primary: string;
  subgenre: string;
  confidence: number;
  mood: string;
  energy: number;
  danceability: number;
}

export interface StageAnalysisResult {
  bpm: number;
  bpmConfidence: number;
  beats: number[];
  downbeats: number[];
  timeSignature: number;
  musicalKey: string;
  keyConfidence: number;
  onsets: number[];
  frequencyPeaks: number[][];
  rmsDb: number;
  peakDb: number;
  genre: StageGenreResult;
  extended: ExtendedAnalysis;
}

export interface StageInput<Hints> {
  pcmLeft: Float32Array;
  pcmRight: Float32Array | null;
  sampleRate: number;
  numBins: number;
  instrumentHints?: Hints;
}

export interface StageDeps<Hints> {
  mixToMono(left: Float32Array, right: Float32Array | null): Float32Array;
  analyzeRhythm(mono: Float32Array): { bpm: number; confidence: number; beats: number[] };
  analyzeKey(mono: Float32Array, sampleRate: number): { key: string; confidence: number };
  detectDownbeats(beats: number[], mono: Float32Array, sampleRate: number): { downbeats: number[]; timeSignature: number };
  computeFrequencyPeaks(left: Float32Array, right: Float32Array | null, sampleRate: number, numBins: number): number[][];
  computeLoudness(mono: Float32Array): { rmsDb: number; peakDb: number };
  classifyGenre(
    bpm: number, key: string, timeSignature: number, frequencyPeaks: number[][], rmsDb: number,
    beats: number[], mono: Float32Array, sampleRate: number, hints?: Hints,
  ): StageGenreResult;
}

export function runAnalysisStages<Hints>(
  input: StageInput<Hints>,
  deps: StageDeps<Hints>,
  progress: (percent: number) => void = () => {},
): StageAnalysisResult {
  const { pcmLeft, pcmRight, sampleRate, numBins } = input;
  const mono = deps.mixToMono(pcmLeft, pcmRight);
  progress(10);
  const rhythm = deps.analyzeRhythm(mono);
  progress(40);
  const keyResult = deps.analyzeKey(mono, sampleRate);
  progress(60);
  const { downbeats, timeSignature } = deps.detectDownbeats(rhythm.beats, mono, sampleRate);
  progress(70);
  const frequencyPeaks = deps.computeFrequencyPeaks(pcmLeft, pcmRight, sampleRate, numBins);
  progress(80);
  const loudness = deps.computeLoudness(mono);
  progress(85);
  const genre = deps.classifyGenre(
    rhythm.bpm, keyResult.key, timeSignature, frequencyPeaks, loudness.rmsDb, rhythm.beats, mono, sampleRate, input.instrumentHints,
  );
  progress(90);
  // Auto DJ extended analysis: one pass for the activity timelines, loudness
  // set, spectral balance and chroma (plan sections 4, 22, 49, 50).
  const extended = computeExtendedAnalysis(mono, sampleRate, { beats: rhythm.beats });
  progress(98);
  return {
    bpm: rhythm.bpm,
    bpmConfidence: rhythm.confidence,
    beats: rhythm.beats,
    downbeats,
    timeSignature,
    musicalKey: keyResult.key,
    keyConfidence: keyResult.confidence,
    onsets: rhythm.beats,
    frequencyPeaks,
    rmsDb: loudness.rmsDb,
    peakDb: loudness.peakDb,
    genre,
    extended,
  };
}
