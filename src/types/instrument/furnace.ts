/**
 * Furnace Tracker Instrument Configuration
 * Based on Furnace's instrument.h - comprehensive FM/chip instrument support
 */

// Macro types from Furnace (DIV_MACRO_*)
export const FurnaceMacroType = {
  VOL: 0,
  ARP: 1,
  DUTY: 2,
  WAVE: 3,
  PITCH: 4,
  EX1: 5,
  EX2: 6,
  EX3: 7,
  ALG: 8,
  FB: 9,
  FMS: 10,
  AMS: 11,
  PAN_L: 12,
  PAN_R: 13,
  PHASE_RESET: 14,
  EX4: 15,
  EX5: 16,
  EX6: 17,
  EX7: 18,
  EX8: 19,
  FMS2: 20,
  AMS2: 21,
} as const;

export type FurnaceMacroType = typeof FurnaceMacroType[keyof typeof FurnaceMacroType];

export interface FurnaceOperatorConfig {
  enabled: boolean;
  // Basic FM parameters
  mult: number;      // 0-15 (frequency multiplier)
  tl: number;        // Total Level 0-127 (attenuation)
  ar: number;        // Attack Rate 0-31
  dr: number;        // Decay Rate 0-31
  d2r: number;       // Decay 2 Rate / Sustain Rate 0-31
  sl: number;        // Sustain Level 0-15
  rr: number;        // Release Rate 0-15
  dt: number;        // Detune -3 to +3 (signed)
  dt2?: number;      // Detune 2 / Coarse tune 0-3 (OPM/OPZ)
  rs?: number;       // Rate Scaling 0-3

  // Modulation flags
  am?: boolean;      // Amplitude Modulation enable

  // OPL-specific
  ksr?: boolean;     // Key Scale Rate
  ksl?: number;      // Key Scale Level 0-3
  sus?: boolean;     // Sustain flag
  vib?: boolean;     // Vibrato flag
  ws?: number;       // Waveform Select 0-7

  // SSG-EG (OPN family)
  ssg?: number;      // SSG-EG mode 0-15

  // OPZ-specific (added from Furnace) - optional for backward compatibility
  dam?: number;      // AM depth 0-7
  dvb?: number;      // Vibrato depth 0-7
  egt?: boolean;     // Fixed frequency mode
  kvs?: number;      // Key velocity sensitivity 0-3
}

export interface FurnaceMacro {
  code?: number;     // Macro slot (0=vol, 1=arp, 2=duty, 3=wave, 4=pitch, etc.)
  type: number;      // FurnaceMacroType / word size flags
  data: number[];    // Up to 256 steps
  loop: number;      // Loop point (-1 = no loop)
  release: number;   // Release point (-1 = no release)
  mode: number;      // Macro mode (0=sequence, 1=ADSR, 2=LFO)
  // Added from Furnace's DivInstrumentMacro - optional for backward compatibility
  delay?: number;    // Macro start delay in ticks
  speed?: number;    // Macro speed (1 = normal, 2 = half speed, etc.)
  open?: boolean;    // Whether loop is "open" (continues past release)
}

// Complete per-operator macro set from Furnace
export interface FurnaceOpMacros {
  tl?: FurnaceMacro;
  ar?: FurnaceMacro;
  dr?: FurnaceMacro;
  d2r?: FurnaceMacro;
  sl?: FurnaceMacro;
  rr?: FurnaceMacro;
  mult?: FurnaceMacro;
  dt?: FurnaceMacro;
  dt2?: FurnaceMacro;
  rs?: FurnaceMacro;
  am?: FurnaceMacro;
  ksr?: FurnaceMacro;
  ksl?: FurnaceMacro;
  sus?: FurnaceMacro;
  vib?: FurnaceMacro;
  ws?: FurnaceMacro;
  ssg?: FurnaceMacro;
  // OPZ-specific
  dam?: FurnaceMacro;
  dvb?: FurnaceMacro;
  egt?: FurnaceMacro;
  kvs?: FurnaceMacro;
}

