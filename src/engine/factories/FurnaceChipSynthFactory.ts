/**
 * FurnaceChipSynthFactory - Creates Furnace chip synth instances.
 * Extracted from InstrumentFactory.ts
 */

import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { FurnaceSynth } from '../FurnaceSynth';
import { FurnaceChipType } from '../chips/FurnaceChipEngine';
import { BuzzmachineGenerator } from '../buzzmachines/BuzzmachineGenerator';
import { BuzzmachineType } from '../buzzmachines/BuzzmachineEngine';
import { getNormalizedVolume } from './volumeNormalization';

export { FurnaceChipType };

export { SYNTH_TO_DISPATCH } from '../furnace-dispatch/synthPlatforms';


export function createFurnace(config: InstrumentConfig): FurnaceSynth {
  if (!config.furnace) {
    throw new Error('Furnace config required for Furnace synth type');
  }
  return new FurnaceSynth(config.furnace);
}

export function createBuzzmachine(config: InstrumentConfig): BuzzmachineGenerator {
  // Get machine type from config or default to ArguruDistortion
  const machineTypeStr = config.buzzmachine?.machineType || 'ArguruDistortion';

  // Map string machine type to BuzzmachineType enum
  const machineTypeMap: Record<string, BuzzmachineType> = {
    // Distortion/Saturation
    'ArguruDistortion': BuzzmachineType.ARGURU_DISTORTION,
    'ElakDist2': BuzzmachineType.ELAK_DIST2,
    'JeskolaDistortion': BuzzmachineType.JESKOLA_DISTORTION,
    'GeonikOverdrive': BuzzmachineType.GEONIK_OVERDRIVE,
    'GraueSoftSat': BuzzmachineType.GRAUE_SOFTSAT,
    'WhiteNoiseStereoDist': BuzzmachineType.WHITENOISE_STEREODIST,
    // Filters
    'ElakSVF': BuzzmachineType.ELAK_SVF,
    'CyanPhaseNotch': BuzzmachineType.CYANPHASE_NOTCH,
    'QZfilter': BuzzmachineType.Q_ZFILTER,
    'FSMPhilta': BuzzmachineType.FSM_PHILTA,
    // Delay/Reverb
    'JeskolaDelay': BuzzmachineType.JESKOLA_DELAY,
    'JeskolaCrossDelay': BuzzmachineType.JESKOLA_CROSSDELAY,
    'JeskolaFreeverb': BuzzmachineType.JESKOLA_FREEVERB,
    'FSMPanzerDelay': BuzzmachineType.FSM_PANZERDELAY,
    // Chorus/Modulation
    'FSMChorus': BuzzmachineType.FSM_CHORUS,
    'FSMChorus2': BuzzmachineType.FSM_CHORUS2,
    'WhiteNoiseWhiteChorus': BuzzmachineType.WHITENOISE_WHITECHORUS,
    'BigyoFrequencyShifter': BuzzmachineType.BIGYO_FREQUENCYSHIFTER,
    // Dynamics
    'GeonikCompressor': BuzzmachineType.GEONIK_COMPRESSOR,
    'LdSLimit': BuzzmachineType.LD_SLIMIT,
    'OomekExciter': BuzzmachineType.OOMEK_EXCITER,
    'OomekMasterizer': BuzzmachineType.OOMEK_MASTERIZER,
    'DedaCodeStereoGain': BuzzmachineType.DEDACODE_STEREOGAIN,
    // Generators
    'FSMKick': BuzzmachineType.FSM_KICK,
    'FSMKickXP': BuzzmachineType.FSM_KICKXP,
    'JeskolaTrilok': BuzzmachineType.JESKOLA_TRILOK,
    'JeskolaNoise': BuzzmachineType.JESKOLA_NOISE,
    'OomekAggressor': BuzzmachineType.OOMEK_AGGRESSOR,
    'MadBrain4FM2F': BuzzmachineType.MADBRAIN_4FM2F,
    'MadBrainDynamite6': BuzzmachineType.MADBRAIN_DYNAMITE6,
    'MakkM3': BuzzmachineType.MAKK_M3,
    'CyanPhaseDTMF': BuzzmachineType.CYANPHASE_DTMF,
    'ElenzilFrequencyBomb': BuzzmachineType.ELENZIL_FREQUENCYBOMB,
  };

  const machineType = machineTypeMap[machineTypeStr] ?? BuzzmachineType.ARGURU_DISTORTION;
  const synth = new BuzzmachineGenerator(machineType);
  const normalizedVolume = getNormalizedVolume('Buzzmachine', config.volume);
  synth.output.gain.value = Tone.dbToGain(normalizedVolume);
  synth.applyConfig(config.buzzmachine);
  return synth;
}

