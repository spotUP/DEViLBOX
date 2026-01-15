/**
 * Instrument Types - Synth Engine Definitions
 */

export type SynthType =
  | 'Synth'
  | 'MonoSynth'
  | 'DuoSynth'
  | 'FMSynth'
  | 'AMSynth'
  | 'PluckSynth'
  | 'MetalSynth'
  | 'MembraneSynth'
  | 'NoiseSynth'
  | 'TB303'
  | 'Sampler'
  | 'Player';

export type WaveformType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

export interface OscillatorConfig {
  type: WaveformType;
  detune: number; // -100 to 100 cents
  octave: number; // -2 to 2
}

export interface EnvelopeConfig {
  attack: number; // 0-2000ms
  decay: number; // 0-2000ms
  sustain: number; // 0-100%
  release: number; // 0-5000ms
}

export interface FilterConfig {
  type: FilterType;
  frequency: number; // 20Hz-20kHz
  Q: number; // 0-100 (resonance)
  rolloff: -12 | -24 | -48 | -96;
}

export interface FilterEnvelopeConfig {
  baseFrequency: number; // Hz
  octaves: number; // 0-8
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/**
 * Devil Fish Mod Configuration
 * Based on Robin Whittle's Devil Fish modifications to the TB-303
 * Expands the 5-dimensional TB-303 sound space to 14 dimensions
 */
export interface DevilFishConfig {
  enabled: boolean;

  // Envelope controls
  normalDecay: number;    // 30-3000ms - MEG (Main Envelope Generator) decay for normal notes
  accentDecay: number;    // 30-3000ms - MEG decay for accented notes
  vegDecay: number;       // 16-3000ms - VEG (Volume Envelope Generator) decay
  vegSustain: number;     // 0-100% - VEG sustain level (100% = infinite notes)
  softAttack: number;     // 0.3-30ms - attack time for non-accented notes

  // Filter controls
  filterTracking: number; // 0-200% - filter frequency tracks note pitch
  filterFM: number;       // 0-100% - VCA output feeds back to filter frequency (audio-rate FM)

  // Accent controls
  sweepSpeed: 'fast' | 'normal' | 'slow'; // Accent sweep circuit behavior
  accentSweepEnabled: boolean;            // Enable/disable accent sweep circuit

  // Resonance mode
  highResonance: boolean; // Enable filter self-oscillation at mid/high frequencies

  // Output processing
  muffler: 'off' | 'soft' | 'hard'; // Soft clipping on VCA output
}

export interface TB303Config {
  oscillator: {
    type: 'sawtooth' | 'square';
  };
  filter: {
    cutoff: number; // 200Hz-20kHz
    resonance: number; // 0-100%
  };
  filterEnvelope: {
    envMod: number; // 0-100%
    decay: number; // 30ms-3s
  };
  accent: {
    amount: number; // 0-100%
  };
  slide: {
    time: number; // 60ms-360ms (Devil Fish extends original TB-303 range)
    mode: 'linear' | 'exponential';
  };
  overdrive?: {
    amount: number; // 0-100%
  };
  // Devil Fish modifications (optional - for backward compatibility)
  devilFish?: DevilFishConfig;
}

export type EffectType =
  | 'Distortion'
  | 'Reverb'
  | 'Delay'
  | 'Chorus'
  | 'Phaser'
  | 'Tremolo'
  | 'Vibrato'
  | 'Compressor'
  | 'EQ3'
  | 'Filter'
  | 'BitCrusher'
  | 'Chebyshev'
  | 'FrequencyShifter'
  | 'PingPongDelay'
  | 'PitchShift'
  | 'AutoFilter'
  | 'AutoPanner'
  | 'AutoWah'
  | 'FeedbackDelay'
  | 'JCReverb'
  | 'StereoWidener';

export interface EffectConfig {
  id: string;
  type: EffectType;
  enabled: boolean;
  wet: number; // 0-100%
  parameters: Record<string, any>;
}

export interface InstrumentConfig {
  id: number; // 0x00-0xFF
  name: string;
  synthType: SynthType;
  oscillator?: OscillatorConfig;
  envelope?: EnvelopeConfig;
  filter?: FilterConfig;
  filterEnvelope?: FilterEnvelopeConfig;
  tb303?: TB303Config;
  effects: EffectConfig[];
  volume: number; // -60 to 0 dB
  pan: number; // -100 to 100
  parameters?: Record<string, any>; // Additional synth-specific parameters (e.g., sample URLs)
}

export interface InstrumentPreset {
  id: string;
  name: string;
  category: 'Bass' | 'Lead' | 'Pad' | 'Drum' | 'FX';
  tags: string[];
  author?: string;
  config: Omit<InstrumentConfig, 'id'>;
}

export interface InstrumentState {
  instruments: InstrumentConfig[];
  currentInstrumentId: number | null;
  presets: InstrumentPreset[];
}

export const DEFAULT_OSCILLATOR: OscillatorConfig = {
  type: 'sawtooth',
  detune: 0,
  octave: 0,
};

export const DEFAULT_ENVELOPE: EnvelopeConfig = {
  attack: 10,
  decay: 200,
  sustain: 50,
  release: 1000,
};

export const DEFAULT_FILTER: FilterConfig = {
  type: 'lowpass',
  frequency: 2000,
  Q: 1,
  rolloff: -24,
};

export const DEFAULT_TB303: TB303Config = {
  oscillator: {
    type: 'sawtooth',
  },
  filter: {
    cutoff: 800,
    resonance: 65,
  },
  filterEnvelope: {
    envMod: 60,
    decay: 200,
  },
  accent: {
    amount: 70,
  },
  slide: {
    time: 60,
    mode: 'exponential',
  },
  overdrive: {
    amount: 0,
  },
};

/**
 * Default Devil Fish settings that produce TB-303-compatible sound
 * Based on manual's "Limiting the Devil Fish to TB-303 sounds" section
 */
export const DEFAULT_DEVIL_FISH: DevilFishConfig = {
  enabled: false,

  // Envelope defaults (TB-303 compatible)
  normalDecay: 200,      // Standard MEG decay
  accentDecay: 200,      // Accented notes fixed at ~200ms in TB-303
  vegDecay: 3000,        // TB-303 had fixed ~3-4 second VEG decay
  vegSustain: 0,         // No sustain in TB-303
  softAttack: 4,         // TB-303 had ~4ms delay + 3ms attack

  // Filter defaults (TB-303 compatible)
  filterTracking: 0,     // TB-303 filter didn't track pitch
  filterFM: 0,           // No filter FM in TB-303

  // Accent defaults (TB-303 compatible)
  sweepSpeed: 'normal',  // Standard TB-303 accent behavior
  accentSweepEnabled: true,

  // Resonance mode (TB-303 compatible)
  highResonance: false,  // Normal resonance range

  // Output (TB-303 compatible)
  muffler: 'off',        // No muffler in TB-303
};
