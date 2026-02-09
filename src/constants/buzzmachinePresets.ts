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
  'High Pass': {
    machineType: BuzzmachineType.ELAK_SVF,
    parameters: {
      0: 700,    // Cutoff: 700/1000 (higher)
      1: 0x400,  // Resonance: Medium-Low
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

  // Generators
  [BuzzmachineType.FSM_KICK]: {
    'Hard Kick': { machineType: BuzzmachineType.FSM_KICK, parameters: { 0: 100, 1: 80 } },
    'Soft Kick': { machineType: BuzzmachineType.FSM_KICK, parameters: { 0: 60, 1: 40 } },
    'Long 808-ish': { machineType: BuzzmachineType.FSM_KICK, parameters: { 0: 80, 1: 120 } }
  },
  [BuzzmachineType.FSM_KICKXP]: {
    'Init KickXP': { machineType: BuzzmachineType.FSM_KICKXP, parameters: {} },
    'Extreme Kick': { machineType: BuzzmachineType.FSM_KICKXP, parameters: { 0: 127, 1: 127 } }
  },
  [BuzzmachineType.JESKOLA_TRILOK]: {
    'Punchy BD': { machineType: BuzzmachineType.JESKOLA_TRILOK, parameters: { 0: 80, 1: 60 } },
    'Deep BD': { machineType: BuzzmachineType.JESKOLA_TRILOK, parameters: { 0: 40, 1: 90 } }
  },
  [BuzzmachineType.JESKOLA_NOISE]: {
    'White Noise': { machineType: BuzzmachineType.JESKOLA_NOISE, parameters: { 0: 0 } },
    'Pink Noise': { machineType: BuzzmachineType.JESKOLA_NOISE, parameters: { 0: 1 } },
    'Noisy FX': { machineType: BuzzmachineType.JESKOLA_NOISE, parameters: { 0: 2, 1: 100 } }
  },
  [BuzzmachineType.OOMEK_AGGRESSOR]: {
    'Acid Bass': { machineType: BuzzmachineType.OOMEK_AGGRESSOR, parameters: { 1: 0x78, 2: 0x60, 3: 0x50, 4: 0x40 } },
    'Squelchy Lead': { machineType: BuzzmachineType.OOMEK_AGGRESSOR, parameters: { 1: 0xA0, 2: 0x7F, 3: 0x60, 4: 0x50 } },
    'Soft Sub': { machineType: BuzzmachineType.OOMEK_AGGRESSOR, parameters: { 1: 0x30, 2: 0x20, 3: 0x20, 4: 0x60 } }
  },
  [BuzzmachineType.OOMEK_AGGRESSOR_DF]: {
    'DF Screamer': { machineType: BuzzmachineType.OOMEK_AGGRESSOR_DF, parameters: { 1: 0xB0, 2: 0x7F, 13: 1, 15: 2 } },
    'DF Infinite': { machineType: BuzzmachineType.OOMEK_AGGRESSOR_DF, parameters: { 1: 0x60, 10: 100, 9: 127 } }
  },
  [BuzzmachineType.MADBRAIN_4FM2F]: {
    'FM Bass': { machineType: BuzzmachineType.MADBRAIN_4FM2F, parameters: { 0: 10, 1: 80, 2: 40 } },
    'FM Lead': { machineType: BuzzmachineType.MADBRAIN_4FM2F, parameters: { 0: 40, 1: 100, 2: 60 } },
    'FM Pad': { machineType: BuzzmachineType.MADBRAIN_4FM2F, parameters: { 0: 60, 1: 50, 2: 100 } }
  },
  [BuzzmachineType.MADBRAIN_DYNAMITE6]: {
    'Additive Lead': { machineType: BuzzmachineType.MADBRAIN_DYNAMITE6, parameters: { 0: 80, 1: 40 } },
    'Organ-like': { machineType: BuzzmachineType.MADBRAIN_DYNAMITE6, parameters: { 0: 60, 1: 100 } }
  },
  [BuzzmachineType.MAKK_M3]: {
    'M3 Lead': { machineType: BuzzmachineType.MAKK_M3, parameters: { 0: 64, 1: 64 } },
    'M3 Bass': { machineType: BuzzmachineType.MAKK_M3, parameters: { 0: 127, 1: 32 } }
  },
  [BuzzmachineType.MAKK_M4]: {
    'M4 Wavetable': { machineType: BuzzmachineType.MAKK_M4, parameters: { 0: 0 } },
    'M4 Sweep': { machineType: BuzzmachineType.MAKK_M4, parameters: { 0: 50, 1: 100 } }
  },
  [BuzzmachineType.CYANPHASE_DTMF]: {
    'Phone Tones': { machineType: BuzzmachineType.CYANPHASE_DTMF, parameters: {} }
  },
  [BuzzmachineType.ELENZIL_FREQUENCYBOMB]: {
    'Freq Bomb': { machineType: BuzzmachineType.ELENZIL_FREQUENCYBOMB, parameters: { 0: 100 } }
  },

  // Effects without exposed parameters
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
