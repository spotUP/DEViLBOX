/**
 * Drum-related types — DrumMachine, DrumKit, and drum type aliases
 */

export type DrumType = 'kick' | 'snare' | 'clap' | 'hihat' | 'tom' | 'cymbal' | 'cowbell' | 'rimshot' | 'conga' | 'clave' | 'maracas';

// Drum machine type selector (affects overall synthesis character)
export type DrumMachineType = '808' | '909';

export interface DrumMachineConfig {
  drumType: DrumType;
  machineType?: DrumMachineType; // '808' or '909' - affects synthesis character
  /**
   * How tracker notes map to this drum instrument:
   * - 'kit'   (default) — note NAME picks the drum, octave shifts pitch
   *           C=kick C#=snare D=closedHat … (see drumNoteMap.ts)
   * - 'pitch' — all notes play the configured drumType,
   *           note value shifts the tune parameter
   */
  noteMode?: 'kit' | 'pitch';
  kick?: {
    pitch: number;              // 30-100 Hz base frequency (808: 48Hz, 909: 80Hz)
    pitchDecay: number;         // 0-500ms pitch envelope duration
    tone: number;               // 0-100% tone/click (808: filter cutoff, 909: noise)
    toneDecay: number;          // 0-100ms tone decay (909: 20ms)
    decay: number;              // 50-2000ms amplitude decay (808: 50-300ms, 909: 300ms)
    drive: number;              // 0-100% saturation (808: 60%, 909: 50%)
    envAmount: number;          // 1-10x pitch envelope (808: ~2x from 98Hz to 48Hz, 909: 2.5)
    envDuration: number;        // 0-200ms pitch envelope (808: 110ms attack, 909: 50ms)
    filterFreq: number;         // Lowpass filter cutoff (808: 200-300Hz, 909: 3000Hz)
  };
  snare?: {
    pitch: number;              // 100-500 Hz body frequency
    pitchHigh?: number;         // 808 only: high oscillator (476Hz)
    tone: number;               // 0-100% body/snap balance
    toneDecay: number;          // Noise decay in ms
    snappy: number;             // 0-100% noise amount
    decay: number;              // 50-500ms amplitude decay
    envAmount: number;          // 1-10x pitch envelope
    envDuration: number;        // 0-50ms pitch envelope
    filterType: 'lowpass' | 'highpass' | 'bandpass' | 'notch';
    filterFreq: number;         // Filter frequency
  };
  hihat?: {
    tone: number;               // 0-100% dark/bright
    decay: number;              // 10-1000ms
    metallic: number;           // 0-100%
  };
  clap?: {
    tone: number;               // 0-100% filter frequency
    decay: number;              // 50-500ms overall decay
    toneDecay: number;          // Individual burst decay
    spread: number;             // 0-100ms burst spacing
    filterFreqs: [number, number]; // Serial filters
    modulatorFreq: number;      // Sawtooth modulator frequency
  };
  tom?: {
    pitch: number;              // 100-400 Hz
    decay: number;              // 100-500ms
    tone: number;               // 0-100% noise amount
    toneDecay: number;          // Noise decay
    envAmount: number;          // 1-5x pitch envelope
    envDuration: number;        // 50-200ms pitch envelope
  };
  conga?: {
    pitch: number;              // 165-455 Hz
    decay: number;              // 100-300ms
    tuning: number;             // 0-100% pitch interpolation within range
  };
  cowbell?: {
    decay: number;              // 10-500ms
    filterFreq: number;         // Bandpass center
  };
  rimshot?: {
    decay: number;              // 10-100ms
    filterFreqs: [number, number, number]; // Bandpass freqs
    filterQ: number;            // Resonance
    saturation: number;         // 1-5x saturation
  };
  clave?: {
    decay: number;              // 10-60ms
    pitch: number;              // Primary pitch
    pitchSecondary: number;     // Secondary pitch
    filterFreq: number;         // Bandpass center
  };
  maracas?: {
    decay: number;              // 10-100ms
    filterFreq: number;         // Highpass cutoff
  };
  cymbal?: {
    tone: number;               // 0-100% low/high band balance
    decay: number;              // 500-7000ms
  };
}

/**
 * Velocity Layer - Maps a velocity range to a specific sample within a key mapping
 */
export interface VelocityLayer {
  sampleId: string;
  sampleUrl?: string;
  sampleName?: string;
  velocityMin: number;   // 0-127
  velocityMax: number;   // 0-127
}

/**
 * Drumkit Key Mapping - Maps a note range to a sample
 */
export interface DrumKitKeyMapping {
  id: string;
  noteStart: number;
  noteEnd: number;
  sampleId: string;
  sampleUrl?: string;
  sampleName?: string;
  pitchOffset: number;
  fineTune: number;
  volumeOffset: number;
  panOffset: number;
  baseNote?: string;
  velocityLayers?: VelocityLayer[];        // Velocity-switched sample layers
  roundRobinGroup?: number;                 // Group ID for round-robin cycling (0 = off)
}

/**
 * DrumKit Configuration - Multi-sample instrument
 */
export interface DrumKitConfig {
  keymap: DrumKitKeyMapping[];
  defaultSampleId?: string;
  polyphony: 'poly' | 'mono';
  maxVoices: number;
  noteCut: boolean;
}
