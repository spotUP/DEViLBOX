/**
 * Tone.js-specific and general synth config interfaces
 */

import type {
  EnvelopeConfig,
  FilterType,
  WaveformType,
  OscillatorConfig,
  FilterConfig,
  FilterEnvelopeConfig,
  ArpeggioConfig,
  VowelType,
} from './base';
import type { EffectConfig } from './effects';

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
  accentAttack?: number;  // 0.3-30ms - MEG attack time for accented notes
  vegDecay: number;       // 16-3000ms - VEG (Volume Envelope Generator) decay
  vegSustain: number;     // 0-100% - VEG sustain level (100% = infinite notes)
  softAttack: number;     // 0.3-3000ms (exponential) - attack time for non-accented notes
  accentSoftAttack?: number; // 0-100% - soft attack amount for accented notes

  // Filter controls
  filterTracking: number; // 0-200% - filter frequency tracks note pitch
  filterFmDepth: number;  // 0-100% - VCA output feeds back to filter frequency (audio-rate FM)
  filterInputDrive?: number; // 0-1 (db303 truth)
  passbandCompensation?: number; // 0-100% - filter passband level compensation
  resTracking?: number;   // 0-100% - resonance frequency tracking across keyboard
  duffingAmount?: number; // 0-100% - non-linear filter effect (Duffing oscillator)
  lpBpMix?: number;       // 0-100% - lowpass/bandpass filter mix (0=LP, 100=BP)
  stageNLAmount?: number; // 0-100% - per-stage non-linearity amount
  filterSelect?: number;  // 0-255 - filter mode/topology selection
  diodeCharacter?: number; // 0-100% - diode ladder filter character

  // Effects
  ensembleAmount?: number; // 0-100% - built-in ensemble/chorus effect

  // Extended range toggles (Wide mode — bypasses standard 303 mapping)
  extendedCutoff?: boolean;  // When true, cutoff knob sends setCutoffHz(10-5000Hz)
  extendedEnvMod?: boolean;  // When true, envMod knob sends setEnvModPercent(0-300%)

  // Audio quality
  oversamplingOrder?: 0 | 1 | 2 | 3 | 4; // 0=none, 1=2x, 2=4x, 3=8x, 4=16x oversampling

  // Korg/Advanced Filter
  korgEnabled?: boolean;  // Enable/disable Korg filter parameters
  korgBite?: number;      // 0-1 - filter bite/edge character
  korgClip?: number;      // 0-1 - soft clipping amount
  korgCrossmod?: number;  // 0-1 - cross modulation depth
  korgQSag?: number;      // 0-1 - resonance sag amount
  korgSharpness?: number; // 0-1 - filter sharpness/slope
  korgStiffness?: number; // 0-1 - (alias for duffingAmount)
  korgWarmth?: number;    // 0-1 - (alias for diodeCharacter)
  korgFilterFm?: number;  // 0-1 - (alias for filterFmDepth)

  // Accent controls
  sweepSpeed: 'fast' | 'normal' | 'slow'; // Accent sweep circuit behavior
  accentSweepEnabled: boolean;            // Enable/disable accent sweep circuit

  // Resonance mode
  highResonance: boolean; // Enable filter self-oscillation at mid/high frequencies

  // Output processing
  muffler: 'off' | 'soft' | 'hard' | 'dark' | 'mid' | 'bright'; // TB303: soft/hard clipping, Buzz3o3: dark/mid/bright lowpass
}

// SuperCollider synthesis types

export interface SCParam {
  name: string;
  value: number;
  default: number;
  min: number;
  max: number;
}

export interface SuperColliderConfig {
  synthDefName: string;   // Name declared in SynthDef(\name, ...)
  source: string;         // SC source code (for display/editing)
  binary: string;         // base64-encoded compiled .scsyndef
  params: SCParam[];      // Tweakable parameters (excl. freq/amp/gate)
}

export interface TB303Config {
  engineType?: 'jc303' | 'db303'; // jc303 = Open303 engine, db303 = db303 variant with additional tweaks

  // Tuning
  tuning?: number; // Master tuning in Hz (default: 440)

  // Volume
  volume?: number; // 0-1 (db303 truth)

  // Extended toggles (db303 feature)
  extendedCutoff?: boolean;
  extendedEnvMod?: boolean;

