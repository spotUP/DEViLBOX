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
  | 'Player'
  | 'Wavetable'
  | 'GranularSynth'
  // New synths
  | 'SuperSaw'
  | 'PolySynth'
  | 'Organ'
  | 'DrumMachine'
  | 'ChipSynth'
  | 'PWMSynth'
  | 'StringMachine'
  | 'FormantSynth'
  // Module playback (libopenmpt)
  | 'ChiptuneModule';

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
  softAttack: number;     // 0.3-3000ms (exponential) - attack time for non-accented notes

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
  // Engine selection - 'accurate' uses Open303 AudioWorklet for authentic TB-303 sound
  engineType?: 'tonejs' | 'accurate'; // Default: 'accurate'

  // Tuning
  tuning?: number; // Master tuning in Hz (default: 440)

  // Tempo-relative envelopes (for slower tempos = longer sweeps)
  tempoRelative?: boolean; // Default: false (absolute ms), true = scale with BPM

  oscillator: {
    type: 'sawtooth' | 'square';
  };
  filter: {
    cutoff: number; // Stock: 314-2394Hz (exponential) | Devil Fish: 157-4788Hz (2× range)
    resonance: number; // 0-100%
  };
  filterEnvelope: {
    envMod: number; // Stock: 0-100% | Devil Fish: 0-300% (3× modulation depth)
    decay: number; // Stock: 200-2000ms (controls MEG) | Devil Fish: 16-3000ms (controls VEG when DF enabled)
  };
  accent: {
    amount: number; // 0-100%
  };
  slide: {
    time: number; // 2-360ms (stock TB-303 was fixed at 60ms, Devil Fish makes it variable)
    mode: 'linear' | 'exponential';
  };
  overdrive?: {
    amount: number; // 0-100%
    modelIndex?: number; // GuitarML model index
    drive?: number; // 0-100%
    dryWet?: number; // 0-100%
  };
  // Devil Fish modifications (optional - for backward compatibility)
  devilFish?: DevilFishConfig;
}

/**
 * Wavetable Synthesizer Configuration
 * Multi-voice wavetable synth with morphing and unison
 */
export interface WavetableConfig {
  wavetableId: string;              // Preset wavetable ID
  morphPosition: number;            // 0-100% - position in wavetable
  morphModSource: 'none' | 'lfo' | 'envelope';
  morphModAmount: number;           // 0-100%
  morphLFORate: number;             // 0.1-20 Hz
  unison: {
    voices: number;                 // 1-8 voices
    detune: number;                 // 0-100 cents spread
    stereoSpread: number;           // 0-100% panning spread
  };
  envelope: EnvelopeConfig;
  filter: {
    type: FilterType;
    cutoff: number;                 // 20-20000 Hz
    resonance: number;              // 0-100%
    envelopeAmount: number;         // -100 to 100%
  };
  filterEnvelope: EnvelopeConfig;
}

export const DEFAULT_WAVETABLE: WavetableConfig = {
  wavetableId: 'basic-saw',
  morphPosition: 0,
  morphModSource: 'none',
  morphModAmount: 50,
  morphLFORate: 2,
  unison: {
    voices: 1,
    detune: 10,
    stereoSpread: 50,
  },
  envelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  filter: {
    type: 'lowpass',
    cutoff: 8000,
    resonance: 20,
    envelopeAmount: 0,
  },
  filterEnvelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence
    release: 100,
  },
};

/**
 * Granular Synthesizer Configuration
 * Sample-based granular synth with grain manipulation
 */
export interface GranularConfig {
  sampleUrl: string;                // URL or base64 of source sample
  grainSize: number;                // 10-500ms - duration of each grain
  grainOverlap: number;             // 0-100% - overlap between grains
  playbackRate: number;             // 0.25-4x - playback speed
  detune: number;                   // -1200 to 1200 cents
  randomPitch: number;              // 0-100% - random pitch variation per grain
  randomPosition: number;           // 0-100% - random position variation in sample
  scanPosition: number;             // 0-100% - position in sample to read grains from
  scanSpeed: number;                // -100 to 100% - speed of scanning through sample
  density: number;                  // 1-16 - number of overlapping grain streams
  reverse: boolean;                 // Play grains in reverse
  envelope: {
    attack: number;                 // Grain attack (ms)
    release: number;                // Grain release (ms)
  };
  filter: {
    type: FilterType;
    cutoff: number;
    resonance: number;
  };
}

