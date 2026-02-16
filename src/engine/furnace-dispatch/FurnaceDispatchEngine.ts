/**
 * FurnaceDispatchEngine - Singleton managing Furnace chip dispatch WASM instances
 *
 * Loads the FurnaceDispatch WASM module via AudioWorklet and manages:
 * - Chip instance lifecycle (create/destroy)
 * - DivCommand forwarding
 * - Oscilloscope data reception for visualization
 */

import { getNativeContext } from '@utils/audio-context';
import { FurnaceEffectRouter } from './FurnaceEffectRouter';

/** Furnace platform types (matching C++ DivSystem enum in sysDef.h) */
export const FurnaceDispatchPlatform = {
  // Core / Meta
  NULL: 0,
  YMU759: 1,
  DUMMY: 88,

  // Compound systems (generally use sub-components)
  GENESIS: 2,
  GENESIS_EXT: 3,
  SMS_OPLL: 5,
  ARCADE: 13,
  MSX2: 14,
  NES_VRC7: 9,
  NES_FDS: 10,

  // Console platforms
  SMS: 4,
  GB: 6,
  PCE: 7,
  NES: 8,
  SNES: 26,
  SWAN: 43,
  LYNX: 60,
  VBOY: 47,
  NDS: 103,
  POKEMINI: 45,
  TIA: 21,
  POKEY: 41,

  // Commodore
  C64_6581: 11,
  C64_8580: 12,
  PET: 25,
  VIC20: 24,
  TED: 97,
  C64_PCM: 112,

  // NES Expansion
  FDS: 29,
  MMC5: 30,
  N163: 31,
  VRC6: 27,
  VRC7: 48,

  // PSG Chips
  AY: 17, // Alias for AY8910
  AY8910: 17,
  AY8930: 23,
  SAA1099: 22,
  T6W28: 83,

  // Yamaha FM
  YM2612: 20,
  YM2612_EXT: 52,
  YM2612_DUALPCM: 80,
  YM2612_DUALPCM_EXT: 81,
  YM2612_CSM: 89,
  YM2151: 19,
  TX81Z: 44, // TX81Z uses OPZ chip
  OPZ: 44,
  YM2203: 32,
  YM2203_EXT: 33,
  YM2203_CSM: 92,
  YM2608: 34,
  YM2608_EXT: 35,
  YM2608_CSM: 93,
  YM2610: 57, // Alias for YM2610_FULL
  YM2610_EXT: 58, // Alias for YM2610_FULL_EXT
  YM2610_CRAP: 15,
  YM2610_CRAP_EXT: 16,
  YM2610_FULL: 57,
  YM2610_FULL_EXT: 58,
  YM2610_CSM: 90,
  YM2610B: 49,
  YM2610B_EXT: 63,
  YM2610B_CSM: 91,

  // OPL Family
  OPL: 36,
  OPL2: 37,
  OPL3: 38,
  OPL_DRUMS: 54,
  OPL2_DRUMS: 55,
  OPL3_DRUMS: 56,
  OPL4: 67,
  OPL4_DRUMS: 68,
  OPLL: 28,
  OPLL_DRUMS: 59,
  Y8950: 70,
  Y8950_DRUMS: 71,
  ESFM: 100,

  // Sample-based
  AMIGA: 18,
  SEGAPCM: 46,
  SEGAPCM_COMPAT: 64,
  MULTIPCM: 39,
  QSOUND: 61,
  RF5C68: 42,
  PCM_DAC: 86,
  ES5506: 69,
  K007232: 84,
  K053260: 96,
  GA20: 85,
  C140: 98,
  C219: 99,
  YMZ280B: 76,
  MSM6258: 75,
  MSM6295: 74,

  // Wavetable
  SCC: 53,
  SCC_PLUS: 72,
  NAMCO: 77,
  NAMCO_15XX: 78,
  NAMCO_CUS30: 79,
  BUBSYS_WSG: 66,
  X1_010: 65,
  VERA: 62,
  SOUND_UNIT: 73,

  // Other/Misc
  PCSPKR: 40,
  PONG: 87,
  PV1000: 95,
  MSM5232: 82,
  SM8521: 94,
  DAVE: 102,
  BIFURCATOR: 107,
  POWERNOISE: 101,

  // ZX Spectrum Beeper
  SFX_BEEPER: 50,
  SFX_BEEPER_QUADTONE: 51,

  // GBA
  GBA_DMA: 104,
  GBA_MINMOD: 105,

  // Enhanced/Experimental
  _5E01: 106, // Prefixed with _ since numeric start

  // SID variants
  SID2: 108,
  SID3: 111,

  // Watara Supervision
  SUPERVISION: 109,

  // UPD1771C
  UPD1771C: 110,
} as const;

export type FurnaceDispatchPlatform = typeof FurnaceDispatchPlatform[keyof typeof FurnaceDispatchPlatform];

/** Sample depth formats (matching Furnace DivSampleDepth enum) */
export const SampleDepth = {
  // 1-bit formats
  DEPTH_1BIT: 0,           // 1-bit raw (8 samples per byte)
  DEPTH_1BIT_DPCM: 1,      // NES DPCM (1-bit delta)

  // 4-bit ADPCM formats
  DEPTH_YMZ_ADPCM: 3,      // YMZ280B ADPCM
  DEPTH_QSOUND_ADPCM: 4,   // QSound ADPCM
  DEPTH_ADPCM_A: 5,        // YM2610 ADPCM-A
  DEPTH_ADPCM_B: 6,        // YM2610 ADPCM-B
  DEPTH_ADPCM_K: 7,        // K053260/K007232 ADPCM
  DEPTH_VOX: 10,           // Dialogic ADPCM (VOX)
  DEPTH_C219: 12,          // Namco C219
  DEPTH_IMA_ADPCM: 13,     // IMA ADPCM
  DEPTH_4BIT: 15,          // Generic 4-bit

  // 8-bit formats
  DEPTH_8BIT: 8,           // Signed 8-bit PCM
  DEPTH_MULAW: 11,         // µ-law encoded

  // 9-byte/16-sample formats
  DEPTH_BRR: 9,            // SNES BRR (9 bytes per 16 samples)

  // 12/16-bit formats
  DEPTH_12BIT: 14,         // 12-bit (stored as 16-bit)
  DEPTH_16BIT: 16,         // Signed 16-bit PCM (default)
} as const;

export type SampleDepth = typeof SampleDepth[keyof typeof SampleDepth];

/** Sample loop modes (matching Furnace DivSampleLoopMode) */
export const SampleLoopMode = {
  FORWARD: 0,
  BACKWARD: 1,
  PINGPONG: 2,
} as const;

export type SampleLoopMode = typeof SampleLoopMode[keyof typeof SampleLoopMode];