// Chip-specific configs from Furnace

// Game Boy (DIV_INS_GB)
export interface FurnaceGBConfig {
  envVol: number;        // Initial volume 0-15
  envDir: number;        // Direction (0=decrease, 1=increase)
  envLen: number;        // Length 0-7
  soundLen: number;      // Sound length 0-63
  duty?: number;         // Duty cycle 0-3 (12.5%, 25%, 50%, 75%)
  // Hardware sequence (for precise envelope control)
  hwSeqEnabled?: boolean; // Enable hardware sequence
  hwSeqLen?: number;
  hwSeq?: Array<{
    cmd: number;         // Command type
    data: number;        // Command data
  }>;
  softEnv?: boolean;      // Use software envelope
  alwaysInit?: boolean;   // Always initialize
  doubleWave?: boolean;   // Double wave length (GBA only)
}

// Wavetable Synthesizer (from DivInstrumentWaveSynth in instrument.h)
export interface FurnaceWaveSynthConfig {
  enabled: boolean;
  wave1: number;
  wave2: number;
  rateDivider: number;
  effect: number;
  oneShot: boolean;
  global: boolean;
  speed: number;
  param1: number;
  param2: number;
  param3: number;
  param4: number;
}

// C64 SID (DIV_INS_C64)
export interface FurnaceC64Config {
  triOn: boolean;        // Triangle waveform
  sawOn: boolean;        // Saw waveform
  pulseOn: boolean;      // Pulse waveform
  noiseOn: boolean;      // Noise waveform
  a: number;             // Attack 0-15
  d: number;             // Decay 0-15
  s: number;             // Sustain 0-15
  r: number;             // Release 0-15
  duty: number;          // Pulse duty 0-4095
  ringMod: boolean;      // Ring modulation
  oscSync: boolean;      // Oscillator sync
  toFilter?: boolean;    // Route to filter
  initFilter?: boolean;  // Initialize filter
  filterOn?: boolean;    // Filter enabled (editor alias)
  filterRes?: number;    // Filter resonance (editor alias) 0-15
  filterResonance?: number; // 0-15
  filterCutoff?: number; // 0-2047
  filterLP?: boolean;    // Low-pass filter
  filterBP?: boolean;    // Band-pass filter
  filterHP?: boolean;    // High-pass filter
  filterCh3Off?: boolean; // Disable channel 3
  dutyIsAbs?: boolean;   // Duty is absolute
  filterIsAbs?: boolean; // Filter cutoff is absolute
  noTest?: boolean;      // Disable test bit
  resetDuty?: boolean;   // Reset duty cycle on note-on
}

// Amiga (DIV_INS_AMIGA)
export interface FurnaceAmigaConfig {
  initSample: number;    // Initial sample (-1 = none)
  useNoteMap: boolean;   // Use note-to-sample mapping
  useSample: boolean;    // Use sample (vs wavetable)
  useWave: boolean;      // Use wavetable
  waveLen: number;       // Wavetable length
  // Note map for multi-sample instruments
  noteMap: Array<{
    note: number;
    sample: number;
    frequency: number;
  }>;
}

// Namco 163 (DIV_INS_N163)
export interface FurnaceN163Config {
  wave: number;          // Wavetable index
  wavePos: number;       // Wave position in RAM
  waveLen: number;       // Wave length
  waveMode: number;      // Wave mode
  perChPos: boolean;     // Per-channel position
  chPos?: number[];      // Per-channel wave positions (8 entries, 0-255)
  chLen?: number[];      // Per-channel wave lengths (8 entries, 0-252, 4-aligned)
}

// FDS (DIV_INS_FDS)
export interface FurnaceFDSConfig {
  modSpeed: number;      // Modulation speed 0-4095
  modDepth: number;      // Modulation depth 0-63
  modTable: number[];    // 32-step modulation table (-4 to +3)
  initModTableWithFirstWave: boolean;
  compat?: boolean;      // FDS compatibility mode
}

