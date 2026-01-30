/**
 * Buzzmachine Presets
 *
 * Factory presets for Buzz machine effects and generators.
 * Presets are organized by machine type and provide useful starting points.
 */

import type { BuzzmachineConfig } from '../types/instrument';
import { BuzzmachineType } from '../engine/buzzmachines/BuzzmachineEngine';

/**
 * Arguru Distortion Presets
 */
const ARGURU_DISTORTION_PRESETS: Record<string, BuzzmachineConfig> = {
  'Soft Clip': {
    machineType: BuzzmachineType.ARGURU_DISTORTION,
    parameters: {
      0: 0x0100, // Input Gain: 1.0x
      1: 0x400,  // Threshold (-): High
      2: 0x400,  // Threshold (+): High
      3: 0x0400, // Output Gain: 1.0x
      4: 0x00,   // Phase Inversor: Off
      5: 0x00,   // Mode: Clip
    },
  },
  'Hard Clip': {
    machineType: BuzzmachineType.ARGURU_DISTORTION,
    parameters: {
      0: 0x0200, // Input Gain: 2.0x
      1: 0x100,  // Threshold (-): Low
      2: 0x100,  // Threshold (+): Low
      3: 0x0300, // Output Gain: 0.75x
      4: 0x00,   // Phase Inversor: Off
      5: 0x00,   // Mode: Clip
    },
  },
  'Soft Saturate': {
    machineType: BuzzmachineType.ARGURU_DISTORTION,
    parameters: {
      0: 0x0150, // Input Gain: 1.3x
      1: 0x600,  // Threshold (-): Medium-High
      2: 0x600,  // Threshold (+): Medium-High
      3: 0x0400, // Output Gain: 1.0x
      4: 0x00,   // Phase Inversor: Off
      5: 0x01,   // Mode: Saturate
    },
  },
  'Heavy Saturate': {
    machineType: BuzzmachineType.ARGURU_DISTORTION,
    parameters: {
      0: 0x0300, // Input Gain: 3.0x
      1: 0x200,  // Threshold (-): Low
      2: 0x200,  // Threshold (+): Low
      3: 0x0500, // Output Gain: 1.25x
      4: 0x00,   // Phase Inversor: Off
      5: 0x01,   // Mode: Saturate
    },
  },
  'Tube Warmth': {
    machineType: BuzzmachineType.ARGURU_DISTORTION,
    parameters: {
      0: 0x0120, // Input Gain: 1.1x
      1: 0x700,  // Threshold (-): High
      2: 0x700,  // Threshold (+): High
      3: 0x0380, // Output Gain: 0.9x
      4: 0x00,   // Phase Inversor: Off
      5: 0x01,   // Mode: Saturate
    },
  },
  'Stereo Width': {
    machineType: BuzzmachineType.ARGURU_DISTORTION,
    parameters: {
      0: 0x0100, // Input Gain: 1.0x
      1: 0x400,  // Threshold (-): Medium
      2: 0x400,  // Threshold (+): Medium
      3: 0x0400, // Output Gain: 1.0x
      4: 0x01,   // Phase Inversor: On (stereo effect)
      5: 0x00,   // Mode: Clip
    },
  },
};

/**
 * Elak SVF (State Variable Filter) Presets
 */
const ELAK_SVF_PRESETS: Record<string, BuzzmachineConfig> = {
  'Low Pass': {
    machineType: BuzzmachineType.ELAK_SVF,
    parameters: {
      0: 500,    // Cutoff: 500/1000 (mid-range)
      1: 0x200,  // Resonance: Low
    },
  },
  'Low Pass Resonant': {
    machineType: BuzzmachineType.ELAK_SVF,
    parameters: {
      0: 300,    // Cutoff: 300/1000 (darker)
      1: 0xA000, // Resonance: High
    },
  },
  'TB-303 Style': {
    machineType: BuzzmachineType.ELAK_SVF,
    parameters: {
      0: 400,    // Cutoff: 400/1000
      1: 0xC000, // Resonance: Very High (self-oscillation)
    },
  },
  'High Pass': {
    machineType: BuzzmachineType.ELAK_SVF,
    parameters: {
      0: 700,    // Cutoff: 700/1000 (higher)
      1: 0x400,  // Resonance: Medium-Low
    },
  },
  'Band Pass': {
    machineType: BuzzmachineType.ELAK_SVF,
    parameters: {
      0: 500,    // Cutoff: 500/1000 (center)
      1: 0x8000, // Resonance: Medium-High (narrow band)
    },
  },
  'Vowel Filter': {
    machineType: BuzzmachineType.ELAK_SVF,
    parameters: {
      0: 350,    // Cutoff: 350/1000 (formant range)
      1: 0xE000, // Resonance: Very High
    },
  },
};