/** DivDispatchCmds subset (matching Furnace dispatch.h) */
export const DivCmd = {
  // Core commands
  NOTE_ON: 0,
  NOTE_OFF: 1,
  NOTE_OFF_ENV: 2,
  ENV_RELEASE: 3,
  INSTRUMENT: 4,
  VOLUME: 5,
  GET_VOLUME: 6,
  GET_VOLMAX: 7,
  NOTE_PORTA: 8,
  PITCH: 9,
  PANNING: 10,
  LEGATO: 11,
  PRE_PORTA: 12,
  PRE_NOTE: 13,

  // Hint commands (for ROM export - do not implement)
  HINT_VIBRATO: 14,
  HINT_VIBRATO_RANGE: 15,
  HINT_VIBRATO_SHAPE: 16,
  HINT_PITCH: 17,
  HINT_ARPEGGIO: 18,
  HINT_VOLUME: 19,
  HINT_VOL_SLIDE: 20,
  HINT_PORTA: 21,
  HINT_LEGATO: 22,
  HINT_VOL_SLIDE_TARGET: 23,
  HINT_TREMOLO: 24,
  HINT_PANBRELLO: 25,
  HINT_PAN_SLIDE: 26,
  HINT_PANNING: 27,

  // Sample commands
  SAMPLE_MODE: 28,
  SAMPLE_FREQ: 29,
  SAMPLE_BANK: 30,
  SAMPLE_POS: 31,
  SAMPLE_DIR: 32,

  // FM commands
  FM_HARD_RESET: 33,
  FM_LFO: 34,
  FM_LFO_WAVE: 35,
  FM_TL: 36,
  FM_AM: 37,
  FM_AR: 38,
  FM_DR: 39,
  FM_SL: 40,
  FM_D2R: 41,
  FM_RR: 42,
  FM_DT: 43,
  FM_DT2: 44,
  FM_RS: 45,
  FM_KSR: 46,
  FM_VIB: 47,
  FM_SUS: 48,
  FM_WS: 49,
  FM_SSG: 50,
  FM_REV: 51,
  FM_EG_SHIFT: 52,
  FM_FB: 53,
  FM_MULT: 54,
  FM_FINE: 55,
  FM_FIXFREQ: 56,
  FM_EXTCH: 57,
  FM_AM_DEPTH: 58,
  FM_PM_DEPTH: 59,
  FM_LFO2: 60,
  FM_LFO2_WAVE: 61,

  // Standard noise
  STD_NOISE_FREQ: 62,
  STD_NOISE_MODE: 63,

  // Wavetable
  WAVE: 64,

  // Game Boy sweep
  GB_SWEEP_TIME: 65,
  GB_SWEEP_DIR: 66,

  // PC Engine LFO
  PCE_LFO_MODE: 67,
  PCE_LFO_SPEED: 68,

  // NES
  NES_SWEEP: 69,
  NES_DMC: 70,

  // C64 SID
  C64_CUTOFF: 71,
  C64_RESONANCE: 72,
  C64_FILTER_MODE: 73,
  C64_RESET_TIME: 74,
  C64_RESET_MASK: 75,
  C64_FILTER_RESET: 76,
  C64_DUTY_RESET: 77,
  C64_EXTENDED: 78,
  C64_FINE_DUTY: 79,
  C64_FINE_CUTOFF: 80,

  // AY-3-8910
  AY_ENVELOPE_SET: 81,
  AY_ENVELOPE_LOW: 82,
  AY_ENVELOPE_HIGH: 83,
  AY_ENVELOPE_SLIDE: 84,
  AY_NOISE_MASK_AND: 85,
  AY_NOISE_MASK_OR: 86,
  AY_AUTO_ENVELOPE: 87,
  AY_IO_WRITE: 88,
  AY_AUTO_PWM: 89,

  // FDS
  FDS_MOD_DEPTH: 90,
  FDS_MOD_HIGH: 91,
  FDS_MOD_LOW: 92,
  FDS_MOD_POS: 93,
  FDS_MOD_WAVE: 94,

  // SAA1099
  SAA_ENVELOPE: 95,

  // Amiga
  AMIGA_FILTER: 96,
  AMIGA_AM: 97,
  AMIGA_PM: 98,

  // Atari Lynx
  LYNX_LFSR_LOAD: 99,

  // QSound
  QSOUND_ECHO_FEEDBACK: 100,
  QSOUND_ECHO_DELAY: 101,
  QSOUND_ECHO_LEVEL: 102,
  QSOUND_SURROUND: 103,

  // X1-010
  X1_010_ENVELOPE_SHAPE: 104,
  X1_010_ENVELOPE_ENABLE: 105,
  X1_010_ENVELOPE_MODE: 106,
  X1_010_ENVELOPE_PERIOD: 107,
  X1_010_ENVELOPE_SLIDE: 108,
  X1_010_AUTO_ENVELOPE: 109,
  X1_010_SAMPLE_BANK_SLOT: 110,

  // WonderSwan
  WS_SWEEP_TIME: 111,
  WS_SWEEP_AMOUNT: 112,

  // Namco N163
  N163_WAVE_POSITION: 113,
  N163_WAVE_LENGTH: 114,
  N163_WAVE_UNUSED1: 115,
  N163_WAVE_UNUSED2: 116,
  N163_WAVE_LOADPOS: 117,
  N163_WAVE_LOADLEN: 118,
  N163_WAVE_UNUSED3: 119,
  N163_CHANNEL_LIMIT: 120,
  N163_GLOBAL_WAVE_LOAD: 121,
  N163_GLOBAL_WAVE_LOADPOS: 122,
  N163_UNUSED4: 123,
  N163_UNUSED5: 124,

  // Sound Unit
  SU_SWEEP_PERIOD_LOW: 125,
  SU_SWEEP_PERIOD_HIGH: 126,
  SU_SWEEP_BOUND: 127,
  SU_SWEEP_ENABLE: 128,
  SU_SYNC_PERIOD_LOW: 129,
  SU_SYNC_PERIOD_HIGH: 130,

  // ADPCM-A
  ADPCMA_GLOBAL_VOLUME: 131,

  // SNES
  SNES_ECHO: 132,
  SNES_PITCH_MOD: 133,
  SNES_INVERT: 134,
  SNES_GAIN_MODE: 135,
  SNES_GAIN: 136,
  SNES_ECHO_ENABLE: 137,
  SNES_ECHO_DELAY: 138,
  SNES_ECHO_VOL_LEFT: 139,
  SNES_ECHO_VOL_RIGHT: 140,
  SNES_ECHO_FEEDBACK: 141,
  SNES_ECHO_FIR: 142,

  // NES extra
  NES_ENV_MODE: 143,
  NES_LENGTH: 144,
  NES_COUNT_MODE: 145,

  // Macro control
  MACRO_OFF: 146,
  MACRO_ON: 147,

  // Surround
  SURROUND_PANNING: 148,

  // FM extra
  FM_AM2_DEPTH: 149,
  FM_PM2_DEPTH: 150,

  // ES5506
  ES5506_FILTER_MODE: 151,
  ES5506_FILTER_K1: 152,
  ES5506_FILTER_K2: 153,
  ES5506_FILTER_K1_SLIDE: 154,
  ES5506_FILTER_K2_SLIDE: 155,
  ES5506_ENVELOPE_COUNT: 156,
  ES5506_ENVELOPE_LVRAMP: 157,
  ES5506_ENVELOPE_RVRAMP: 158,
  ES5506_ENVELOPE_K1RAMP: 159,
  ES5506_ENVELOPE_K2RAMP: 160,
  ES5506_PAUSE: 161,

  // Hint extra
  HINT_ARP_TIME: 162,

  // SNES global
  SNES_GLOBAL_VOL_LEFT: 163,
  SNES_GLOBAL_VOL_RIGHT: 164,

  // NES linear
  NES_LINEAR_LENGTH: 165,

  // External
  EXTERNAL: 166,

  // C64 extra
  C64_AD: 167,
  C64_SR: 168,

  // ESFM
  ESFM_OP_PANNING: 169,
  ESFM_OUTLVL: 170,
  ESFM_MODIN: 171,
  ESFM_ENV_DELAY: 172,

  // Macro restart
  MACRO_RESTART: 173,

  // PowerNoise
  POWERNOISE_COUNTER_LOAD: 174,
  POWERNOISE_IO_WRITE: 175,

  // DAVE
  DAVE_HIGH_PASS: 176,
  DAVE_RING_MOD: 177,
  DAVE_SWAP_COUNTERS: 178,
  DAVE_LOW_PASS: 179,
  DAVE_CLOCK_DIV: 180,

  // MinMod
  MINMOD_ECHO: 181,

  // Bifurcator
  BIFURCATOR_STATE_LOAD: 182,
  BIFURCATOR_PARAMETER: 183,

  // FDS auto
  FDS_MOD_AUTO: 184,

  // FM op mask
  FM_OPMASK: 185,

  // MultiPCM
  MULTIPCM_MIX_FM: 186,
  MULTIPCM_MIX_PCM: 187,
  MULTIPCM_LFO: 188,
  MULTIPCM_VIB: 189,
  MULTIPCM_AM: 190,
  MULTIPCM_AR: 191,
  MULTIPCM_D1R: 192,
  MULTIPCM_DL: 193,
  MULTIPCM_D2R: 194,
  MULTIPCM_RC: 195,
  MULTIPCM_RR: 196,
  MULTIPCM_DAMP: 197,
  MULTIPCM_PSEUDO_REVERB: 198,
  MULTIPCM_LFO_RESET: 199,
  MULTIPCM_LEVEL_DIRECT: 200,

  // SID3
  SID3_SPECIAL_WAVE: 201,
  SID3_RING_MOD_SRC: 202,
  SID3_HARD_SYNC_SRC: 203,
  SID3_PHASE_MOD_SRC: 204,
  SID3_WAVE_MIX: 205,
  SID3_LFSR_FEEDBACK_BITS: 206,
  SID3_1_BIT_NOISE: 207,
  SID3_FILTER_DISTORTION: 208,
  SID3_FILTER_OUTPUT_VOLUME: 209,
  SID3_CHANNEL_INVERSION: 210,
  SID3_FILTER_CONNECTION: 211,
  SID3_FILTER_MATRIX: 212,
  SID3_FILTER_ENABLE: 213,

  // C64 slide
  C64_PW_SLIDE: 214,
  C64_CUTOFF_SLIDE: 215,

  // SID3 phase/envelope
  SID3_PHASE_RESET: 216,
  SID3_NOISE_PHASE_RESET: 217,
  SID3_ENVELOPE_RESET: 218,

  // SID3 scaling
  SID3_CUTOFF_SCALING: 219,
  SID3_RESONANCE_SCALING: 220,

  // WonderSwan global
  WS_GLOBAL_SPEAKER_VOLUME: 221,

  // FM algorithm/modulation
  FM_ALG: 222,
  FM_FMS: 223,
  FM_AMS: 224,
  FM_FMS2: 225,
  FM_AMS2: 226,

  // Max command value
  MAX: 227,
} as const;