/**
 * Chip-specific default configs for different Furnace chip types
 * These provide characteristic sounds for each chip family
 */
export const CHIP_DEFAULTS: Record<number, Partial<import('@typedefs/instrument').FurnaceConfig>> = {
  // FM Chips - use 4-operator FM synthesis
  // FurnaceChipType: OPN2=0, OPM=1, OPL3=2, OPLL=11, etc.
  0: { // OPN2 (Genesis) - punchy bass
    algorithm: 4, feedback: 5,
    operators: [
      { enabled: true, mult: 1, tl: 20, ar: 31, dr: 8, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
      { enabled: true, mult: 2, tl: 30, ar: 31, dr: 12, d2r: 0, sl: 4, rr: 6, dt: 3, am: false },
      { enabled: true, mult: 1, tl: 25, ar: 31, dr: 10, d2r: 0, sl: 3, rr: 8, dt: 0, am: false },
      { enabled: true, mult: 4, tl: 35, ar: 28, dr: 15, d2r: 0, sl: 5, rr: 10, dt: -1, am: false },
    ],
  },
  1: { // OPM (X68000) - bright lead
    algorithm: 5, feedback: 6,
    operators: [
      { enabled: true, mult: 1, tl: 15, ar: 31, dr: 5, d2r: 0, sl: 1, rr: 6, dt: 0, am: false },
      { enabled: true, mult: 3, tl: 40, ar: 31, dr: 8, d2r: 0, sl: 3, rr: 8, dt: 2, am: false },
      { enabled: true, mult: 2, tl: 35, ar: 31, dr: 10, d2r: 0, sl: 4, rr: 8, dt: -2, am: false },
      { enabled: true, mult: 1, tl: 25, ar: 31, dr: 12, d2r: 0, sl: 5, rr: 10, dt: 0, am: true },
    ],
  },
  2: { // OPL3 (AdLib) - organ-like
    algorithm: 0, feedback: 3,
    operators: [
      { enabled: true, mult: 2, tl: 30, ar: 15, dr: 4, d2r: 0, sl: 8, rr: 5, dt: 0, ws: 1, am: false },
      { enabled: true, mult: 1, tl: 0, ar: 15, dr: 2, d2r: 0, sl: 4, rr: 8, dt: 0, ws: 0, am: false },
      { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, ws: 0, am: false },
      { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, ws: 0, am: false },
    ],
  },
  11: { // OPLL - simple FM
    algorithm: 0, feedback: 2,
    operators: [
      { enabled: true, mult: 4, tl: 35, ar: 15, dr: 5, d2r: 0, sl: 6, rr: 7, dt: 0, am: false },
      { enabled: true, mult: 1, tl: 0, ar: 15, dr: 3, d2r: 0, sl: 3, rr: 6, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 63, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
  },
  // Console chips - PSG style, use simpler synthesis
  4: { // NES (2A03) - 8-bit pulse
    algorithm: 7, feedback: 0,
    operators: [
      { enabled: true, mult: 1, tl: 0, ar: 31, dr: 0, d2r: 0, sl: 0, rr: 12, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
  },
  5: { // Game Boy - lo-fi pulse
    algorithm: 7, feedback: 0,
    operators: [
      { enabled: true, mult: 1, tl: 5, ar: 28, dr: 2, d2r: 0, sl: 2, rr: 10, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
  },
  3: { // PSG (SN76489) - square wave
    algorithm: 7, feedback: 0,
    operators: [
      { enabled: true, mult: 1, tl: 8, ar: 31, dr: 4, d2r: 0, sl: 3, rr: 8, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
  },
  12: { // AY-3-8910 - buzzy PSG
    algorithm: 7, feedback: 1,
    operators: [
      { enabled: true, mult: 1, tl: 10, ar: 31, dr: 6, d2r: 2, sl: 4, rr: 6, dt: 0, am: false },
      { enabled: true, mult: 3, tl: 50, ar: 31, dr: 8, d2r: 0, sl: 8, rr: 10, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
  },
  10: { // C64 SID - gritty
    algorithm: 4, feedback: 4,
    operators: [
      { enabled: true, mult: 1, tl: 15, ar: 25, dr: 8, d2r: 3, sl: 5, rr: 8, dt: 0, am: false },
      { enabled: true, mult: 2, tl: 35, ar: 31, dr: 10, d2r: 0, sl: 6, rr: 10, dt: 1, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
  },
  6: { // PCE/TurboGrafx - wavetable style
    algorithm: 6, feedback: 2,
    operators: [
      { enabled: true, mult: 1, tl: 12, ar: 31, dr: 5, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
      { enabled: true, mult: 2, tl: 40, ar: 31, dr: 8, d2r: 0, sl: 4, rr: 10, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
  },
  9: { // VRC6 - rich pulse
    algorithm: 5, feedback: 0,
    operators: [
      { enabled: true, mult: 1, tl: 5, ar: 31, dr: 3, d2r: 0, sl: 1, rr: 10, dt: 0, am: false },
      { enabled: true, mult: 2, tl: 30, ar: 31, dr: 6, d2r: 0, sl: 3, rr: 12, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
  },
  8: { // N163 - wavetable
    algorithm: 7, feedback: 0,
    operators: [
      { enabled: true, mult: 1, tl: 8, ar: 31, dr: 4, d2r: 0, sl: 2, rr: 8, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
    wavetables: [{ id: 0, data: [8,10,12,14,15,14,12,10,8,6,4,2,1,2,4,6] }],
  },
  15: { // TIA (Atari 2600) - harsh
    algorithm: 7, feedback: 7,
    operators: [
      { enabled: true, mult: 1, tl: 20, ar: 31, dr: 15, d2r: 5, sl: 8, rr: 4, dt: 0, am: false },
      { enabled: true, mult: 5, tl: 45, ar: 31, dr: 20, d2r: 0, sl: 10, rr: 6, dt: 2, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
      { enabled: false, mult: 1, tl: 127, ar: 0, dr: 0, d2r: 0, sl: 0, rr: 0, dt: 0, am: false },
    ],
  },
};

/**
 * Create Furnace synth with specific chip type
 * Used for the individual chip type synths (FurnaceOPN, FurnaceNES, etc.)
 */
export function createFurnaceWithChip(config: InstrumentConfig, chipType: number): FurnaceSynth {
  // Get chip-specific defaults or fall back to generic FM
  const chipDefaults = CHIP_DEFAULTS[chipType] || {
    algorithm: 0, feedback: 0,
    operators: [
      { enabled: true, mult: 1, tl: 0, ar: 31, dr: 0, d2r: 0, sl: 0, rr: 15, dt: 0, am: false },
      { enabled: true, mult: 2, tl: 40, ar: 31, dr: 10, d2r: 5, sl: 8, rr: 8, dt: 0, am: false },
      { enabled: true, mult: 1, tl: 40, ar: 31, dr: 10, d2r: 5, sl: 8, rr: 8, dt: 0, am: false },
      { enabled: true, mult: 1, tl: 20, ar: 31, dr: 15, d2r: 0, sl: 4, rr: 10, dt: 0, am: false },
    ],
  };

  const baseConfig = config.furnace || {
    algorithm: chipDefaults.algorithm ?? 0,
    feedback: chipDefaults.feedback ?? 0,
    operators: chipDefaults.operators || [],
    macros: [],
    opMacros: [],
    wavetables: chipDefaults.wavetables || [],
  };
  // Create new object with overridden chip type (to avoid mutating frozen presets)
  const furnaceConfig = {
    ...baseConfig,
    chipType,
  };
  return new FurnaceSynth(furnaceConfig);
}

export { getDefaultFurnaceConfig } from './furnaceDefaultConfig';

