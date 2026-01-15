/**
 * Audio Types - Audio Engine State & Playback
 */

import type * as Tone from 'tone';

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentRow: number;
  currentPatternId: string;
  loop: boolean;
}

export interface TransportState {
  bpm: number; // 20-999
  timeSignature: [number, number]; // e.g., [4, 4]
  swing: number; // 0-100%
  position: string; // Tone.js transport position
}

export interface AudioEngineState {
  initialized: boolean;
  contextState: 'suspended' | 'running' | 'closed';
  masterVolume: number; // -60 to 0 dB
  masterMuted: boolean;
  playback: PlaybackState;
  transport: TransportState;
  analyserNode: Tone.Analyser | null;
  fftNode: Tone.FFT | null;
}

export interface ScheduledNote {
  time: number;
  note: string;
  duration: number;
  velocity: number;
  instrumentId: number;
  channelIndex: number;
  rowIndex: number;
  // TB-303 specific
  accent?: boolean;
  slide?: boolean;
  // Automation
  cutoff?: number;
  resonance?: number;
  pan?: number;
}

export interface EffectCommand {
  code: string; // e.g., "A0F", "C40"
  type: string; // e.g., "volumeSlide", "setVolume"
  parameters: number[];
  apply: (synth: any, time: number) => void;
}

export const DEFAULT_BPM = 135;
export const DEFAULT_MASTER_VOLUME = -6;
export const MIN_BPM = 20;
export const MAX_BPM = 999;
