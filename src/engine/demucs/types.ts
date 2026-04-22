/**
 * Stem names for 4-stem (htdemucs) and 6-stem (htdemucs_6s) models.
 */
export const STEM_NAMES_4S = ['drums', 'bass', 'other', 'vocals'] as const;
export const STEM_NAMES_6S = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'] as const;

export type StemName4 = typeof STEM_NAMES_4S[number];
export type StemName6 = typeof STEM_NAMES_6S[number];
export type StemName = StemName4 | StemName6;

export type DemucsModelType = '4s' | '6s';

export interface StemData {
  left: Float32Array;
  right: Float32Array;
}

/** Full separation result keyed by stem name */
export type StemResult = Record<string, StemData>;

/** Stem cache entry stored in IndexedDB alongside DJAudioCache */
export interface CachedStems {
  hash: string;           // Same SHA-256 hash as DJAudioCache entry
  model: DemucsModelType;
  sampleRate: number;
  numSamples: number;
  /** Per-stem stereo PCM stored as interleaved Float32Array for compact storage */
  stems: Record<string, ArrayBuffer>; // stem name → interleaved L/R Float32
  timestamp: number;
}

export type StemState = 'none' | 'downloading-model' | 'separating' | 'ready' | 'error';

/** Messages from main thread → worker */
export type DemucsWorkerRequest =
  | { type: 'init'; modelData: ArrayBuffer }
  | { type: 'separate'; id: string; left: Float32Array; right: Float32Array; sampleRate: number }
  | { type: 'terminate' };

/** Messages from worker → main thread */
export type DemucsWorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; id: string; progress: number; message: string }
  | { type: 'complete'; id: string; stems: Record<string, { left: Float32Array; right: Float32Array }> }
  | { type: 'error'; id: string; error: string }
  | { type: 'log'; message: string };