export const DEFAULT_GRANULAR: GranularConfig = {
  sampleUrl: '',
  grainSize: 100,
  grainOverlap: 50,
  playbackRate: 1,
  detune: 0,
  randomPitch: 0,
  randomPosition: 0,
  scanPosition: 0,
  scanSpeed: 0,
  density: 4,
  reverse: false,
  envelope: {
    attack: 10,
    release: 50,
  },
  filter: {
    type: 'lowpass',
    cutoff: 20000,
    resonance: 0,
  },
};

/**
 * ChiptuneModule Configuration
 * Uses libopenmpt WASM for sample-accurate MOD/XM/IT/S3M playback
 * Provides audio-rate parameter modulation for authentic tracker effects
 */
export interface ChiptuneModuleConfig {
  moduleData: string;             // Base64-encoded original module file
  format: 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN';
  sourceFile?: string;            // Original filename for reference
  useLibopenmpt?: boolean;        // If true, use libopenmpt for playback (default: true)
  repeatCount?: number;           // -1 = infinite, 0 = once, >0 = n times
  stereoSeparation?: number;      // 0-200% stereo separation (100 = default)
  interpolationFilter?: number;   // 0 = none, 1 = linear, 2 = cubic, 8 = sinc
}

export const DEFAULT_CHIPTUNE_MODULE: ChiptuneModuleConfig = {
  moduleData: '',
  format: 'UNKNOWN',
  useLibopenmpt: true,
  repeatCount: 0,
  stereoSeparation: 100,
  interpolationFilter: 0,
};

/**
 * SuperSaw Synthesizer Configuration
 * Multiple detuned sawtooth oscillators for massive trance/EDM sounds
 */
export interface SuperSawConfig {
  voices: number;               // 3-9 oscillators (default 7)
  detune: number;               // 0-100 cents spread between voices
  mix: number;                  // 0-100% center vs side voices
  stereoSpread: number;         // 0-100% panning width
  envelope: EnvelopeConfig;
  filter: {
    type: FilterType;
    cutoff: number;             // 20-20000 Hz
    resonance: number;          // 0-100%
    envelopeAmount: number;     // -100 to 100%
  };
  filterEnvelope: EnvelopeConfig;
}

export const DEFAULT_SUPERSAW: SuperSawConfig = {
  voices: 7,
  detune: 30,
  mix: 50,
  stereoSpread: 80,
  envelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  filter: {
    type: 'lowpass',
    cutoff: 8000,
    resonance: 20,
    envelopeAmount: 0,
  },
  filterEnvelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence
    release: 100,
  },
};

/**
 * PolySynth Configuration
 * True polyphonic synth with voice management
 */
export interface PolySynthConfig {
  voiceCount: number;           // 1-16 max simultaneous voices
  voiceType: 'Synth' | 'FMSynth' | 'AMSynth';
  stealMode: 'oldest' | 'lowest' | 'highest';
  oscillator: OscillatorConfig;
  envelope: EnvelopeConfig;
  filter?: FilterConfig;
  filterEnvelope?: FilterEnvelopeConfig;
  portamento: number;           // 0-1000ms glide between notes
}

export const DEFAULT_POLYSYNTH: PolySynthConfig = {
  voiceCount: 8,
  voiceType: 'Synth',
  stealMode: 'oldest',
  oscillator: {
    type: 'sawtooth',
    detune: 0,
    octave: 0,
  },
  envelope: {
    attack: 50,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  portamento: 0,
};

/**
 * Organ (Hammond Drawbar) Configuration
 */
export interface OrganConfig {
  drawbars: [number, number, number, number, number, number, number, number, number];
  // 16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1' (0-8 each)
  percussion: {
    enabled: boolean;
    volume: number;             // 0-100%
    decay: 'fast' | 'slow';
    harmonic: 'second' | 'third';
  };
  keyClick: number;             // 0-100%
  vibrato: {
    type: 'V1' | 'V2' | 'V3' | 'C1' | 'C2' | 'C3';
    depth: number;              // 0-100%
  };
  rotary: {
    enabled: boolean;
    speed: 'slow' | 'fast';
  };
}

export const DEFAULT_ORGAN: OrganConfig = {
  drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0], // Classic rock organ
  percussion: {
    enabled: false,
    volume: 50,
    decay: 'fast',
    harmonic: 'third',
  },
  keyClick: 30,
  vibrato: {
    type: 'C3',
    depth: 50,
  },
  rotary: {
    enabled: true,
    speed: 'slow',
  },
};