// SNES (DIV_INS_SNES)
export interface FurnaceSNESConfig {
  useEnv: boolean;       // Use hardware envelope
  gainMode: number | string; // Gain mode (number for raw, string for named modes)
  gain: number;          // Gain value
  a: number;             // Attack
  d: number;             // Decay
  s: number;             // Sustain level
  r: number;             // Release
  // BRR sample settings
  d2?: number;           // Decay 2
  sus?: number;          // Sustain mode
}

// ESFM (DIV_INS_ESFM)
export interface FurnaceESFMOperatorConfig extends FurnaceOperatorConfig {
  delay: number;         // Operator delay 0-7
  outLvl: number;        // Output level 0-7
  modIn: number;         // Modulation input 0-7
  left: boolean;         // Left output enable
  right: boolean;        // Right output enable
  ct: number;            // Coarse tune
  dt: number;            // Fine detune
  fixed: boolean;        // Fixed frequency
  fixedFreq: number;     // Fixed frequency value
}

export interface FurnaceESFMConfig {
  operators: FurnaceESFMOperatorConfig[];
  noise: number;         // Noise mode
}

// MultiPCM (DIV_INS_MULTIPCM)
export interface FurnaceMultiPCMConfig {
  ar: number;            // Attack rate
  d1r: number;           // Decay 1 rate
  dl: number;            // Decay level
  d2r: number;           // Decay 2 rate
  rr: number;            // Release rate
  rc: number;            // Rate correction
  lfo: number;           // LFO frequency
  vib: number;           // Vibrato depth
  am: number;            // AM depth
  damp: boolean;         // Damp
  pseudoReverb: boolean; // Pseudo reverb
  lfoReset: boolean;     // LFO reset
  levelDirect: boolean;  // Level direct
}

// Sound Unit (DIV_INS_SU)
export interface FurnaceSoundUnitConfig {
  switchRoles: boolean;
  hwSeqLen: number;
  hwSeq: Array<{
    cmd: number;
    bound: number;
    val: number;
    speed: number;
  }>;
}

// SID2 (DIV_INS_SID2)
export interface FurnaceSID2Config {
  volume: number;        // 0-15
  mixMode: number;       // 0-3
  noiseMode: number;     // 0-3
}

// SID3 (DIV_INS_SID3)
export interface FurnaceSID3Filter {
  enabled: boolean;
  init: boolean;
  absoluteCutoff: boolean;
  bindCutoffToNote: boolean;
  bindCutoffToNoteDir: boolean;
  bindCutoffOnNote: boolean;
  bindResonanceToNote: boolean;
  bindResonanceToNoteDir: boolean;
  bindResonanceOnNote: boolean;
  cutoff: number;
  resonance: number;
  outputVolume: number;
  distortion: number;
  mode: number;
  filterMatrix: number;
  bindCutoffToNoteStrength: number;
  bindCutoffToNoteCenter: number;
  bindResonanceToNoteStrength: number;
  bindResonanceToNoteCenter: number;
}

export interface FurnaceSID3Config {
  triOn: boolean;
  sawOn: boolean;
  pulseOn: boolean;
  noiseOn: boolean;
  dutyIsAbs: boolean;
  a: number;
  d: number;
  s: number;
  sr: number;
  r: number;
  mixMode: number;
  duty: number;
  ringMod: boolean;
  oscSync: boolean;
  phaseMod: boolean;
  specialWaveOn: boolean;
  oneBitNoise: boolean;
  separateNoisePitch: boolean;
  doWavetable: boolean;
  resetDuty: boolean;
  phaseModSource: number;
  ringModSource: number;
  syncSource: number;
  specialWave: number;
  phaseInv: number;
  feedback: number;
  filters: FurnaceSID3Filter[];
}

