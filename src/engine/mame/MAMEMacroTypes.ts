/**
 * MAME Synth Macro Types
 *
 * Defines macro enumerations and state interfaces for tracker-style
 * macro automation on MAME-emulated chip synths.
 */

/**
 * Macro types for MAME synths - matches Furnace macro system
 */
export const MacroType = {
  VOLUME: 0,      // 0-127 volume level
  ARPEGGIO: 1,    // Relative semitone offset
  DUTY: 2,        // Duty cycle / noise mode
  WAVETABLE: 3,   // Wavetable select index
  PITCH: 4,       // Relative pitch (cents, signed)
  PANNING: 5,     // -127 to 127 (0 = center)
  PHASE_RESET: 6, // Trigger phase reset on non-zero
  // FM-specific macros
  ALG: 7,         // Algorithm select
  FB: 8,          // Feedback amount
  FMS: 9,         // FM sensitivity
  AMS: 10,        // AM sensitivity
  // Extended operator macros
  OP1_TL: 11,
  OP2_TL: 12,
  OP3_TL: 13,
  OP4_TL: 14,
  OP1_AR: 15,
  OP2_AR: 16,
  OP3_AR: 17,
  OP4_AR: 18,
  OP1_DR: 19,
  OP2_DR: 20,
  OP3_DR: 21,
  OP4_DR: 22,
} as const;
export type MacroType = typeof MacroType[keyof typeof MacroType];

/**
 * State of a single macro during playback
 */
export interface MacroState {
  type: MacroType;
  data: number[];       // Up to 256 steps
  loop: number;         // Loop point (-1 = no loop)
  release: number;      // Release point (-1 = no release)
  position: number;     // Current playback position
  active: boolean;      // Whether macro is currently running
  released: boolean;    // Whether note has been released
}

/**
 * Operator-level macro state for FM chips
 */
export interface OperatorMacroState {
  tl?: MacroState;   // Total Level (amplitude)
  mult?: MacroState; // Multiplier (frequency ratio)
  ar?: MacroState;   // Attack Rate
  dr?: MacroState;   // Decay Rate
  sl?: MacroState;   // Sustain Level
  rr?: MacroState;   // Release Rate
  dt?: MacroState;   // Detune
  rs?: MacroState;   // Rate Scaling
}

/**
 * Effect memory for a single channel - stores last parameters
 */
export interface ChannelEffectMemory {
  // Arpeggio
  arpeggioX: number;
  arpeggioY: number;
  arpeggioTick: number;

  // Slides
  pitchSlideUp: number;
  pitchSlideDown: number;
  tonePortamento: number;
  tonePortamentoTarget: number | null;

  // Vibrato
  vibratoSpeed: number;
  vibratoDepth: number;
  vibratoPhase: number;
  vibratoWaveform: number;  // 0=sine, 1=rampDown, 2=square, 3=random

  // Tremolo
  tremoloSpeed: number;
  tremoloDepth: number;
  tremoloPhase: number;
  tremoloWaveform: number;

  // Volume
  volumeSlide: number;
  currentVolume: number;

  // Panning
  currentPanning: number;

  // Pitch state
  currentPitch: number;       // Hz
  currentPitchOffset: number; // Linear frequency offset

  // Note cut/delay
  noteCutTick: number;
  noteDelayTick: number;

  // Retrigger
  retriggerTick: number;
  retriggerVolume: number;  // Volume change per retrigger

  // Sample offset
  sampleOffset: number;

  // Pattern loop (E6x)
  loopStart: number;
  loopCount: number;
  loopRow: number;
}

/**
 * Create default channel effect memory
 */
export function createDefaultChannelMemory(): ChannelEffectMemory {
  return {
    arpeggioX: 0,
    arpeggioY: 0,
    arpeggioTick: 0,
    pitchSlideUp: 0,
    pitchSlideDown: 0,
    tonePortamento: 0,
    tonePortamentoTarget: null,
    vibratoSpeed: 0,
    vibratoDepth: 0,
    vibratoPhase: 0,
    vibratoWaveform: 0,
    tremoloSpeed: 0,
    tremoloDepth: 0,
    tremoloPhase: 0,
    tremoloWaveform: 0,
    volumeSlide: 0,
    currentVolume: 64,
    currentPanning: 128,
    currentPitch: 440,
    currentPitchOffset: 0,
    noteCutTick: -1,
    noteDelayTick: -1,
    retriggerTick: 0,
    retriggerVolume: 0,
    sampleOffset: 0,
    loopStart: 0,
    loopCount: 0,
    loopRow: 0,
  };
}

/**
 * Create an empty macro state
 */
export function createEmptyMacro(type: MacroType): MacroState {
  return {
    type,
    data: [],
    loop: -1,
    release: -1,
    position: 0,
    active: false,
    released: false,
  };
}

/**
 * Create a macro state from data
 */
export function createMacro(
  type: MacroType,
  data: number[],
  loop: number = -1,
  release: number = -1
): MacroState {
  return {
    type,
    data,
    loop,
    release,
    position: 0,
    active: data.length > 0,
    released: false,
  };
}

/**
 * Chip capability flags - what features each chip supports
 */
export interface MAMEChipCapabilities {
  // Voice structure
  numVoices: number;
  numOperators: number;  // 0 for non-FM chips

  // FM features
  hasFM: boolean;
  hasAlgorithm: boolean;
  hasFeedback: boolean;