export type DivCmdType = typeof DivCmd[keyof typeof DivCmd];

/**
 * Compatibility flag indices (matching DivCompatFlags struct order)
 * These control exact playback behavior to match Furnace
 */
export const CompatFlag = {
  LIMIT_SLIDES: 0,
  LINEAR_PITCH: 1,           // 0=old non-linear, 1=linear, 2=full linear
  PITCH_SLIDE_SPEED: 2,      // 0-3 pitch slide speed modes
  LOOP_MODALITY: 3,          // 0-3 loop behavior modes
  DELAY_BEHAVIOR: 4,         // Effect delay behavior
  JUMP_TREATMENT: 5,         // Pattern jump handling
  PROPER_NOISE_LAYOUT: 6,    // AY proper noise freq layout
  WAVE_DUTY_IS_VOL: 7,       // PCE wave duty as volume
  RESET_MACRO_ON_PORTA: 8,   // Reset macro on portamento
  LEGACY_VOLUME_SLIDES: 9,   // Old volume slide behavior
  COMPATIBLE_ARPEGGIO: 10,   // Old vs new arpeggio engine
  NOTE_OFF_RESETS_SLIDES: 11,// Cancel slides on note off
  TARGET_RESETS_SLIDES: 12,  // Cancel on new target
  ARP_NON_PORTA: 13,         // Arp without portamento
  ALG_MACRO_BEHAVIOR: 14,    // Algorithm macro behavior
  BROKEN_SHORTCUT_SLIDES: 15,// GB/NES shortcut slide quirk
  IGNORE_DUPLICATE_SLIDES: 16,
  STOP_PORTA_ON_NOTE_OFF: 17,
  CONTINUOUS_VIBRATO: 18,
  BROKEN_DAC_MODE: 19,
  ONE_TICK_CUT: 20,
  NEW_INS_TRIGGERS_IN_PORTA: 21,
  ARP0_RESET: 22,
  BROKEN_SPEED_SEL: 23,      // OPNA speed quirk
  NO_SLIDES_ON_FIRST_TICK: 24,
  ROW_RESETS_ARP_POS: 25,
  IGNORE_JUMP_AT_END: 26,
  BUGGY_PORTA_AFTER_SLIDE: 27,
  GB_INS_AFFECTS_ENVELOPE: 28,
  SHARED_EXT_STAT: 29,
  IGNORE_DAC_MODE_OUTSIDE_CHANNEL: 30,
  E1E2_ALSO_TAKE_PRIORITY: 31,
  NEW_SEGA_PCM: 32,
  FB_PORTA_PAUSE: 33,
  SN_DUTY_RESET: 34,
  PITCH_MACRO_IS_LINEAR: 35,
  OLD_OCTAVE_BOUNDARY: 36,
  NO_OPN2_VOL: 37,
  NEW_VOLUME_SCALING: 38,
  VOL_MACRO_LINGER: 39,
  BROKEN_OUT_VOL: 40,
  BROKEN_OUT_VOL2: 41,
  E1E2_STOP_ON_SAME_NOTE: 42,
  BROKEN_PORTA_ARP: 43,
  SN_NO_LOW_PERIODS: 44,
  DISABLE_SAMPLE_MACRO: 45,
  OLD_ARP_STRATEGY: 46,
  BROKEN_PORTA_LEGATO: 47,
  BROKEN_FM_OFF: 48,
  PRE_NOTE_NO_EFFECT: 49,
  OLD_DPCM: 50,
  RESET_ARP_PHASE_ON_NEW_NOTE: 51,
  CEIL_VOLUME_SCALING: 52,
  OLD_ALWAYS_SET_VOLUME: 53,
  OLD_SAMPLE_OFFSET: 54,
  OLD_CENTER_RATE: 55,
  NO_VOL_SLIDE_RESET: 56,
} as const;

export type CompatFlagType = typeof CompatFlag[keyof typeof CompatFlag];

/**
 * Compatibility flags interface for batch setting
 */
export interface CompatFlags {
  limitSlides?: boolean;
  linearPitch?: number;      // 0=old, 1=linear, 2=full linear
  pitchSlideSpeed?: number;  // 0-3
  loopModality?: number;     // 0-3
  delayBehavior?: number;
  jumpTreatment?: number;
  properNoiseLayout?: boolean;
  waveDutyIsVol?: boolean;
  resetMacroOnPorta?: boolean;
  legacyVolumeSlides?: boolean;
  compatibleArpeggio?: boolean;
  noteOffResetsSlides?: boolean;
  targetResetsSlides?: boolean;
  arpNonPorta?: boolean;
  algMacroBehavior?: boolean;
  brokenShortcutSlides?: boolean;
  ignoreDuplicateSlides?: boolean;
  stopPortaOnNoteOff?: boolean;
  continuousVibrato?: boolean;
  brokenDACMode?: boolean;
  oneTickCut?: boolean;
  newInsTriggersInPorta?: boolean;
  arp0Reset?: boolean;
  brokenSpeedSel?: boolean;
  noSlidesOnFirstTick?: boolean;
  rowResetsArpPos?: boolean;
  ignoreJumpAtEnd?: boolean;
  buggyPortaAfterSlide?: boolean;
  gbInsAffectsEnvelope?: boolean;
  sharedExtStat?: boolean;
  ignoreDACModeOutsideChannel?: boolean;
  e1e2AlsoTakePriority?: boolean;
  newSegaPCM?: boolean;
  fbPortaPause?: boolean;
  snDutyReset?: boolean;
  pitchMacroIsLinear?: boolean;
  oldOctaveBoundary?: boolean;
  noOPN2Vol?: boolean;
  newVolumeScaling?: boolean;
  volMacroLinger?: boolean;
  brokenOutVol?: boolean;
  brokenOutVol2?: boolean;
  e1e2StopOnSameNote?: boolean;
  brokenPortaArp?: boolean;
  snNoLowPeriods?: boolean;
  disableSampleMacro?: boolean;
  oldArpStrategy?: boolean;
  brokenPortaLegato?: boolean;
  brokenFMOff?: boolean;
  preNoteNoEffect?: boolean;
  oldDPCM?: boolean;
  resetArpPhaseOnNewNote?: boolean;
  ceilVolumeScaling?: boolean;
  oldAlwaysSetVolume?: boolean;
  oldSampleOffset?: boolean;
  oldCenterRate?: boolean;
  noVolSlideReset?: boolean;
}

/**
 * Helper functions for building dispatch commands
 * These provide type-safe wrappers for platform-specific operations
 */

// FM Operator indices
export const FMOp = {
  OP1: 0,
  OP2: 1,
  OP3: 2,
  OP4: 3,
} as const;