/**
 * DrumMachine Configuration (808/909 style)
 * Based on authentic TR-808 synthesis from io-808 and TR-909 from er-99 emulator
 */
export type DrumType = 'kick' | 'snare' | 'clap' | 'hihat' | 'tom' | 'cymbal' | 'cowbell' | 'rimshot' | 'conga' | 'clave' | 'maracas';

// Drum machine type selector (affects overall synthesis character)
export type DrumMachineType = '808' | '909';

export interface DrumMachineConfig {
  drumType: DrumType;
  machineType?: DrumMachineType; // '808' or '909' - affects synthesis character
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
    pitch: number;              // 100-500 Hz body frequency (808: 238Hz low + 476Hz high, 909: 220Hz)
    pitchHigh?: number;         // 808 only: high oscillator (476Hz)
    tone: number;               // 0-100% body/snap balance
    toneDecay: number;          // Noise decay in ms (808: 75ms, 909: 250ms)
    snappy: number;             // 0-100% noise amount
    decay: number;              // 50-500ms amplitude decay (808: 100ms, 909: 100ms)
    envAmount: number;          // 1-10x pitch envelope (909: 4.0, 808: ~1 - no pitch env)
    envDuration: number;        // 0-50ms pitch envelope (909: 10ms, 808: 100ms)
    filterType: 'lowpass' | 'highpass' | 'bandpass' | 'notch'; // 808: highpass, 909: notch
    filterFreq: number;         // Filter frequency (808: 800-1800Hz highpass, 909: 1000Hz notch)
  };
  hihat?: {
    tone: number;               // 0-100% dark/bright
    decay: number;              // 10-1000ms (808 closed: 50ms, open: 90-450ms)
    metallic: number;           // 0-100%
    // 808 uses 6 square oscillators at inharmonic freqs: [263, 400, 421, 474, 587, 845]
    // Then bandpass at 10kHz + highpass at 8kHz
  };
  clap?: {
    tone: number;               // 0-100% filter frequency (808: 1000Hz bandpass, 909: 2200Hz)
    decay: number;              // 50-500ms overall decay (808: 115ms reverb, 909: 80ms)
    toneDecay: number;          // Individual burst decay (808: sawtooth repeats, 909: 250ms)
    spread: number;             // 0-100ms burst spacing (808: 100ms sawtooth, 909: 10ms)
    filterFreqs: [number, number]; // Serial filters (808: 1000Hz bandpass, 909: [900, 1200])
    modulatorFreq: number;      // Sawtooth modulator frequency (909: 40Hz)
  };
  tom?: {
    pitch: number;              // 100-400 Hz (808 Low: 80-100Hz, Mid: 120-160Hz, Hi: 165-220Hz)
    decay: number;              // 100-500ms (808: 180-200ms)
    tone: number;               // 0-100% noise amount (808: pink noise 0.2 amp, 909: 5%)
    toneDecay: number;          // Noise decay (808: 100-155ms, 909: 100ms)
    envAmount: number;          // 1-5x pitch envelope (909: 2.0, 808: ~1)
    envDuration: number;        // 50-200ms pitch envelope (808: 100ms, 909: 100ms)
  };
  // 808-specific: Conga (like tom but higher pitched, no noise)
  conga?: {
    pitch: number;              // 165-455 Hz (808 Low: 165-220Hz, Mid: 250-310Hz, Hi: 370-455Hz)
    decay: number;              // 100-300ms (808: 180ms)
    tuning: number;             // 0-100% pitch interpolation within range
  };
  cowbell?: {
    decay: number;              // 10-500ms (808: 15ms short + 400ms tail)
    filterFreq: number;         // Bandpass center (808: 2640Hz)
    // 808: Two square oscillators at 540Hz and 800Hz
  };
  rimshot?: {
    decay: number;              // 10-100ms (808: 40ms, 909: 30ms)
    filterFreqs: [number, number, number]; // Bandpass freqs (808: [480, 1750, 2450], 909: [220, 500, 950])
    filterQ: number;            // Resonance (808: ~5, 909: 10.5)
    saturation: number;         // 1-5x saturation (808: high via swing VCA, 909: 3.0)
  };
  // 808-specific: Clave (similar to rimshot but different frequencies)
  clave?: {
    decay: number;              // 10-60ms (808: 40ms)
    pitch: number;              // Primary pitch (808: 2450Hz triangle)
    pitchSecondary: number;     // Secondary pitch (808: 1750Hz sine)
    filterFreq: number;         // Bandpass center (808: 2450Hz)
  };
  // 808-specific: Maracas
  maracas?: {
    decay: number;              // 10-100ms (808: 30ms)
    filterFreq: number;         // Highpass cutoff (808: 5000Hz)
  };
  // 808-specific: Cymbal (more complex than hihat)
  cymbal?: {
    tone: number;               // 0-100% low/high band balance
    decay: number;              // 500-7000ms (808: 700-6800ms for low band)
    // 808: 3-band filtering with separate envelopes per band
  };
}