  // Tempo-relative envelopes (for slower tempos = longer sweeps)
  tempoRelative?: boolean; // Default: false (absolute ms), true = scale with BPM

  oscillator: {
    type: 'sawtooth' | 'square';
    waveformBlend?: number;  // 0-1 continuous blend (0=saw, 1=square) - overrides type if set
    pulseWidth?: number;      // 0-100 (pulse width modulation control)
    subOscGain?: number;      // 0-100 (sub-oscillator level)
    subOscBlend?: number;     // 0-100 (sub-oscillator mix with main oscillator)
    pitchToPw?: number;       // 0-1 (pitch-to-pulse-width modulation)
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
  pedalboard?: {
    enabled: boolean;
    chain: EffectConfig[];
  };
  overdrive?: {
    amount: number; // 0-100%
    modelIndex?: number; // GuitarML model index
    drive?: number; // 0-100%
    dryWet?: number; // 0-100%
  };
  // Devil Fish modifications (optional - for backward compatibility)
  devilFish?: DevilFishConfig;

  // LFO (Low Frequency Oscillator) - for modulation
  lfo?: {
    enabled?: boolean;         // Enable/disable LFO
    waveform: number;         // 0=triangle, 1=saw up, 2=saw down, 3=square, 4=random(S&H), 5=noise
    rate: number;              // 0-100 (LFO speed/frequency)
    contour: number;           // 0-100 (envelope contour amount)
    pitchDepth: number;        // 0-100 (pitch modulation depth)
    pwmDepth: number;          // 0-100 (pulse width modulation depth)
    filterDepth: number;       // 0-100 (filter cutoff modulation depth)
    stiffDepth?: number;       // 0-100 (stiffness modulation depth)
  };

  // Built-in effects
  chorus?: {
    enabled: boolean;         // Enable/disable chorus effect
    mode: 0 | 1 | 2 | 3 | 4;  // 0=off, 1=subtle, 2=standard, 3=rich, 4=dramatic
    mix: number;              // 0-100 (dry/wet mix)
  };
  phaser?: {
    enabled: boolean;         // Enable/disable phaser effect
    rate: number;             // 0-100 (LFO speed)
    depth: number;            // 0-100 (sweep depth/width)
    feedback: number;         // 0-100 (resonance/feedback amount)
    mix: number;              // 0-100 (dry/wet mix)
  };
  delay?: {
    enabled: boolean;         // Enable/disable delay effect
    time: number;             // 0-2000 (delay time in milliseconds)
    feedback: number;         // 0-100 (delay feedback/repeats)
    tone: number;             // 0-100 (filter cutoff for delay line)
    mix: number;              // 0-100 (dry/wet mix)
    stereo: number;           // 0-100 (stereo spread/width)
  };
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

export interface HarmonicSynthConfig {
  harmonics: number[];        // 32 values, each 0-1 (amplitude per harmonic)
  spectralTilt: number;       // -100 to 100 (shapes harmonic rolloff)
  evenOddBalance: number;     // -100 to 100 (odd-heavy ↔ even-heavy)
  filter: {
    type: 'lowpass' | 'highpass' | 'bandpass';
    cutoff: number;           // 20-20000 Hz
    resonance: number;        // 0-30
  };
  envelope: { attack: number; decay: number; sustain: number; release: number; };
  lfo: {
    rate: number;             // 0.1-20 Hz
    depth: number;            // 0-100
    target: 'pitch' | 'filter' | 'spectral';
  };
  maxVoices: number;          // 4-8
}

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

/**
 * SuperSaw Synthesizer Configuration
 * Multiple detuned sawtooth oscillators for massive trance/EDM sounds
 * Inspired by Roland JP-8000/Access Virus supersaw
 */
export interface SuperSawConfig {
  voices: number;               // 3-9 oscillators (default 7)
  detune: number;               // 0-100 cents spread between voices
  mix: number;                  // 0-100% center vs side voices
  stereoSpread: number;         // 0-100% panning width

  // Advanced detuning (new)
  spreadCurve?: 'linear' | 'exponential' | 'random';  // How voices spread across detune range
  phaseMode?: 'free' | 'reset' | 'random';            // Phase behavior on note trigger
  analogDrift?: number;         // 0-100% pitch drift for analog warmth

  // Sub oscillator (new)
  sub?: {
    enabled: boolean;
    octave: -1 | -2;            // Sub octave
    waveform: 'sine' | 'square';
    level: number;              // 0-100%
  };

  // PWM mode (new) - pulse waves instead of saws
  pwm?: {
    enabled: boolean;
    width: number;              // 10-90% pulse width
    modRate: number;            // 0-10 Hz PWM rate
    modDepth: number;           // 0-100% modulation depth
  };

  envelope: EnvelopeConfig;
  filter: {
    type: FilterType;
    cutoff: number;             // 20-20000 Hz
    resonance: number;          // 0-100%
    envelopeAmount: number;     // -100 to 100%
    keyTracking?: number;       // 0-100%
  };
  filterEnvelope: EnvelopeConfig;

  // Pitch envelope (new)
  pitchEnvelope?: {
    enabled: boolean;
    amount: number;             // -24 to +24 semitones
    attack: number;             // 0-2000ms
    decay: number;              // 0-2000ms
  };
}

/**
 * PolySynth Configuration
 * True polyphonic synth with voice management
 */
export interface PolySynthConfig {
  voiceCount: number;           // 1-16 max simultaneous voices
  voiceType: 'Synth' | 'FMSynth' | 'ToneAM';
  stealMode: 'oldest' | 'lowest' | 'highest';
  oscillator: OscillatorConfig;
  envelope: EnvelopeConfig;
  filter?: FilterConfig;
  filterEnvelope?: FilterEnvelopeConfig;
  portamento: number;           // 0-1000ms glide between notes
}

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

/**
 * ChipSynth Configuration (8-bit)
 * Hardware-accurate parameters based on NES/GB/C64 chips
 */
export interface ChipSynthConfig {
  // Chip emulation target (new)
  chip?: 'nes' | 'gb' | 'c64' | 'ay' | 'sn76489' | 'generic';

  channel: 'pulse1' | 'pulse2' | 'triangle' | 'noise';
  pulse?: {
    duty: 12.5 | 25 | 50 | 75;  // Duty cycle percentage (75% = inverted 25%)
    // Hardware sweep (NES-style, new)
    sweep?: {
      enabled: boolean;
      period: number;           // 0-7 (sweep speed)
      direction: 'up' | 'down';
      shift: number;            // 0-7 (pitch change amount)
    };
  };
  noise?: {
    mode: 'white' | 'periodic' | 'metallic';  // metallic = looped noise
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

  // Hardware volume envelope (GB/NES style, new)
  hardwareEnvelope?: {
    enabled: boolean;
    initialVolume: number;      // 0-15
    direction: 'up' | 'down';   // Volume sweep direction
    period: number;             // 0-7 (sweep speed, 0=disable)
  };

  // Ring modulation (C64 style, new)
  ringMod?: {
    enabled: boolean;
    sourceChannel: 'pulse1' | 'pulse2' | 'triangle';
  };

  // Hard sync (C64 style, new)
  sync?: {
    enabled: boolean;
    sourceChannel: 'pulse1' | 'pulse2' | 'triangle';
  };

  // Macro system (Furnace-style, new)
  macros?: {
    volume?: number[];          // Volume sequence (0-15)
    arpeggio?: number[];        // Note offset sequence
    duty?: number[];            // Duty cycle sequence (0-3 for pulse)
    pitch?: number[];           // Pitch offset sequence
    waveform?: number[];        // Waveform sequence
    loopPoint?: number;         // Where to loop (-1 = no loop)
    releasePoint?: number;      // Release point (-1 = none)
  };
}

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

/**
 * FormantSynth Configuration (Vocal Synthesis)
 */
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

/**
 * WobbleBass Configuration
 * Dedicated bass synth for dubstep, DnB, jungle wobble and growl basses
 * Features dual oscillators, FM, Reese-style detuning, aggressive filter, and tempo-synced LFO
 */
export type WobbleLFOSync =
  | '1/1' | '1/2' | '1/2T' | '1/2D'
  | '1/4' | '1/4T' | '1/4D'
  | '1/8' | '1/8T' | '1/8D'
  | '1/16' | '1/16T' | '1/16D'
  | '1/32' | '1/32T'
  | 'free';

export type WobbleMode = 'classic' | 'reese' | 'fm' | 'growl' | 'hybrid';

export interface WobbleBassConfig {
  mode: WobbleMode;

  // Dual Oscillator Section
  osc1: {
    type: WaveformType;
    octave: number;           // -2 to +2
    detune: number;           // -100 to +100 cents
    level: number;            // 0-100%
  };
  osc2: {
    type: WaveformType;
    octave: number;           // -2 to +2
    detune: number;           // -100 to +100 cents (for Reese effect)
    level: number;            // 0-100%
  };

  // Sub Oscillator (clean sine)
  sub: {
    enabled: boolean;
    octave: number;           // -2 to 0
    level: number;            // 0-100%
  };

  // FM Section
  fm: {
    enabled: boolean;
    amount: number;           // 0-100 (modulation index)
    ratio: number;            // 0.5-8 (carrier:modulator ratio)
    envelope: number;         // 0-100% (FM amount envelope depth)
  };

  // Unison/Reese Section
  unison: {
    voices: number;           // 1-16
    detune: number;           // 0-100 cents spread
    stereoSpread: number;     // 0-100%
  };

  // Filter Section (aggressive lowpass)
  filter: {
    type: 'lowpass' | 'bandpass' | 'highpass';
    cutoff: number;           // 20-20000 Hz
    resonance: number;        // 0-100% (high values for screaming)
    rolloff: -12 | -24 | -48;
    drive: number;            // 0-100% (filter drive/saturation)
    keyTracking: number;      // 0-100%
  };

  // Filter Envelope
  filterEnvelope: {
    amount: number;           // -100 to +100% (bipolar)
    attack: number;           // 0-2000ms
    decay: number;            // 0-2000ms
    sustain: number;          // 0-100%
    release: number;          // 0-2000ms
  };

  // Wobble LFO (tempo-synced)
  wobbleLFO: {
    enabled: boolean;
    sync: WobbleLFOSync;      // Tempo sync division
    rate: number;             // 0.1-20 Hz (when sync='free')
    shape: 'sine' | 'triangle' | 'saw' | 'square' | 'sample_hold';
    amount: number;           // 0-100% filter modulation
    pitchAmount: number;      // 0-100 cents
    fmAmount: number;         // 0-100% FM modulation
    phase: number;            // 0-360 degrees
    retrigger: boolean;
  };

  // Amp Envelope
  envelope: EnvelopeConfig;

  // Built-in Effects
  distortion: {
    enabled: boolean;
    type: 'soft' | 'hard' | 'fuzz' | 'bitcrush';
    drive: number;            // 0-100%
    tone: number;             // 0-100% (post-dist filter)
  };

  // Formant (for growl)
  formant: {
    enabled: boolean;
    vowel: VowelType;
    morph: number;            // 0-100% position between vowels
    lfoAmount: number;        // 0-100% LFO modulation of vowel
  };
}

/**
 * Buzzmachine Configuration
 * For Jeskola Buzz machine effects used as synths/generators
 */
export type BuzzmachineType =
  // Distortion/Saturation
  | 'ArguruDistortion'
  | 'ElakDist2'
  | 'JeskolaDistortion'
  | 'GeonikOverdrive'
  | 'GraueSoftSat'
  | 'WhiteNoiseStereoDist'
  // Filters
  | 'ElakSVF'
  | 'CyanPhaseNotch'
  | 'QZfilter'
  | 'FSMPhilta'
  // Delay/Reverb
  | 'JeskolaDelay'
  | 'JeskolaCrossDelay'
  | 'JeskolaFreeverb'
  | 'FSMPanzerDelay'
  // Chorus/Modulation
  | 'FSMChorus'
  | 'FSMChorus2'
  | 'WhiteNoiseWhiteChorus'
  | 'BigyoFrequencyShifter'
  // Dynamics
  | 'GeonikCompressor'
  | 'LdSLimit'
  | 'OomekExciter'
  | 'OomekMasterizer'
  | 'DedaCodeStereoGain'
  // Generators
  | 'FSMKick'
  | 'FSMKickXP'
  | 'JeskolaTrilok'
  | 'JeskolaNoise'
  | 'OomekAggressor'
  | 'OomekAggressorDF'
  | 'MadBrain4FM2F'
  | 'MadBrainDynamite6'
  | 'MakkM3'
  | 'MakkM4'
  | 'CyanPhaseDTMF'
  | 'ElenzilFrequencyBomb';

export interface BuzzmachineConfig {
  machineType: BuzzmachineType;
  parameters: Record<number, number>;  // Parameter index -> value
  customWaves?: Record<number, number[]>; // Custom wavetables (index -> samples)
}

/**
 * Dub Siren Configuration
 * Classic dub sound effect generator with LFO and Delay
 */
export interface DubSirenConfig {
  oscillator: {
    type: 'sine' | 'square' | 'sawtooth' | 'triangle';
    frequency: number; // Base frequency (60-1000 Hz)
  };
  lfo: {
    enabled: boolean;
    type: 'sine' | 'square' | 'sawtooth' | 'triangle';
    rate: number; // 0-20 Hz
    depth: number; // Modulation amount (0-1000)
  };
  delay: {
    enabled: boolean;
    time: number; // 0-1 seconds
    feedback: number; // 0-1
    wet: number; // 0-1
  };
  filter: {
    enabled: boolean;
    frequency: number; // 20-20000 Hz
    type: FilterType;
    rolloff: -12 | -24 | -48 | -96;
  };
  reverb: {
    enabled: boolean;
    decay: number; // seconds
    wet: number; // 0-1
  };
}

/**
 * Synare 3 Configuration
 * Analog electronic percussion synthesizer
 */
export interface SynareConfig {
  oscillator: {
    type: 'square' | 'pulse';
    tune: number; // Base frequency (Hz)
    fine: number; // Fine tune (cents)
  };
  oscillator2: {
    enabled: boolean;
    detune: number; // Semitones from Osc 1
    mix: number;    // 0-1
  };
  noise: {
    enabled: boolean;
    type: 'white' | 'pink';
    mix: number;    // 0-1
    color: number;  // 0-100 (Lowpass cutoff)
  };
  filter: {
    cutoff: number; // 20-20000 Hz
    resonance: number; // 0-100%
    envMod: number; // 0-100%
    decay: number; // 10-2000ms
  };
  lfo: {
    enabled: boolean;
    rate: number; // 0.1-20 Hz
    depth: number; // 0-100%
    target: 'pitch' | 'filter' | 'both';
  };
  envelope: {
    decay: number; // 10-2000ms (Amp decay)
    sustain: number; // 0-1 (Simulates gate hold)
  };
  sweep: {
    enabled: boolean;
    amount: number; // Pitch drop amount (semitones)
    time: number;   // Sweep time (ms)
  };
}

/**
 * Space Laser Configuration
 * FM-based synth for classic reggae and anime laser effects
 */
export interface SpaceLaserConfig {
  laser: {
    startFreq: number;    // Hz (typically high, e.g. 5000)
    endFreq: number;      // Hz (typically low, e.g. 100)
    sweepTime: number;    // ms
    sweepCurve: 'exponential' | 'linear';
  };
  fm: {
    amount: number;       // Modulation index (0-100)
    ratio: number;        // Multiplier (0.5 - 16)
  };
  noise: {
    amount: number;       // 0-100%
    type: 'white' | 'pink' | 'brown';
  };
  filter: {
    type: FilterType;
    cutoff: number;       // 20-20000 Hz
    resonance: number;    // 0-100%
  };
  delay: {
    enabled: boolean;
    time: number;         // seconds
    feedback: number;     // 0-1
    wet: number;          // 0-1
  };
  reverb: {
    enabled: boolean;
    decay: number;        // seconds
    wet: number;          // 0-1
  };
}

/**
 * Commodore SAM Speech Configuration
 */
export interface SamConfig {
  text: string;
  pitch: number;    // 0-255 (default 64)
  speed: number;    // 0-255 (default 72)
  mouth: number;    // 0-255 (default 128)
  throat: number;   // 0-255 (default 128)
  singmode: boolean;
  phonetic: boolean;
  vowelSequence?: string[];     // e.g. ['IY', 'AH', 'OO'] — per-note vowel cycling
  vowelLoopSingle?: boolean;    // true = sustain/loop vowel while note held
}

/**
 * Web Audio Module (WAM) Configuration
 */
export interface WAMConfig {
  moduleUrl: string;              // URL to the WAM entry point (e.g. index.js)
  pluginState: Record<string, unknown> | null;  // Serialized state of the plugin
  pluginStateVersion?: number;    // Tracks state schema for staleness detection
  pluginStateTimestamp?: number;  // When state was last saved
  parameterValues?: Record<string, number>;  // Individual parameter overrides
}

export interface V2Config {
  osc1: {
    mode: number; // Off, Saw/Tri, Pulse, Sin, Noise, XX, AuxA, AuxB
    transpose: number; // -64 to +63 (maps to 0-127)
    detune: number;    // -64 to +63 (maps to 0-127)
    color: number;     // 0-127
    level: number;     // 0-127
  };
  osc2: {
    mode: number; // !Off, Tri, Pul, Sin, Noi, FM, AuxA, AuxB
    ringMod: boolean;
    transpose: number;
    detune: number;
    color: number;
    level: number;
  };
  osc3: {
    mode: number; // !Off, Tri, Pul, Sin, Noi, FM, AuxA, AuxB
    ringMod: boolean;
    transpose: number;
    detune: number;
    color: number;
    level: number;
  };
  filter1: {
    mode: number; // Off, Low, Band, High, Notch, All, MoogL, MoogH
    cutoff: number; // 0-127
    resonance: number; // 0-127
  };
  filter2: {
    mode: number; // Off, Low, Band, High, Notch, All, MoogL, MoogH
    cutoff: number; // 0-127
    resonance: number; // 0-127
  };
  routing: {
    mode: number; // single, serial, parallel
    balance: number; // 0-127 (Filter 1 vs Filter 2)
  };
  envelope: {
    attack: number; // 0-127
    decay: number;  // 0-127
    sustain: number; // 0-127
    release: number; // 0-127
  };
  envelope2: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  lfo1: {
    rate: number;
    depth: number;
  };
  voiceDistortion?: {
    mode: number;    // 0-10: Off, Overdrive, Clip, Bitcrush, Decimate, LPF, BPF, HPF, Notch, Allpass, MoogL
    inGain: number;  // 0-127
    param1: number;  // 0-127 mode-specific
    param2: number;  // 0-127 mode-specific
  };
  channelDistortion?: {
    mode: number;    // 0-10
    inGain: number;  // 0-127
    param1: number;  // 0-127
    param2: number;  // 0-127
  };
  chorusFlanger?: {
    amount: number;    // 0-127 wet/dry
    feedback: number;  // 0-127
    delayL: number;    // 1-127
    delayR: number;    // 1-127
    modRate: number;   // 0-127
    modDepth: number;  // 0-127
    modPhase: number;  // 0-127 stereo phase offset
  };
  compressor?: {
    mode: number;       // 0=Off, 1=Peak, 2=RMS
    stereoLink: boolean;
    autoGain: boolean;
    lookahead: number;  // 0-10
    threshold: number;  // 0-127
    ratio: number;      // 0-127
    attack: number;     // 0-127
    release: number;    // 0-127
    outGain: number;    // 0-127
  };
  lfo2?: {
    mode: number;     // 0-4: Saw, Tri, Pulse, Sin, S&H
    keySync: boolean;
    envMode: boolean;
    rate: number;     // 0-127
    phase: number;    // 0-127
    polarity: number; // 0-2: Pos, Neg, Bipolar
    amplify: number;  // 0-127
  };
}

/**
 * V2 Speech Configuration (Ronan/Lisa)
 */
export interface V2SpeechConfig {
  text: string;
  speed: number;
  pitch: number;
  formantShift: number;
  singMode: boolean; // Enables MIDI note-to-pitch tracking
  vowelSequence?: string[];     // e.g. ['IY', 'AH', 'OO'] — per-note vowel cycling
  vowelLoopSingle?: boolean;    // true = sustain/loop vowel while note held
}

// ============================================================================
// JUCE WASM Synth Configurations
// ============================================================================

/**
 * DX7 Operator Configuration
 */
export interface DexedOperatorConfig {
  level?: number;           // 0-99 output level
  coarse?: number;          // 0-31 coarse frequency ratio
  fine?: number;            // 0-99 fine frequency
  detune?: number;          // 0-14 (7 = center)
  mode?: 'ratio' | 'fixed' | number; // Frequency mode
  egRates?: [number, number, number, number];   // 0-99 for R1-R4
  egLevels?: [number, number, number, number];  // 0-99 for L1-L4
  breakPoint?: number;      // 0-99 (A-1 to C8)
  leftDepth?: number;       // 0-99 keyboard scaling
  rightDepth?: number;      // 0-99 keyboard scaling
  leftCurve?: number;       // 0-3
  rightCurve?: number;      // 0-3
  rateScaling?: number;     // 0-7
  ampModSens?: number;      // 0-3
  velocitySens?: number;    // 0-7
}

/**
 * Dexed (DX7) Synthesizer Configuration
 */
export interface DexedConfig {
  // FM Algorithm (0-31)
  algorithm: number;
  // Operator self-feedback (0-7)
  feedback: number;
  // Oscillator key sync (0-1)
  oscSync: boolean;

  // Operator configurations (6 operators)
  operators: DexedOperatorConfig[];

  // Pitch envelope
  pitchEgRates: [number, number, number, number];   // 0-99
  pitchEgLevels: [number, number, number, number];  // 0-99

  // LFO parameters
  lfoSpeed: number;        // 0-99
  lfoDelay: number;        // 0-99
  lfoPitchModDepth: number; // 0-99
  lfoAmpModDepth: number;   // 0-99
  lfoSync: boolean;
  lfoWave: 'triangle' | 'sawDown' | 'sawUp' | 'square' | 'sine' | 'sampleHold' | number;
  lfoPitchModSens: number; // 0-7

  // Transpose (-24 to +24)
  transpose: number;

  // Voice name (10 chars max)
  name?: string;
}

/**
 * OB-Xd (Oberheim) Synthesizer Configuration
 */
export interface OBXdConfig {
  // Oscillator 1
  osc1Waveform: 'saw' | 'pulse' | 'triangle' | 'noise' | number;
  osc1Octave: number;        // -2 to +2
  osc1Detune: number;        // -1 to +1 semitones
  osc1PulseWidth: number;    // 0-1
  osc1Level: number;         // 0-1

  // Oscillator 2
  osc2Waveform: 'saw' | 'pulse' | 'triangle' | 'noise' | number;
  osc2Octave: number;
  osc2Detune: number;
  osc2PulseWidth: number;
  osc2Level: number;

  // Oscillator modifiers
  oscSync: boolean;
  oscXor: boolean;           // Ring modulation style

  // Filter
  filterCutoff: number;      // 0-1 (maps to 20-20000 Hz)
  filterResonance: number;   // 0-1
  filterType: 'lp24' | 'lp12' | 'hp' | 'bp' | 'notch' | number;
  filterEnvAmount: number;   // 0-1
  filterKeyTrack: number;    // 0-1
  filterVelocity: number;    // 0-1

  // Filter envelope (ADSR)
  filterAttack: number;      // 0-1 (seconds-ish)
  filterDecay: number;
  filterSustain: number;
  filterRelease: number;

  // Amp envelope (ADSR)
  ampAttack: number;
  ampDecay: number;
  ampSustain: number;
  ampRelease: number;

  // LFO
  lfoRate: number;           // 0-1 (maps to 0.1-20 Hz)
  lfoWaveform: 'sine' | 'triangle' | 'saw' | 'square' | 'sampleHold' | number;
  lfoDelay: number;          // 0-1
  lfoOscAmount: number;      // 0-1
  lfoFilterAmount: number;   // 0-1
  lfoAmpAmount: number;      // 0-1
  lfoPwAmount: number;       // 0-1

  // Global
  masterVolume: number;      // 0-1
  voices: number;            // 1-8
  unison: boolean;
  unisonDetune: number;      // 0-1
  portamento: number;        // 0-1
  panSpread: number;         // 0-1
  velocitySensitivity: number; // 0-1

  // Extended
  noiseLevel: number;        // 0-1
  subOscLevel: number;       // 0-1
  subOscOctave: -1 | -2 | number;
  drift: number;             // 0-1 analog drift
}

// ===== RdPiano (Roland SA-synthesis Digital Piano) =====

export interface RdPianoConfig {
  patch: number;           // 0-15 patch index
  chorusEnabled: boolean;  // Space-D BBD chorus
  chorusRate: number;      // 0-14
  chorusDepth: number;     // 0-14
  efxEnabled: boolean;     // Phaser EFX toggle
  phaserRate: number;      // 0.0-1.0
  phaserDepth: number;     // 0.0-1.0
  tremoloEnabled: boolean;
  tremoloRate: number;     // 0-14
  tremoloDepth: number;    // 0-14
  volume: number;          // 0.0-1.0
}

export interface MAMEConfig {
  type: 'vfx' | 'doc' | 'rsa' | 'swp30';
  clock: number;
  romsLoaded: boolean;
  registers: Record<number, number>;
}