// FM command helpers for OPN2, OPM, OPL, etc.
export const FMCommands = {
  /** Set operator Total Level (volume) - (op: 0-3, value: 0-127) */
  setTL: (op: number, value: number) => ({ cmd: DivCmd.FM_TL, val1: op, val2: value }),
  /** Set operator Attack Rate - (op: 0-3, value: 0-31) */
  setAR: (op: number, value: number) => ({ cmd: DivCmd.FM_AR, val1: op, val2: value }),
  /** Set operator Decay Rate - (op: 0-3, value: 0-31) */
  setDR: (op: number, value: number) => ({ cmd: DivCmd.FM_DR, val1: op, val2: value }),
  /** Set operator Sustain Level - (op: 0-3, value: 0-15) */
  setSL: (op: number, value: number) => ({ cmd: DivCmd.FM_SL, val1: op, val2: value }),
  /** Set operator Decay 2 Rate (Sustain Rate) - (op: 0-3, value: 0-31) */
  setD2R: (op: number, value: number) => ({ cmd: DivCmd.FM_D2R, val1: op, val2: value }),
  /** Set operator Release Rate - (op: 0-3, value: 0-15) */
  setRR: (op: number, value: number) => ({ cmd: DivCmd.FM_RR, val1: op, val2: value }),
  /** Set operator Detune - (op: 0-3, value: 0-7) */
  setDT: (op: number, value: number) => ({ cmd: DivCmd.FM_DT, val1: op, val2: value }),
  /** Set operator Multiplier - (op: 0-3, value: 0-15) */
  setMULT: (op: number, value: number) => ({ cmd: DivCmd.FM_MULT, val1: op, val2: value }),
  /** Set operator Rate Scale - (op: 0-3, value: 0-3) */
  setRS: (op: number, value: number) => ({ cmd: DivCmd.FM_RS, val1: op, val2: value }),
  /** Set operator AM enable - (op: 0-3, value: 0-1) */
  setAM: (op: number, value: number) => ({ cmd: DivCmd.FM_AM, val1: op, val2: value }),
  /** Set operator SSG-EG mode - (op: 0-3, value: 0-15) */
  setSSG: (op: number, value: number) => ({ cmd: DivCmd.FM_SSG, val1: op, val2: value }),
  /** Set feedback level - (value: 0-7) */
  setFB: (value: number) => ({ cmd: DivCmd.FM_FB, val1: value, val2: 0 }),
  /** Set algorithm - (value: 0-7) */
  setALG: (value: number) => ({ cmd: DivCmd.FM_ALG, val1: value, val2: 0 }),
  /** Set LFO speed - (value: 0-7) */
  setLFO: (value: number) => ({ cmd: DivCmd.FM_LFO, val1: value, val2: 0 }),
  /** Set AM depth - (value: 0-127) */
  setAMDepth: (value: number) => ({ cmd: DivCmd.FM_AM_DEPTH, val1: value, val2: 0 }),
  /** Set PM depth - (value: 0-127) */
  setPMDepth: (value: number) => ({ cmd: DivCmd.FM_PM_DEPTH, val1: value, val2: 0 }),
  /** Set FMS (frequency modulation sensitivity) - (value: 0-7) */
  setFMS: (value: number) => ({ cmd: DivCmd.FM_FMS, val1: value, val2: 0 }),
  /** Set AMS (amplitude modulation sensitivity) - (value: 0-3) */
  setAMS: (value: number) => ({ cmd: DivCmd.FM_AMS, val1: value, val2: 0 }),
  /** Enable/disable extended channel mode - (value: 0-1) */
  setExtCh: (value: boolean) => ({ cmd: DivCmd.FM_EXTCH, val1: value ? 1 : 0, val2: 0 }),
  /** Hard reset on note - (value: 0-1) */
  setHardReset: (value: boolean) => ({ cmd: DivCmd.FM_HARD_RESET, val1: value ? 1 : 0, val2: 0 }),
  /** Set operator mask - (mask: bitmask 0-15) */
  setOpMask: (mask: number) => ({ cmd: DivCmd.FM_OPMASK, val1: mask, val2: 0 }),
} as const;

// C64 SID command helpers
export const C64Commands = {
  /** Set filter cutoff - (value: 0-2047) */
  setCutoff: (value: number) => ({ cmd: DivCmd.C64_CUTOFF, val1: value, val2: 0 }),
  /** Set filter resonance - (value: 0-15) */
  setResonance: (value: number) => ({ cmd: DivCmd.C64_RESONANCE, val1: value, val2: 0 }),
  /** Set filter mode - (value: 0=off, 1=LP, 2=BP, 4=HP, combinations allowed) */
  setFilterMode: (value: number) => ({ cmd: DivCmd.C64_FILTER_MODE, val1: value, val2: 0 }),
  /** Set fine cutoff - (value: 0-255) */
  setFineCutoff: (value: number) => ({ cmd: DivCmd.C64_FINE_CUTOFF, val1: value, val2: 0 }),
  /** Set fine duty - (value: 0-255) */
  setFineDuty: (value: number) => ({ cmd: DivCmd.C64_FINE_DUTY, val1: value, val2: 0 }),
  /** Set ADSR attack/decay - (value: 0-255, high nibble=A, low=D) */
  setAD: (value: number) => ({ cmd: DivCmd.C64_AD, val1: value, val2: 0 }),
  /** Set ADSR sustain/release - (value: 0-255, high nibble=S, low=R) */
  setSR: (value: number) => ({ cmd: DivCmd.C64_SR, val1: value, val2: 0 }),
  /** Set pulse width slide - (value: slide amount) */
  setPWSlide: (value: number) => ({ cmd: DivCmd.C64_PW_SLIDE, val1: value, val2: 0 }),
  /** Set cutoff slide - (value: slide amount) */
  setCutoffSlide: (value: number) => ({ cmd: DivCmd.C64_CUTOFF_SLIDE, val1: value, val2: 0 }),
} as const;

// SNES command helpers
export const SNESCommands = {
  /** Enable/disable echo for channel - (value: 0-1) */
  setEcho: (value: boolean) => ({ cmd: DivCmd.SNES_ECHO, val1: value ? 1 : 0, val2: 0 }),
  /** Enable/disable pitch modulation - (value: 0-1) */
  setPitchMod: (value: boolean) => ({ cmd: DivCmd.SNES_PITCH_MOD, val1: value ? 1 : 0, val2: 0 }),
  /** Set phase inversion - (value: 0-3, bit0=L, bit1=R) */
  setInvert: (value: number) => ({ cmd: DivCmd.SNES_INVERT, val1: value, val2: 0 }),
  /** Set gain mode - (value: 0=direct, 1-4=ADSR modes) */
  setGainMode: (value: number) => ({ cmd: DivCmd.SNES_GAIN_MODE, val1: value, val2: 0 }),
  /** Set gain value - (value: 0-127) */
  setGain: (value: number) => ({ cmd: DivCmd.SNES_GAIN, val1: value, val2: 0 }),
  /** Global echo enable - (value: 0-1) */
  setEchoEnable: (value: boolean) => ({ cmd: DivCmd.SNES_ECHO_ENABLE, val1: value ? 1 : 0, val2: 0 }),
  /** Set echo delay - (value: 0-15) */
  setEchoDelay: (value: number) => ({ cmd: DivCmd.SNES_ECHO_DELAY, val1: value, val2: 0 }),
  /** Set echo volume left - (value: -128 to 127) */
  setEchoVolLeft: (value: number) => ({ cmd: DivCmd.SNES_ECHO_VOL_LEFT, val1: value, val2: 0 }),
  /** Set echo volume right - (value: -128 to 127) */
  setEchoVolRight: (value: number) => ({ cmd: DivCmd.SNES_ECHO_VOL_RIGHT, val1: value, val2: 0 }),
  /** Set echo feedback - (value: -128 to 127) */
  setEchoFeedback: (value: number) => ({ cmd: DivCmd.SNES_ECHO_FEEDBACK, val1: value, val2: 0 }),
  /** Set FIR filter coefficient - (index: 0-7, value: -128 to 127) */
  setEchoFIR: (index: number, value: number) => ({ cmd: DivCmd.SNES_ECHO_FIR, val1: index, val2: value }),
  /** Set global volume left - (value: -128 to 127) */
  setGlobalVolLeft: (value: number) => ({ cmd: DivCmd.SNES_GLOBAL_VOL_LEFT, val1: value, val2: 0 }),
  /** Set global volume right - (value: -128 to 127) */
  setGlobalVolRight: (value: number) => ({ cmd: DivCmd.SNES_GLOBAL_VOL_RIGHT, val1: value, val2: 0 }),
} as const;

// Game Boy command helpers
export const GBCommands = {
  /** Set sweep time - (value: 0-7) */
  setSweepTime: (value: number) => ({ cmd: DivCmd.GB_SWEEP_TIME, val1: value, val2: 0 }),
  /** Set sweep direction - (value: 0=up, 1=down) */
  setSweepDir: (value: number) => ({ cmd: DivCmd.GB_SWEEP_DIR, val1: value, val2: 0 }),
} as const;