export const DEFAULT_DRUM_MACHINE: DrumMachineConfig = {
  drumType: 'kick',
  machineType: '909', // Default to 909 for backwards compatibility
  // TR-909 accurate kick parameters (808 values in comments)
  kick: {
    pitch: 80,              // 909: 80Hz, 808: 48Hz base
    pitchDecay: 50,         // Legacy: kept for compatibility
    tone: 50,               // Noise/click amount
    toneDecay: 20,          // 909: 20ms noise decay
    decay: 300,             // 909: 300ms, 808: 50-300ms (user controlled)
    drive: 50,              // 909: moderate saturation, 808: 60%
    envAmount: 2.5,         // 909: 2.5x, 808: ~2x (98Hz to 48Hz)
    envDuration: 50,        // 909: 50ms, 808: 110ms attack then decay
    filterFreq: 3000,       // 909: 3000Hz, 808: 200-300Hz (user controlled via tone)
  },
  // TR-909 accurate snare parameters (808 values in comments)
  snare: {
    pitch: 220,             // 909: 220Hz, 808: 238Hz (low osc)
    pitchHigh: 476,         // 808: 476Hz (high osc), 909 doesn't use this
    tone: 25,               // 909: 25%, 808: controlled by snappy
    toneDecay: 250,         // 909: 250ms, 808: 75ms noise decay
    snappy: 70,             // Noise amount
    decay: 100,             // 909: 100ms, 808: ~100ms
    envAmount: 4.0,         // 909: 4.0x, 808: ~1 (no pitch envelope)
    envDuration: 10,        // 909: 10ms, 808: 100ms
    filterType: 'notch',    // 909: notch, 808: highpass
    filterFreq: 1000,       // 909: 1000Hz notch, 808: 800-1800Hz highpass
  },
  // 808-style hi-hat (6 square oscillators at inharmonic frequencies)
  hihat: {
    tone: 50,               // Dark/bright control
    decay: 100,             // 808 closed: 50ms, open: 90-450ms
    metallic: 50,           // Harmonicity control
  },
  // TR-909 accurate clap parameters (808 uses sawtooth envelope for reverb effect)
  clap: {
    tone: 55,               // 909: ~2200Hz, 808: 1000Hz bandpass
    decay: 80,              // 909: 80ms, 808: 115ms reverb tail
    toneDecay: 250,         // 909: 250ms, 808: sawtooth repeating
    spread: 10,             // 909: 10ms, 808: 100ms sawtooth spacing
    filterFreqs: [900, 1200], // 909: serial bandpass, 808: 1000Hz single
    modulatorFreq: 40,      // 909: 40Hz sawtooth
  },
  // Tom parameters (808 uses pink noise, 909 uses little noise)
  tom: {
    pitch: 200,             // Mid tom default (808: 120-160Hz, 909: 200Hz)
    decay: 200,             // 909: 200ms, 808: 180-200ms
    tone: 5,                // 909: 5%, 808: pink noise 0.2 amplitude
    toneDecay: 100,         // 909: 100ms, 808: 100-155ms
    envAmount: 2.0,         // 909: 2.0x, 808: ~1 (minimal pitch sweep)
    envDuration: 100,       // 909: 100ms, 808: 100ms
  },
  // 808-specific: Conga (higher pitched tom, no noise)
  conga: {
    pitch: 310,             // Mid conga default (808: 250-310Hz range)
    decay: 180,             // 808: 180ms
    tuning: 50,             // 0-100% pitch interpolation
  },
  // 808-specific: Cowbell (dual square oscillators through bandpass)
  cowbell: {
    decay: 400,             // 808: 15ms short attack + 400ms tail
    filterFreq: 2640,       // 808: 2640Hz bandpass center
  },
  // Rimshot parameters (808/909 differ in frequencies and character)
  rimshot: {
    decay: 30,              // 909: 30ms, 808: 40ms
    filterFreqs: [220, 500, 950], // 909: parallel resonant, 808: [480, 1750, 2450]
    filterQ: 10.5,          // 909: very high Q, 808: lower Q ~5
    saturation: 3.0,        // 909: heavy, 808: via swing VCA distortion
  },
  // 808-specific: Clave (higher pitched than rimshot, woodblock character)
  clave: {
    decay: 40,              // 808: 40ms
    pitch: 2450,            // 808: 2450Hz triangle
    pitchSecondary: 1750,   // 808: 1750Hz sine
    filterFreq: 2450,       // 808: 2450Hz bandpass
  },
  // 808-specific: Maracas (highpass filtered noise)
  maracas: {
    decay: 30,              // 808: 30ms (quick shake)
    filterFreq: 5000,       // 808: 5000Hz highpass
  },
  // 808-specific: Cymbal (complex 3-band filtering)
  cymbal: {
    tone: 50,               // Low/high band balance
    decay: 2000,            // 808: 700-6800ms (variable low band decay)
  },
};

