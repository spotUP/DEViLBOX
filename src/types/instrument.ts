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
  | 'FormantSynth';

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
    decay: 100,
    sustain: 80,
    release: 500,
  },
  filter: {
    type: 'lowpass',
    cutoff: 8000,
    resonance: 20,
    envelopeAmount: 0,
  },
  filterEnvelope: {
    attack: 10,
    decay: 200,
    sustain: 30,
    release: 500,
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
    decay: 100,
    sustain: 80,
    release: 300,
  },
  filter: {
    type: 'lowpass',
    cutoff: 8000,
    resonance: 20,
    envelopeAmount: 0,
  },
  filterEnvelope: {
    attack: 10,
    decay: 200,
    sustain: 30,
    release: 500,
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
    decay: 200,
    sustain: 70,
    release: 500,
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
 */
export type DrumType = 'kick' | 'snare' | 'clap' | 'hihat' | 'tom' | 'cymbal' | 'cowbell' | 'rimshot';

export interface DrumMachineConfig {
  drumType: DrumType;
  kick?: {
    pitch: number;              // 30-80 Hz
    pitchDecay: number;         // 0-500ms
    tone: number;               // 0-100% click/thump balance
    decay: number;              // 50-2000ms
    drive: number;              // 0-100% saturation
  };
  snare?: {
    pitch: number;              // 100-300 Hz
    tone: number;               // 0-100% body/snap
    snappy: number;             // 0-100% noise amount
    decay: number;              // 50-500ms
  };
  hihat?: {
    tone: number;               // 0-100% dark/bright
    decay: number;              // 10-1000ms
    metallic: number;           // 0-100%
  };
  clap?: {
    tone: number;               // 0-100%
    decay: number;              // 50-500ms
    spread: number;             // 0-100% multiple hit spread
  };
}

export const DEFAULT_DRUM_MACHINE: DrumMachineConfig = {
  drumType: 'kick',
  kick: {
    pitch: 50,
    pitchDecay: 100,
    tone: 50,
    decay: 500,
    drive: 0,
  },
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
  arpeggio?: {
    enabled: boolean;
    speed: number;              // Hz
    pattern: number[];          // Semitone offsets
  };
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
    decay: 100,
    sustain: 70,
    release: 200,
  },
  vibrato: {
    speed: 6,
    depth: 0,
    delay: 200,
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
    decay: 200,
    sustain: 70,
    release: 500,
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
    decay: 300,
    sustain: 30,
    release: 500,
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
    decay: 200,
    sustain: 70,
    release: 500,
  },
  brightness: 70,
};

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
  | 'StereoWidener'
  | 'TapeSaturation'
  | 'SidechainCompressor';

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