// NES command helpers
export const NESCommands = {
  /** Set sweep - (direction: 0=down/1=up, value: sweep params) */
  setSweep: (direction: number, value: number) => ({ cmd: DivCmd.NES_SWEEP, val1: direction, val2: value }),
  /** Set DMC value - (value: DMC params) */
  setDMC: (value: number) => ({ cmd: DivCmd.NES_DMC, val1: value, val2: 0 }),
  /** Set envelope mode - (value: 0-3) */
  setEnvMode: (value: number) => ({ cmd: DivCmd.NES_ENV_MODE, val1: value, val2: 0 }),
  /** Set length counter - (value: 0-255) */
  setLength: (value: number) => ({ cmd: DivCmd.NES_LENGTH, val1: value, val2: 0 }),
  /** Set count mode - (value: 0-1) */
  setCountMode: (value: number) => ({ cmd: DivCmd.NES_COUNT_MODE, val1: value, val2: 0 }),
  /** Set linear counter length - (value: 0-127) */
  setLinearLength: (value: number) => ({ cmd: DivCmd.NES_LINEAR_LENGTH, val1: value, val2: 0 }),
} as const;

// AY-3-8910 command helpers
export const AYCommands = {
  /** Set envelope shape - (value: 0-15) */
  setEnvelopeSet: (value: number) => ({ cmd: DivCmd.AY_ENVELOPE_SET, val1: value, val2: 0 }),
  /** Set envelope period low byte - (value: 0-255) */
  setEnvelopeLow: (value: number) => ({ cmd: DivCmd.AY_ENVELOPE_LOW, val1: value, val2: 0 }),
  /** Set envelope period high byte - (value: 0-255) */
  setEnvelopeHigh: (value: number) => ({ cmd: DivCmd.AY_ENVELOPE_HIGH, val1: value, val2: 0 }),
  /** Set envelope slide - (value: slide amount) */
  setEnvelopeSlide: (value: number) => ({ cmd: DivCmd.AY_ENVELOPE_SLIDE, val1: value, val2: 0 }),
  /** AND noise mask - (value: mask) */
  setNoiseMaskAnd: (value: number) => ({ cmd: DivCmd.AY_NOISE_MASK_AND, val1: value, val2: 0 }),
  /** OR noise mask - (value: mask) */
  setNoiseMaskOr: (value: number) => ({ cmd: DivCmd.AY_NOISE_MASK_OR, val1: value, val2: 0 }),
  /** Set auto envelope - (value: params) */
  setAutoEnvelope: (value: number) => ({ cmd: DivCmd.AY_AUTO_ENVELOPE, val1: value, val2: 0 }),
  /** Write to I/O port - (port: 0-1, value: 0-255) */
  writeIO: (port: number, value: number) => ({ cmd: DivCmd.AY_IO_WRITE, val1: port, val2: value }),
} as const;

// ES5506 command helpers
export const ES5506Commands = {
  /** Set filter mode - (value: 0-3) */
  setFilterMode: (value: number) => ({ cmd: DivCmd.ES5506_FILTER_MODE, val1: value, val2: 0 }),
  /** Set filter K1 - (value: 0-65535, mask: bits to update) */
  setFilterK1: (value: number, mask: number) => ({ cmd: DivCmd.ES5506_FILTER_K1, val1: value, val2: mask }),
  /** Set filter K2 - (value: 0-65535, mask: bits to update) */
  setFilterK2: (value: number, mask: number) => ({ cmd: DivCmd.ES5506_FILTER_K2, val1: value, val2: mask }),
  /** Slide filter K1 - (value: slide amount, negative: 0-1) */
  slideK1: (value: number, negative: boolean) => ({ cmd: DivCmd.ES5506_FILTER_K1_SLIDE, val1: value, val2: negative ? 1 : 0 }),
  /** Slide filter K2 - (value: slide amount, negative: 0-1) */
  slideK2: (value: number, negative: boolean) => ({ cmd: DivCmd.ES5506_FILTER_K2_SLIDE, val1: value, val2: negative ? 1 : 0 }),
  /** Set envelope count - (value: 0-511) */
  setEnvelopeCount: (value: number) => ({ cmd: DivCmd.ES5506_ENVELOPE_COUNT, val1: value, val2: 0 }),
  /** Set left volume ramp - (value: ramp) */
  setLVRamp: (value: number) => ({ cmd: DivCmd.ES5506_ENVELOPE_LVRAMP, val1: value, val2: 0 }),
  /** Set right volume ramp - (value: ramp) */
  setRVRamp: (value: number) => ({ cmd: DivCmd.ES5506_ENVELOPE_RVRAMP, val1: value, val2: 0 }),
  /** Set K1 ramp - (ramp: amount, slowdown: 0-1) */
  setK1Ramp: (ramp: number, slowdown: boolean) => ({ cmd: DivCmd.ES5506_ENVELOPE_K1RAMP, val1: ramp, val2: slowdown ? 1 : 0 }),
  /** Set K2 ramp - (ramp: amount, slowdown: 0-1) */
  setK2Ramp: (ramp: number, slowdown: boolean) => ({ cmd: DivCmd.ES5506_ENVELOPE_K2RAMP, val1: ramp, val2: slowdown ? 1 : 0 }),
  /** Pause/unpause - (value: 0-1) */
  setPause: (value: boolean) => ({ cmd: DivCmd.ES5506_PAUSE, val1: value ? 1 : 0, val2: 0 }),
} as const;

// N163 (Namco 163) command helpers
export const N163Commands = {
  /** Set wave position - (value: 0-255) */
  setWavePos: (value: number) => ({ cmd: DivCmd.N163_WAVE_POSITION, val1: value, val2: 0 }),
  /** Set wave length - (value: 0-255) */
  setWaveLen: (value: number) => ({ cmd: DivCmd.N163_WAVE_LENGTH, val1: value, val2: 0 }),
  /** Set wave load position - (value: 0-255) */
  setWaveLoadPos: (value: number) => ({ cmd: DivCmd.N163_WAVE_LOADPOS, val1: value, val2: 0 }),
  /** Set wave load length - (value: 0-255) */
  setWaveLoadLen: (value: number) => ({ cmd: DivCmd.N163_WAVE_LOADLEN, val1: value, val2: 0 }),
  /** Set channel limit - (value: 1-8) */
  setChannelLimit: (value: number) => ({ cmd: DivCmd.N163_CHANNEL_LIMIT, val1: value, val2: 0 }),
  /** Load global wave - (value: wave index) */
  loadGlobalWave: (value: number) => ({ cmd: DivCmd.N163_GLOBAL_WAVE_LOAD, val1: value, val2: 0 }),
  /** Set global wave load position - (value: 0-255) */
  setGlobalWaveLoadPos: (value: number) => ({ cmd: DivCmd.N163_GLOBAL_WAVE_LOADPOS, val1: value, val2: 0 }),
} as const;

// Sample playback command helpers
export const SampleCommands = {
  /** Enable/disable sample mode - (value: 0-1) */
  setMode: (value: boolean) => ({ cmd: DivCmd.SAMPLE_MODE, val1: value ? 1 : 0, val2: 0 }),
  /** Set sample frequency - (value: Hz) */
  setFreq: (value: number) => ({ cmd: DivCmd.SAMPLE_FREQ, val1: value, val2: 0 }),
  /** Set sample bank - (value: bank number) */
  setBank: (value: number) => ({ cmd: DivCmd.SAMPLE_BANK, val1: value, val2: 0 }),
  /** Set sample position - (value: position) */
  setPos: (value: number) => ({ cmd: DivCmd.SAMPLE_POS, val1: value, val2: 0 }),
  /** Set sample direction - (value: 0=forward, 1=reverse) */
  setDir: (value: number) => ({ cmd: DivCmd.SAMPLE_DIR, val1: value, val2: 0 }),
} as const;

// Macro control command helpers
export const MacroCommands = {
  /** Turn off specific macro - (which: macro type) */
  off: (which: number) => ({ cmd: DivCmd.MACRO_OFF, val1: which, val2: 0 }),
  /** Turn on specific macro - (which: macro type) */
  on: (which: number) => ({ cmd: DivCmd.MACRO_ON, val1: which, val2: 0 }),
  /** Restart specific macro - (which: macro type) */
  restart: (which: number) => ({ cmd: DivCmd.MACRO_RESTART, val1: which, val2: 0 }),
} as const;

export type OscDataCallback = (channels: (Int16Array | null)[]) => void;

export class FurnaceDispatchEngine {
  private static instance: FurnaceDispatchEngine | null = null;