/**
 * Advanced Arpeggio Step Configuration
 * Each step in the arpeggio pattern with per-step controls
 */
export interface ArpeggioStep {
  noteOffset: number;           // -24 to +36 semitones
  volume?: number;              // 0-100% (default 100)
  gate?: number;                // 0-100% gate length (default 100)
  effect?: 'none' | 'accent' | 'slide' | 'skip';  // Per-step effects
}

/**
 * Arpeggio Speed Unit Types
 */
export type ArpeggioSpeedUnit = 'hz' | 'ticks' | 'division';

/**
 * Arpeggio Playback Mode
 */
export type ArpeggioMode = 'loop' | 'pingpong' | 'oneshot' | 'random';

/**
 * Advanced Arpeggio Configuration
 * Full-featured arpeggiator with tracker-style controls
 */
export interface ArpeggioConfig {
  enabled: boolean;
  speed: number;                // Speed value (interpretation depends on speedUnit)
  speedUnit: ArpeggioSpeedUnit; // 'hz' | 'ticks' | 'division'
  steps: ArpeggioStep[];        // Up to 16 steps with per-step controls
  mode: ArpeggioMode;           // Playback mode
  swing?: number;               // 0-100% swing amount (default 0)
  // Legacy support: simple pattern array
  pattern?: number[];           // Simple semitone offsets (for backwards compat)
}

/**
 * Default Arpeggio Configuration
 */
export const DEFAULT_ARPEGGIO: ArpeggioConfig = {
  enabled: false,
  speed: 15,                    // 15 Hz (typical chiptune speed)
  speedUnit: 'hz',
  steps: [
    { noteOffset: 0 },
    { noteOffset: 4 },
    { noteOffset: 7 },
  ],
  mode: 'loop',
  swing: 0,
};

/**
 * ChipSynth Configuration (8-bit)
 */
export interface ChipSynthConfig {
  channel: 'pulse1' | 'pulse2' | 'triangle' | 'noise';
  pulse?: {
    duty: 12.5 | 25 | 50;       // Duty cycle percentage
  };
  noise?: {
    mode: 'white' | 'periodic';
    period: number;             // For periodic noise
  };
  bitDepth: number;             // 4-16 bits
  sampleRate: number;           // 4000-44100 Hz
  arpeggio?: ArpeggioConfig;    // Advanced arpeggio config
  envelope: EnvelopeConfig;
  vibrato: {
    speed: number;              // 0-20 Hz
    depth: number;              // 0-100%
    delay: number;              // ms before vibrato starts
  };
}