  // Modulation
  hasVibrato: boolean;
  hasTremolo: boolean;
  hasPitchLFO: boolean;
  hasAmpLFO: boolean;

  // Sound sources
  hasWavetable: boolean;
  hasPCM: boolean;
  hasNoise: boolean;

  // Envelope
  hasADSR: boolean;
  hasSSG: boolean;  // SSG-EG (YM2608/etc)

  // Output
  hasPanning: boolean;
  hasStereo: boolean;

  // Effects
  hasDSP: boolean;
  hasReverb: boolean;

  // Memory
  sampleRAMSize: number;  // 0 = no sample RAM
}

/**
 * Default chip capabilities (conservative)
 */
export const DEFAULT_CHIP_CAPABILITIES: MAMEChipCapabilities = {
  numVoices: 1,
  numOperators: 0,
  hasFM: false,
  hasAlgorithm: false,
  hasFeedback: false,
  hasVibrato: false,
  hasTremolo: false,
  hasPitchLFO: false,
  hasAmpLFO: false,
  hasWavetable: false,
  hasPCM: false,
  hasNoise: false,
  hasADSR: true,
  hasSSG: false,
  hasPanning: false,
  hasStereo: false,
  hasDSP: false,
  hasReverb: false,
  sampleRAMSize: 0,
};

/**
 * Chip-specific capabilities
 */
export const CHIP_CAPABILITIES: Record<string, Partial<MAMEChipCapabilities>> = {
  AICA: {
    numVoices: 64,
    hasPCM: true,
    hasADSR: true,
    hasPitchLFO: true,
    hasAmpLFO: true,
    hasPanning: true,
    hasStereo: true,
    hasDSP: true,
    sampleRAMSize: 2097152, // 2MB
  },
  SCSP: {
    numVoices: 32,
    numOperators: 4,
    hasFM: true,
    hasPCM: true,
    hasADSR: true,
    hasPitchLFO: true,
    hasAmpLFO: true,
    hasPanning: true,
    hasStereo: true,
    hasDSP: true,
    sampleRAMSize: 524288, // 512KB
  },
  C352: {
    numVoices: 32,
    hasPCM: true,
    hasADSR: true,
    hasPanning: true,
    hasStereo: true,
    sampleRAMSize: 16777216, // 16MB
  },
  ES5503: {
    numVoices: 32,
    hasWavetable: true,
    hasADSR: true,
    hasPanning: true,
    hasStereo: true,
    sampleRAMSize: 65536, // 64KB
  },
  YMF271: {
    numVoices: 12,
    numOperators: 4,
    hasFM: true,
    hasAlgorithm: true,
    hasFeedback: true,
    hasPCM: true,
    hasADSR: true,
    hasPitchLFO: true,
    hasAmpLFO: true,
    hasPanning: true,
    hasStereo: true,
    hasReverb: true,
    sampleRAMSize: 4194304, // 4MB
  },
  YMOPQ: {
    numVoices: 8,
    numOperators: 4,
    hasFM: true,
    hasAlgorithm: true,
    hasFeedback: true,
    hasADSR: true,
    hasPanning: false,
    hasStereo: false,
  },
  K054539: {
    numVoices: 8,
    hasPCM: true,
    hasADSR: true,
    hasPanning: true,
    hasStereo: true,
    hasReverb: true,
    sampleRAMSize: 8388608, // 8MB
  },
  ICS2115: {
    numVoices: 32,
    hasWavetable: true,
    hasPCM: true,
    hasADSR: true,
    hasPanning: true,
    hasStereo: true,
    sampleRAMSize: 16777216, // 16MB
  },
  RF5C400: {
    numVoices: 32,
    hasPCM: true,
    hasADSR: true,
    hasPanning: true,
    hasStereo: true,
    sampleRAMSize: 16777216, // 16MB
  },
  SN76477: {
    numVoices: 1,
    hasNoise: true,
    hasVibrato: true,
  },
  TMS36XX: {
    numVoices: 6,
    hasADSR: false,
  },
  TMS5220: {
    numVoices: 1,
    // Speech synthesis chip
  },
  MEA8000: {
    numVoices: 1,
    // LPC speech chip
  },
  Votrax: {
    numVoices: 1,
    // Speech synthesis chip
  },
  Astrocade: {
    numVoices: 3,
    hasNoise: true,
    hasVibrato: true,
  },
  SNKWave: {
    numVoices: 3,
    hasWavetable: true,
  },
  SP0250: {
    numVoices: 1,
    // Speech synthesis chip
  },
  UPD931: {
    numVoices: 1,
    // Speech synthesis chip
  },
  UPD933: {
    numVoices: 8,
    hasWavetable: true,
    hasADSR: true,
    // CZ phase distortion
  },
  TR707: {
    numVoices: 15,
    hasPCM: true,
    sampleRAMSize: 32768, // 32KB ROM
  },
  VASynth: {
    numVoices: 16,
    hasWavetable: true,
    hasADSR: true,
    hasPanning: true,
    hasStereo: true,
  },
  CEM3394: {
    numVoices: 1,
    hasADSR: true,
    hasVibrato: true,
  },
  ASC: {
    numVoices: 4,
    hasWavetable: true,
    hasStereo: true,
  },
};

/**
 * Get capabilities for a chip, merging with defaults
 */
export function getChipCapabilities(chipName: string): MAMEChipCapabilities {
  const overrides = CHIP_CAPABILITIES[chipName] || {};
  return { ...DEFAULT_CHIP_CAPABILITIES, ...overrides };
}