  private workletNode: AudioWorkletNode | null = null;
  private _nativeCtx: AudioContext | null = null;
  private initialized = false;
  private initializing = false;
  // Multi-chip tracking — Map<platformType, chipInfo>
  // Mirrors Furnace's disCont[] array
  private chips: Map<number, { handle: number; numChannels: number }> = new Map();
  private _audioRouted = false;
  private _sharedGain: GainNode | null = null;

  // Promise for worklet WASM ready
  private _wasmReadyResolve: (() => void) | null = null;
  private _wasmReadyReject: ((err: Error) => void) | null = null;
  private _wasmReadyPromise: Promise<void> | null = null;

  // Promise for chip creation
  private _chipCreatedResolve: (() => void) | null = null;
  private _chipCreatedPromise: Promise<void> | null = null;

  // Oscilloscope data
  private oscCallbacks: Set<OscDataCallback> = new Set();
  private latestOscData: (Int16Array | null)[] = [];

  // Cache for WASM binary and JS code
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;
  private static loadedContexts: WeakSet<AudioContext> = new WeakSet();
  private static initPromises: WeakMap<AudioContext, Promise<void>> = new WeakMap();

  // Effect router for translating tracker effects to dispatch commands
  private effectRouter = new FurnaceEffectRouter();

  private constructor() {}

  static getInstance(): FurnaceDispatchEngine {
    if (!FurnaceDispatchEngine.instance) {
      FurnaceDispatchEngine.instance = new FurnaceDispatchEngine();
    }
    return FurnaceDispatchEngine.instance;
  }

  get isInitialized(): boolean { return this.initialized; }
  /** Channel count for a specific platform (or first chip if unspecified) */
  getChannelCount(platformType?: number): number {
    if (platformType !== undefined) return this.chips.get(platformType)?.numChannels ?? 0;
    return this.chips.values().next().value?.numChannels ?? 0;
  }
  /** @deprecated Use getChannelCount(platformType) */
  get channelCount(): number { return this.getChannelCount(); }
  get platform(): number {
    return this.chips.keys().next().value ?? 0;
  }
  get handle(): number {
    return this.chips.values().next().value?.handle ?? 0;
  }
  /** Check if a chip for the given platform type exists */
  hasChip(platformType: number): boolean {
    return this.chips.has(platformType);
  }

  /** Whether audio is already routed from the worklet to destination */
  get audioRouted(): boolean { return this._audioRouted; }

  /** Get (or create) the shared gain node for worklet output */
  getOrCreateSharedGain(): GainNode | null {
    if (this._sharedGain) return this._sharedGain;
    const workletNode = this.getWorkletNode();
    const engineCtx = this.getNativeCtx();
    if (!workletNode || !engineCtx) return null;
    this._sharedGain = engineCtx.createGain();
    workletNode.connect(this._sharedGain);
    this._sharedGain.connect(engineCtx.destination);
    this._audioRouted = true;
    return this._sharedGain;
  }

  /**
   * Initialize the engine with the given AudioContext.
   * Loads worklet module and WASM binary.
   */
  async init(context: Record<string, unknown>): Promise<void> {
    if (this.initialized || this.initializing) return;
    this.initializing = true;

    try {
      const nativeCtx = getNativeContext(context);
      if (!nativeCtx) throw new Error('Could not get native AudioContext');
      this._nativeCtx = nativeCtx;

      console.log('[FurnaceDispatch] Init starting, context state:', nativeCtx.state);

      // Ensure context is running - audioWorklet operations throw InvalidStateError on suspended contexts
      if (nativeCtx.state !== 'running') {
        console.log('[FurnaceDispatch] Resuming context...');
        try {
          await nativeCtx.resume();
          console.log('[FurnaceDispatch] Context resumed, new state:', nativeCtx.state);
        } catch (e) {
          console.warn('[FurnaceDispatch] Failed to resume AudioContext:', e);
          throw new Error(`AudioContext not running (state: ${nativeCtx.state})`);
        }
      }

      // Double check context is running
      if (nativeCtx.state !== 'running') {
        throw new Error(`AudioContext still not running after resume (state: ${nativeCtx.state})`);
      }

      console.log('[FurnaceDispatch] Loading worklet module...');
      await FurnaceDispatchEngine.ensureModuleLoaded(nativeCtx);
      console.log('[FurnaceDispatch] Worklet module loaded, creating node...');

      // Create worklet node using native AudioWorkletNode
      // (toneCreateAudioWorkletNode was throwing InvalidStateError)
      try {
        this.workletNode = new AudioWorkletNode(nativeCtx, 'furnace-dispatch-processor', {
          outputChannelCount: [2],
          processorOptions: { sampleRate: nativeCtx.sampleRate }
        });
        console.log('[FurnaceDispatch] Worklet node created successfully');
      } catch (nodeErr) {
        console.error('[FurnaceDispatch] Failed to create worklet node:', nodeErr);
        console.error('[FurnaceDispatch] Context state at failure:', nativeCtx.state);
        throw nodeErr;
      }

      // Handle messages from worklet
      this.workletNode.port.onmessage = (event) => {
        this.handleWorkletMessage(event.data);
      };

      // Create WASM ready promise with timeout before sending init
      this._wasmReadyPromise = new Promise<void>((resolve, reject) => {
        this._wasmReadyResolve = resolve;
        this._wasmReadyReject = reject;
        setTimeout(() => reject(new Error('FurnaceDispatch WASM ready timeout after 10s')), 10000);
      });

      // Send init message with WASM binary and JS code
      this.workletNode.port.postMessage({
        type: 'init',
        sampleRate: nativeCtx.sampleRate,
        wasmBinary: FurnaceDispatchEngine.wasmBinary,
        jsCode: FurnaceDispatchEngine.jsCode
      });

      // Wait for worklet WASM compilation to complete
      await this._wasmReadyPromise;

      // CRITICAL: Connect worklet through a silent keepalive to destination.
      // Without a path to destination, the browser never calls process().
      try {
        const keepalive = nativeCtx.createGain();
        keepalive.gain.value = 0;
        this.workletNode!.connect(keepalive);
        keepalive.connect(nativeCtx.destination);
      } catch (e) {
        console.warn('[FurnaceDispatch] Keepalive connection failed:', e);
      }

      this.initialized = true;
    } catch (err) {
      console.error('[FurnaceDispatch] Init failed:', err);
      throw err;
    } finally {
      this.initializing = false;
    }
  }