export const DEFAULT_CHIP_SYNTH: ChipSynthConfig = {
  channel: 'pulse1',
  pulse: {
    duty: 50,
  },
  bitDepth: 8,
  sampleRate: 22050,
  envelope: {
    attack: 5,
    decay: 300,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 50,
  },
  vibrato: {
    speed: 6,
    depth: 0,
    delay: 200,
  },
  arpeggio: {
    enabled: false,
    speed: 15,              // 15 Hz (typical chiptune arpeggio speed)
    speedUnit: 'hz',
    steps: [
      { noteOffset: 0 },    // Root
      { noteOffset: 4 },    // Major third
      { noteOffset: 7 },    // Fifth
    ],
    mode: 'loop',
    swing: 0,
  },
};

/**
 * PWMSynth Configuration (Pulse Width Modulation)
 */
export interface PWMSynthConfig {
  pulseWidth: number;           // 0-100% (50% = square)
  pwmDepth: number;             // 0-100% modulation depth
  pwmRate: number;              // 0.1-20 Hz LFO rate
  pwmWaveform: 'sine' | 'triangle' | 'sawtooth';
  oscillators: number;          // 1-3 oscillators
  detune: number;               // 0-50 cents between oscillators
  envelope: EnvelopeConfig;
  filter: {
    type: FilterType;
    cutoff: number;
    resonance: number;
    envelopeAmount: number;
    keyTracking: number;        // 0-100%
  };
  filterEnvelope: EnvelopeConfig;
}