/**
 * All buzzmachine presets indexed by BuzzmachineType
 * Machines without defined parameters have empty preset objects
 */
export const BUZZMACHINE_PRESETS: Partial<Record<BuzzmachineType, Record<string, BuzzmachineConfig>>> = {
  // Effects with parameters
  [BuzzmachineType.ARGURU_DISTORTION]: ARGURU_DISTORTION_PRESETS,
  [BuzzmachineType.ELAK_SVF]: ELAK_SVF_PRESETS,

  // Generators - presets could be added when WASM parameters are extracted
  [BuzzmachineType.FSM_KICK]: {},
  [BuzzmachineType.FSM_KICKXP]: {},
  [BuzzmachineType.JESKOLA_TRILOK]: {},
  [BuzzmachineType.JESKOLA_NOISE]: {},
  [BuzzmachineType.OOMEK_AGGRESSOR]: {},
  [BuzzmachineType.MADBRAIN_4FM2F]: {},
  [BuzzmachineType.MADBRAIN_DYNAMITE6]: {},
  [BuzzmachineType.MAKK_M3]: {},
  [BuzzmachineType.CYANPHASE_DTMF]: {},
  [BuzzmachineType.ELENZIL_FREQUENCYBOMB]: {},

  // Effects without exposed parameters (WASM-internal)
  [BuzzmachineType.ELAK_DIST2]: {},
  [BuzzmachineType.JESKOLA_DISTORTION]: {},
  [BuzzmachineType.GEONIK_OVERDRIVE]: {},
  [BuzzmachineType.GRAUE_SOFTSAT]: {},
  [BuzzmachineType.WHITENOISE_STEREODIST]: {},
  [BuzzmachineType.CYANPHASE_NOTCH]: {},
  [BuzzmachineType.Q_ZFILTER]: {},
  [BuzzmachineType.FSM_PHILTA]: {},
  [BuzzmachineType.JESKOLA_DELAY]: {},
  [BuzzmachineType.JESKOLA_CROSSDELAY]: {},
  [BuzzmachineType.JESKOLA_FREEVERB]: {},
  [BuzzmachineType.FSM_PANZERDELAY]: {},
  [BuzzmachineType.FSM_CHORUS]: {},
  [BuzzmachineType.FSM_CHORUS2]: {},
  [BuzzmachineType.WHITENOISE_WHITECHORUS]: {},
  [BuzzmachineType.BIGYO_FREQUENCYSHIFTER]: {},
  [BuzzmachineType.GEONIK_COMPRESSOR]: {},
  [BuzzmachineType.LD_SLIMIT]: {},
  [BuzzmachineType.OOMEK_EXCITER]: {},
  [BuzzmachineType.OOMEK_MASTERIZER]: {},
  [BuzzmachineType.DEDACODE_STEREOGAIN]: {},
};

/**
 * Get presets for a specific machine type
 */
export function getBuzzmachinePresets(
  machineType: BuzzmachineType
): Record<string, BuzzmachineConfig> {
  return BUZZMACHINE_PRESETS[machineType] || {};
}

/**
 * Get preset names for a machine type
 */
export function getBuzzmachinePresetNames(
  machineType: BuzzmachineType
): string[] {
  return Object.keys(getBuzzmachinePresets(machineType));
}

/**
 * Check if a machine type has presets
 */
export function hasBuzzmachinePresets(machineType: BuzzmachineType): boolean {
  const presets = BUZZMACHINE_PRESETS[machineType];
  return presets !== undefined && Object.keys(presets).length > 0;
}

/**
 * Get default config for a machine type
 */
export function getDefaultBuzzmachineConfig(machineType: BuzzmachineType): BuzzmachineConfig {
  return {
    machineType,
    parameters: {},
  };
}