  private static async ensureModuleLoaded(context: AudioContext): Promise<void> {
    if (this.loadedContexts.has(context)) return;

    const existingPromise = this.initPromises.get(context);
    if (existingPromise) return existingPromise;

    const initPromise = (async () => {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const cacheBuster = `?v=${Date.now()}`;

      // Ensure context is running before loading worklet module
      // audioWorklet.addModule() throws InvalidStateError on suspended contexts
      console.log('[FurnaceDispatch] ensureModuleLoaded: context state =', context.state);
      if (context.state !== 'running') {
        console.log('[FurnaceDispatch] ensureModuleLoaded: resuming context...');
        try {
          await context.resume();
          console.log('[FurnaceDispatch] ensureModuleLoaded: context resumed, state =', context.state);
        } catch (e) {
          console.warn('[FurnaceDispatch] ensureModuleLoaded: failed to resume:', e);
        }
      }

      // Load worklet module
      console.log('[FurnaceDispatch] ensureModuleLoaded: adding worklet module...');
      try {
        await context.audioWorklet.addModule(`${baseUrl}furnace-dispatch/FurnaceDispatch.worklet.js${cacheBuster}`);
        console.log('[FurnaceDispatch] ensureModuleLoaded: worklet module added');
      } catch (e: unknown) {
        // Swallow expected errors:
        // - "already registered" / "duplicate" - module already loaded
        // - "InvalidStateError" - context suspended (will retry when context resumes)
        const msg = (e instanceof Error ? e.message : String(e));
        const name = (e instanceof Error ? e.name : '');
        if (msg.includes('already') || msg.includes('duplicate') || name === 'InvalidStateError') {
          console.log('[FurnaceDispatch] ensureModuleLoaded: worklet already loaded or context suspended');
        } else {
          throw new Error(`Failed to load FurnaceDispatch worklet: ${msg}`);
        }
      }

      // Fetch WASM and JS code (shared across contexts)
      if (!this.wasmBinary || !this.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}furnace-dispatch/FurnaceDispatch.wasm${cacheBuster}`, { cache: 'no-store' }),
          fetch(`${baseUrl}furnace-dispatch/FurnaceDispatch.js${cacheBuster}`, { cache: 'no-store' })
        ]);

        if (wasmResponse.ok) {
          this.wasmBinary = await wasmResponse.arrayBuffer();
        }
        if (jsResponse.ok) {
          let code = await jsResponse.text();
          // Transform Emscripten output for AudioWorklet scope
          // Polyfill URL (not available in AudioWorklet WorkletGlobalScope)
          const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
          code = urlPolyfill + code
            .replace(/import\.meta\.url/g, "'.'")
            .replace(/export\s+default\s+\w+;?/g, '')
            .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
            .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');
          code += '\nvar createFurnaceDispatch = createFurnaceDispatch || Module;';
          this.jsCode = code;
        }
      }

      this.loadedContexts.add(context);
    })();

    this.initPromises.set(context, initPromise);
    return initPromise;
  }

  private handleWorkletMessage(data: Record<string, unknown>): void {
    switch (data.type) {
      case 'ready':
        console.log('[FurnaceDispatch] Worklet ready');
        if (this._wasmReadyResolve) {
          this._wasmReadyResolve();
          this._wasmReadyResolve = null;
        }
        break;

      case 'chipCreated': {
        // Track chip in multi-chip map (Furnace disCont[] pattern)
        this.chips.set(data.platformType as number, {
          handle: data.handle as number,
          numChannels: data.numChannels as number
        });
        // Rebuild osc data array for total channels across all chips
        let totalOscChannels = 0;
        for (const chip of this.chips.values()) totalOscChannels += chip.numChannels;
        this.latestOscData = new Array(totalOscChannels).fill(null);
        console.log(`[FurnaceDispatch] Chip created: platform=${data.platformType}, channels=${data.numChannels}, total chips=${this.chips.size}`);
        if (this._chipCreatedResolve) {
          this._chipCreatedResolve();
          this._chipCreatedResolve = null;
        }
        break;
      }

      case 'oscData':
        this.latestOscData = data.channels as (Int16Array | null)[];
        for (const cb of this.oscCallbacks) {
          cb(data.channels as (Int16Array | null)[]);
        }
        break;

      case 'error':
        console.error('[FurnaceDispatch] Worklet error:', data.message);
        if (this._wasmReadyReject) {
          this._wasmReadyReject(new Error(data.message as string));
          this._wasmReadyReject = null;
          this._wasmReadyResolve = null;
        }
        break;
    }
  }

  /**
   * Create a chip dispatch instance for the given platform.
   * The worklet handles reuse if the same platform already exists.
   */
  async createChip(platformType: number, sampleRate?: number): Promise<void> {
    // Ensure the worklet module is loaded first
    if (this._nativeCtx) {
      await FurnaceDispatchEngine.ensureModuleLoaded(this._nativeCtx);
    }

    if (!this.workletNode) {
      console.error(`[FurnaceDispatch] createChip(${platformType}): workletNode is NULL!`);
      return;
    }

    // Set up chip created promise before sending message
    this._chipCreatedPromise = new Promise<void>((resolve) => {
      this._chipCreatedResolve = resolve;
    });

    this.workletNode.port.postMessage({
      type: 'createChip',
      platformType,
      sampleRate
    });
  }

  /**
   * Wait for the chip to be created in the worklet.
   */
  async waitForChipCreated(): Promise<void> {
    if (this._chipCreatedPromise) {
      await this._chipCreatedPromise;
    }
  }

  /**
   * Send a raw dispatch command, routed to the correct chip by platformType.
   */
  dispatch(cmd: number, chan: number, val1: number = 0, val2: number = 0, platformType?: number): void {
    if (!this.workletNode) return;
    // Log note/instrument commands for debugging
    if (cmd === DivCmd.NOTE_ON || cmd === DivCmd.INSTRUMENT) {
      const cmdName = cmd === DivCmd.NOTE_ON ? 'NOTE_ON' : 'INSTRUMENT';
      console.log(`[FurnaceDispatch] ${cmdName} ch=${chan} val1=${val1} val2=${val2} platform=${platformType}`);
    }
    this.workletNode.port.postMessage({
      type: 'dispatch',
      cmd, chan, val1, val2, platformType
    });
  }

  /**
   * Send a note on command.
   */
  noteOn(chan: number, note: number, platformType?: number): void {
    this.dispatch(DivCmd.NOTE_ON, chan, note, 0, platformType);
  }

  /**
   * Send a note off command.
   */
  noteOff(chan: number, platformType?: number): void {
    this.dispatch(DivCmd.NOTE_OFF, chan, 0, 0, platformType);
  }

  /**
   * Set the instrument on a channel.
   * @param force - If true, forces insChanged even if index hasn't changed.
   *   Required after uploading new instrument data to the same slot.
   */
  setInstrument(chan: number, insIndex: number, platformType?: number, force: boolean = false): void {
    this.dispatch(DivCmd.INSTRUMENT, chan, insIndex, force ? 1 : 0, platformType);
  }

  /**
   * Set channel volume.
   */
  setVolume(chan: number, volume: number, platformType?: number): void {
    this.dispatch(DivCmd.VOLUME, chan, volume, 0, platformType);
  }

  /**
   * Set a Game Boy instrument via binary data.
   */
  setGBInstrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'setGBInstrument',
      insIndex, insData, platformType
    });
  }

  /**
   * Set a wavetable via binary data.
   */
  setWavetable(waveIndex: number, waveData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'setWavetable',
      waveIndex, waveData, platformType
    });
  }

  // ========== Full Instrument Setters ==========

  /**
   * Set an FM instrument (OPN2, OPM, OPL, OPLL, etc.)
   * @param insIndex - Instrument slot (0-255)
   * @param insData - Binary FM instrument data
   */
  setFMInstrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setFMInstrument', insIndex, insData, platformType });
  }

  setC64Instrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setC64Instrument', insIndex, insData, platformType });
  }

  setNESInstrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setNESInstrument', insIndex, insData, platformType });
  }

  setSNESInstrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setSNESInstrument', insIndex, insData, platformType });
  }

  setN163Instrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setN163Instrument', insIndex, insData, platformType });
  }

  setFDSInstrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setFDSInstrument', insIndex, insData, platformType });
  }

  /**
   * Upload a generic Furnace instrument (any chip type)
   */
  uploadFurnaceInstrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) {
      console.error(`[FurnaceDispatch] Cannot upload instrument ${insIndex}: workletNode is null!`);
      return;
    }
    console.log(`[FurnaceDispatch] Uploading instrument ${insIndex}, ${insData.length} bytes, platform=${platformType}`);
    this.workletNode.port.postMessage({ type: 'setInstrumentFull', insIndex, insData, platformType });
  }

  setAmigaInstrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setAmigaInstrument', insIndex, insData, platformType });
  }

  setMultiPCMInstrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMultiPCMInstrument', insIndex, insData, platformType });
  }

  setES5506Instrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setES5506Instrument', insIndex, insData, platformType });
  }

  setESFMInstrument(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setESFMInstrument', insIndex, insData, platformType });
  }

  setWaveSynth(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setWaveSynth', insIndex, insData, platformType });
  }

  setMacro(insIndex: number, macroData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMacro', insIndex, macroData, platformType });
  }

  setInstrumentFull(insIndex: number, insData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setInstrumentFull', insIndex, insData, platformType });
  }

  setSample(sampleIndex: number, sampleData: Uint8Array, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setSample', sampleIndex, sampleData, platformType });
  }

  renderSamples(platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'renderSamples', platformType });
  }

  // ========== Macro Control ==========

  setMacrosEnabled(enabled: boolean, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setMacrosEnabled', enabled, platformType });
  }

  clearMacros(insIndex: number, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'clearMacros', insIndex, platformType });
  }

  releaseMacros(chan: number, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'releaseMacros', chan, platformType });
  }

  // ========== Compatibility Flags ==========

  /**
   * Set all compatibility flags at once
   * @param flags - Object with flag values
   */
  setCompatFlags(flags: CompatFlags, platformType?: number): void {
    if (!this.workletNode) return;

    // Convert flags object to byte array in struct order
    const flagArray = new Uint8Array(57);
    flagArray[0] = flags.limitSlides ? 1 : 0;
    flagArray[1] = flags.linearPitch ?? 2; // Default to full linear
    flagArray[2] = flags.pitchSlideSpeed ?? 0;
    flagArray[3] = flags.loopModality ?? 0;
    flagArray[4] = flags.delayBehavior ?? 0;
    flagArray[5] = flags.jumpTreatment ?? 0;
    flagArray[6] = flags.properNoiseLayout ? 1 : 0;
    flagArray[7] = flags.waveDutyIsVol ? 1 : 0;
    flagArray[8] = flags.resetMacroOnPorta ? 1 : 0;
    flagArray[9] = flags.legacyVolumeSlides ? 1 : 0;
    flagArray[10] = flags.compatibleArpeggio ? 1 : 0;
    flagArray[11] = flags.noteOffResetsSlides ? 1 : 0;
    flagArray[12] = flags.targetResetsSlides ? 1 : 0;
    flagArray[13] = flags.arpNonPorta ? 1 : 0;
    flagArray[14] = flags.algMacroBehavior ? 1 : 0;
    flagArray[15] = flags.brokenShortcutSlides ? 1 : 0;
    flagArray[16] = flags.ignoreDuplicateSlides ? 1 : 0;
    flagArray[17] = flags.stopPortaOnNoteOff ? 1 : 0;
    flagArray[18] = flags.continuousVibrato ? 1 : 0;
    flagArray[19] = flags.brokenDACMode ? 1 : 0;
    flagArray[20] = flags.oneTickCut ? 1 : 0;
    flagArray[21] = flags.newInsTriggersInPorta ? 1 : 0;
    flagArray[22] = flags.arp0Reset ? 1 : 0;
    flagArray[23] = flags.brokenSpeedSel ? 1 : 0;
    flagArray[24] = flags.noSlidesOnFirstTick ? 1 : 0;
    flagArray[25] = flags.rowResetsArpPos ? 1 : 0;
    flagArray[26] = flags.ignoreJumpAtEnd ? 1 : 0;
    flagArray[27] = flags.buggyPortaAfterSlide ? 1 : 0;
    flagArray[28] = flags.gbInsAffectsEnvelope ? 1 : 0;
    flagArray[29] = flags.sharedExtStat ? 1 : 0;
    flagArray[30] = flags.ignoreDACModeOutsideChannel ? 1 : 0;
    flagArray[31] = flags.e1e2AlsoTakePriority ? 1 : 0;
    flagArray[32] = flags.newSegaPCM ? 1 : 0;
    flagArray[33] = flags.fbPortaPause ? 1 : 0;
    flagArray[34] = flags.snDutyReset ? 1 : 0;
    flagArray[35] = flags.pitchMacroIsLinear ? 1 : 0;
    flagArray[36] = flags.oldOctaveBoundary ? 1 : 0;
    flagArray[37] = flags.noOPN2Vol ? 1 : 0;
    flagArray[38] = flags.newVolumeScaling ? 1 : 0;
    flagArray[39] = flags.volMacroLinger ? 1 : 0;
    flagArray[40] = flags.brokenOutVol ? 1 : 0;
    flagArray[41] = flags.brokenOutVol2 ? 1 : 0;
    flagArray[42] = flags.e1e2StopOnSameNote ? 1 : 0;
    flagArray[43] = flags.brokenPortaArp ? 1 : 0;
    flagArray[44] = flags.snNoLowPeriods ? 1 : 0;
    flagArray[45] = flags.disableSampleMacro ? 1 : 0;
    flagArray[46] = flags.oldArpStrategy ? 1 : 0;
    flagArray[47] = flags.brokenPortaLegato ? 1 : 0;
    flagArray[48] = flags.brokenFMOff ? 1 : 0;
    flagArray[49] = flags.preNoteNoEffect ? 1 : 0;
    flagArray[50] = flags.oldDPCM ? 1 : 0;
    flagArray[51] = flags.resetArpPhaseOnNewNote ? 1 : 0;
    flagArray[52] = flags.ceilVolumeScaling ? 1 : 0;
    flagArray[53] = flags.oldAlwaysSetVolume ? 1 : 0;
    flagArray[54] = flags.oldSampleOffset ? 1 : 0;
    flagArray[55] = flags.oldCenterRate ? 1 : 0;
    flagArray[56] = flags.noVolSlideReset ? 1 : 0;

    this.workletNode.port.postMessage({ type: 'setCompatFlags', flags: flagArray, platformType });
  }

  setCompatFlag(flagIndex: number, value: number, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setCompatFlag', flagIndex, value, platformType });
  }

  resetCompatFlags(platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'resetCompatFlags', platformType });
  }

  setLinearPitch(mode: 0 | 1 | 2, platformType?: number): void {
    this.setCompatFlag(CompatFlag.LINEAR_PITCH, mode, platformType);
  }

  setTickRate(hz: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setTickRate', hz });
  }

  reset(platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'reset', platformType });
  }

  forceIns(platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'forceIns', platformType });
  }

  mute(chan: number, muted: boolean, platformType?: number): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'mute', chan, mute: muted, platformType });
  }

  /**
   * Subscribe to oscilloscope data updates (~30fps).
   */
  onOscData(callback: OscDataCallback): () => void {
    this.oscCallbacks.add(callback);
    return () => { this.oscCallbacks.delete(callback); };
  }

  /**
   * Get the latest oscilloscope data for all channels.
   */
  getOscData(): (Int16Array | null)[] {
    return this.latestOscData;
  }

  /**
   * Get the worklet node for audio graph connection.
   */
  getWorkletNode(): AudioWorkletNode | null {
    return this.workletNode;
  }

  /**
   * Get the native AudioContext the engine was initialized with.
   * Needed for creating native GainNodes in the same context as the worklet.
   */
  getNativeCtx(): AudioContext | null {
    return this._nativeCtx;
  }

  // ========== Platform-Specific Dispatch Helpers ==========

  /**
   * Send an FM command using the FMCommands helper
   * @param chan - Channel number
   * @param command - Command object from FMCommands
   */
  dispatchFM(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  dispatchC64(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  dispatchSNES(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  dispatchGB(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  dispatchNES(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  dispatchAY(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  dispatchES5506(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  dispatchN163(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  dispatchSample(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  dispatchMacro(chan: number, command: { cmd: number; val1: number; val2: number }, platformType?: number): void {
    this.dispatch(command.cmd, chan, command.val1, command.val2, platformType);
  }

  // ========== Effect Routing ==========

  /**
   * Apply a tracker effect command, translating it to the appropriate
   * dispatch commands for the current platform.
   * @param chan - Channel number
   * @param effect - Effect code (0x00-0xFF)
   * @param param - Effect parameter (0x00-0xFF)
   */
  applyEffect(chan: number, effect: number, param: number, platformType?: number): void {
    const pt = platformType ?? this.platform;
    const commands = this.effectRouter.routeEffect(pt, chan, effect, param);
    for (const cmd of commands) {
      this.dispatch(cmd.cmd, cmd.chan, cmd.val1, cmd.val2, platformType);
    }
  }

  applyExtendedEffect(chan: number, x: number, y: number, platformType?: number): void {
    const pt = platformType ?? this.platform;
    const commands = this.effectRouter.routeExtendedEffect(pt, chan, x, y);
    for (const cmd of commands) {
      this.dispatch(cmd.cmd, cmd.chan, cmd.val1, cmd.val2, platformType);
    }
  }

  applyPlatformEffect(chan: number, effect: number, param: number, platformType?: number): void {
    const pt = platformType ?? this.platform;
    const commands = this.effectRouter.routePlatformEffect(pt, chan, effect, param);
    for (const cmd of commands) {
      this.dispatch(cmd.cmd, cmd.chan, cmd.val1, cmd.val2, platformType);
    }
  }

  /**
   * Reset effect memory for all channels (call on song stop/restart).
   */
  resetEffectMemory(): void {
    this.effectRouter.resetMemory();
  }

  /**
   * Get the effect router instance for direct access if needed.
   */
  getEffectRouter(): FurnaceEffectRouter {
    return this.effectRouter;
  }

  /**
   * Dispose the engine and clean up resources.
   */
  dispose(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'dispose' });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    this.initialized = false;
    this.chips.clear();
    this._audioRouted = false;
    if (this._sharedGain) {
      try { this._sharedGain.disconnect(); } catch { /* already disconnected */ }
      this._sharedGain = null;
    }
    this.oscCallbacks.clear();
    this.latestOscData = [];
    FurnaceDispatchEngine.instance = null;
  }
}