export const DEFAULT_PWM_SYNTH: PWMSynthConfig = {
  pulseWidth: 50,
  pwmDepth: 30,
  pwmRate: 2,
  pwmWaveform: 'sine',
  oscillators: 2,
  detune: 10,
  envelope: {
    attack: 50,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  filter: {
    type: 'lowpass',
    cutoff: 4000,
    resonance: 20,
    envelopeAmount: 30,
    keyTracking: 50,
  },
  filterEnvelope: {
    attack: 10,
    decay: 500,
    sustain: 0,  // Decay to silence
    release: 100,
  },
};

/**
 * StringMachine Configuration (Ensemble Strings)
 */
export interface StringMachineConfig {
  sections: {
    violin: number;             // 0-100% level
    viola: number;
    cello: number;
    bass: number;
  };
  ensemble: {
    depth: number;              // 0-100% chorus depth
    rate: number;               // 0.5-6 Hz
    voices: number;             // 2-6 chorus voices
  };
  attack: number;               // 10-2000ms
  release: number;              // 100-5000ms
  brightness: number;           // 0-100% high frequency content
}

export const DEFAULT_STRING_MACHINE: StringMachineConfig = {
  sections: {
    violin: 100,
    viola: 70,
    cello: 50,
    bass: 30,
  },
  ensemble: {
    depth: 60,
    rate: 3,
    voices: 4,
  },
  attack: 200,
  release: 1000,
  brightness: 60,
};

/**
 * FormantSynth Configuration (Vocal Synthesis)
 */
export type VowelType = 'A' | 'E' | 'I' | 'O' | 'U';

export interface FormantSynthConfig {
  vowel: VowelType;
  vowelMorph: {
    target: VowelType;
    amount: number;             // 0-100% blend
    rate: number;               // 0-5 Hz morph speed
    mode: 'manual' | 'lfo' | 'envelope';
  };
  oscillator: {
    type: WaveformType;
    pulseWidth?: number;        // For pulse wave
  };
  formants: {
    f1: number;                 // First formant Hz (override)
    f2: number;                 // Second formant Hz
    f3: number;                 // Third formant Hz
    bandwidth: number;          // 50-200 Hz
  };
  envelope: EnvelopeConfig;
  brightness: number;           // 0-100%
}

// Formant frequency presets for vowels
export const VOWEL_FORMANTS: Record<VowelType, { f1: number; f2: number; f3: number }> = {
  A: { f1: 800, f2: 1200, f3: 2500 },
  E: { f1: 400, f2: 2000, f3: 2600 },
  I: { f1: 300, f2: 2300, f3: 3000 },
  O: { f1: 500, f2: 800, f3: 2500 },
  U: { f1: 350, f2: 600, f3: 2400 },
};

export const DEFAULT_FORMANT_SYNTH: FormantSynthConfig = {
  vowel: 'A',
  vowelMorph: {
    target: 'O',
    amount: 0,
    rate: 1,
    mode: 'manual',
  },
  oscillator: {
    type: 'sawtooth',
  },
  formants: {
    ...VOWEL_FORMANTS.A,
    bandwidth: 100,
  },
  envelope: {
    attack: 50,
    decay: 500,
    sustain: 0,  // Decay to silence (tracker-style)
    release: 100,
  },
  brightness: 70,
};

export type AudioEffectType =
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
  | 'StereoWidener'
  | 'TapeSaturation'
  | 'SidechainCompressor'
  | 'Neural'; // Neural effects category

export type EffectCategory = 'tonejs' | 'neural';

export interface EffectConfig {
  id: string;
  category: EffectCategory;  // Discriminator for effect type
  type: AudioEffectType;          // For tonejs: existing types; for neural: "Neural"
  enabled: boolean;
  wet: number; // 0-100%
  parameters: Record<string, number | string>;  // Parameters (numbers are 0-100 normalized, strings for types/modes)

  // Neural-specific (only when category === 'neural')
  neuralModelIndex?: number;   // Index into GUITARML_MODEL_REGISTRY
  neuralModelName?: string;    // Display name cache
}

export interface InstrumentMetadata {
  importedFrom?: 'MOD' | 'XM' | 'IT' | 'S3M';
  originalEnvelope?: any; // Preserved point-based envelope for future editor
  autoVibrato?: any; // Preserved auto-vibrato settings
  preservedSample?: {
    audioBuffer: ArrayBuffer;
    url: string;
    baseNote: string;
    detune: number;
    loop: boolean;
    loopStart: number;
    loopEnd: number;
    envelope: EnvelopeConfig;
  };
  transformHistory?: Array<{
    timestamp: string;
    fromType: SynthType;
    toType: SynthType;
  }>;
  // MOD/XM period-based playback
  modPlayback?: {
    usePeriodPlayback: boolean; // If true, use period-based playback (Amiga)
    periodMultiplier: number; // AMIGA_PALFREQUENCY_HALF = 3546895
    finetune: number; // -8 to +7 (ProTracker) or -128 to +127 (XM)
    defaultVolume?: number; // Sample's default volume (0-64) for channel init
  };
}

export interface SampleConfig {
  audioBuffer?: ArrayBuffer;
  url: string;
  baseNote: string; // "C-4"
  detune: number; // -100 to +100 cents
  loop: boolean;
  loopStart: number; // Sample frame index
  loopEnd: number; // Sample frame index
  sampleRate?: number; // For converting loop points to seconds (default 8363 Hz for MOD)
  reverse: boolean;
  playbackRate: number; // 0.25-4x
}

/**
 * Instrument type discriminator for XM compatibility
 * - 'sample': Standard XM sampled instrument
 * - 'synth': DEViLBOX synthesizer (extension)
 */
export type InstrumentType = 'sample' | 'synth';

export interface InstrumentConfig {
  id: number;                   // 1-128 (XM-compatible range, 1-indexed)
  name: string;                 // Max 22 characters (XM limit)
  type: InstrumentType;         // 'sample' or 'synth' (for XM export handling)
  synthType: SynthType;
  oscillator?: OscillatorConfig;
  envelope?: EnvelopeConfig;
  filter?: FilterConfig;
  filterEnvelope?: FilterEnvelopeConfig;
  tb303?: TB303Config;
  wavetable?: WavetableConfig;
  granular?: GranularConfig;
  // New synth configs
  superSaw?: SuperSawConfig;
  polySynth?: PolySynthConfig;
  organ?: OrganConfig;
  drumMachine?: DrumMachineConfig;
  chipSynth?: ChipSynthConfig;
  pwmSynth?: PWMSynthConfig;
  stringMachine?: StringMachineConfig;
  formantSynth?: FormantSynthConfig;
  // Module playback (libopenmpt)
  chiptuneModule?: ChiptuneModuleConfig;
  // Sampler config
  sample?: SampleConfig;
  effects: EffectConfig[];
  volume: number; // -60 to 0 dB
  pan: number; // -100 to 100
  parameters?: Record<string, any>; // Additional synth-specific parameters (e.g., sample URLs)
  metadata?: InstrumentMetadata; // Import metadata and transformation history
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
  decay: 500,
  sustain: 0,  // Decay to silence (tracker-style)
  release: 100,
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
  softAttack: 0.3,       // Minimum (instant attack) - stock TB-303 had fixed ~4ms, DF makes it variable

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