// ES5506 (DIV_INS_ES5506)
export interface FurnaceES5506Config {
  filter: {
    mode: number;        // Filter mode
    k1: number;          // Filter coefficient K1
    k2: number;          // Filter coefficient K2
  };
  envelope: {
    ecount: number;      // Envelope count
    lVRamp: number;      // Left volume ramp
    rVRamp: number;      // Right volume ramp
    k1Ramp: number;      // K1 ramp
    k2Ramp: number;      // K2 ramp
    k1Slow: boolean;     // K1 slow mode
    k2Slow: boolean;     // K2 slow mode
  };
}

// Main Furnace Config (expanded)
export interface FurnaceConfig {
  chipType: number;

  // Furnace file metadata
  furnaceIndex?: number;  // Original instrument index in the Furnace file (0-based)
  rawBinaryData?: Uint8Array;  // Original binary instrument data for upload to WASM

  // FM parameters
  algorithm: number;     // 0-7 (operator connection algorithm)
  feedback: number;      // 0-7 (op1 self-feedback)
  fms?: number;          // FM sensitivity / LFO->FM depth 0-7
  ams?: number;          // AM sensitivity / LFO->AM depth 0-3
  fms2?: number;         // Secondary FM sensitivity (OPZ)
  ams2?: number;         // Secondary AM sensitivity (OPZ)
  ops?: number;          // Number of operators (2 or 4)
  opllPreset?: number;   // OPLL preset patch 0-15
  block?: number;        // Block/octave 0-7 (ESFM/OPL)
  fixedDrums?: boolean;  // OPLL fixed drum mode
  kickFreq?: number;     // OPL drum kick frequency
  snareHatFreq?: number; // OPL drum snare/hi-hat frequency
  tomTopFreq?: number;   // OPL drum tom/top frequency

  // Operator configurations
  operators: FurnaceOperatorConfig[];

  // Macro system
  macros: FurnaceMacro[];
  opMacros: FurnaceOpMacros[];
  opMacroArrays?: FurnaceMacro[][];  // Raw operator macros [4 operators][N macros each] — indexed by Furnace code 0-19

  // Wavetables
  wavetables: Array<{
    id: number;
    data: number[];
    len?: number;   // Optional for backward compatibility
    max?: number;   // Optional for backward compatibility
  }>;

  // Chip-specific configurations (optional, based on chipType)
  gb?: FurnaceGBConfig;
  c64?: FurnaceC64Config;
  amiga?: FurnaceAmigaConfig;
  n163?: FurnaceN163Config;
  fds?: FurnaceFDSConfig;
  snes?: FurnaceSNESConfig;
  esfm?: FurnaceESFMConfig;
  es5506?: FurnaceES5506Config;
  multipcm?: FurnaceMultiPCMConfig;
  soundUnit?: FurnaceSoundUnitConfig;
  sid2?: FurnaceSID2Config;
  sid3?: FurnaceSID3Config;
  ws?: FurnaceWaveSynthConfig;

  // Simple chip-specific fields (from feature blocks)
  x1BankSlot?: number;     // X1-010 bank slot
  powerNoiseOctave?: number; // PowerNoise octave

  // Additional chip configs (editor-specific)
  nes?: {
    dutyNoise: number;
    envMode: 'length' | 'env';
    envValue: number;
    sweepEnabled: boolean;
    sweepPeriod: number;
    sweepNegate: boolean;
    sweepShift: number;
    dpcmNoteMap?: boolean;
    dpcmMap?: Array<{ freq: number; delta: number }>;
  };
  psg?: {
    duty: number;
    width: number;
    noiseMode: 'white' | 'periodic';
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  pcm?: {
    sampleRate: number;
    loopStart: number;
    loopEnd: number;
    loopPoint: number;
    bitDepth: number;
    loopEnabled: boolean;
    loopMode?: number;  // 0=forward, 1=backward, 2=ping-pong
  };
}
