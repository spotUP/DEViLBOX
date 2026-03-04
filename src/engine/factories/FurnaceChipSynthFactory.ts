/**
 * FurnaceChipSynthFactory - Creates Furnace chip synth instances.
 * Extracted from InstrumentFactory.ts
 */

import * as Tone from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_FURNACE } from '@/types/instrument';
import { FurnaceSynth } from '../FurnaceSynth';
import { FurnaceChipType } from '../chips/FurnaceChipEngine';
import { FurnaceDispatchPlatform } from '../furnace-dispatch';
import { BuzzmachineGenerator } from '../buzzmachines/BuzzmachineGenerator';
import { BuzzmachineType } from '../buzzmachines/BuzzmachineEngine';
import { getNormalizedVolume } from './volumeNormalization';

export { FurnaceChipType };

export const SYNTH_TO_DISPATCH: Record<string, number> = {
// Console PSG chips
FurnaceNES: FurnaceDispatchPlatform.NES,
FurnaceGB: FurnaceDispatchPlatform.GB,
FurnaceSNES: FurnaceDispatchPlatform.SNES,
FurnacePCE: FurnaceDispatchPlatform.PCE,
FurnacePSG: FurnaceDispatchPlatform.SMS,
FurnaceVB: FurnaceDispatchPlatform.VBOY,
FurnaceLynx: FurnaceDispatchPlatform.LYNX,
FurnaceSWAN: FurnaceDispatchPlatform.SWAN,
FurnaceVRC6: FurnaceDispatchPlatform.VRC6,
FurnaceN163: FurnaceDispatchPlatform.N163,
FurnaceFDS: FurnaceDispatchPlatform.FDS,
FurnaceMMC5: FurnaceDispatchPlatform.MMC5,
FurnaceGBA: FurnaceDispatchPlatform.GBA_DMA,
FurnaceNDS: FurnaceDispatchPlatform.NDS,
FurnacePOKEMINI: FurnaceDispatchPlatform.POKEMINI,
// Commodore / Computer chips
FurnaceC64: FurnaceDispatchPlatform.C64_6581,
FurnaceSID6581: FurnaceDispatchPlatform.C64_6581,
FurnaceSID8580: FurnaceDispatchPlatform.C64_8580,
FurnaceAY: FurnaceDispatchPlatform.AY8910,
FurnaceAY8930: FurnaceDispatchPlatform.AY8930,
FurnaceVIC: FurnaceDispatchPlatform.VIC20,
FurnaceSAA: FurnaceDispatchPlatform.SAA1099,
FurnaceTED: FurnaceDispatchPlatform.TED,
FurnaceVERA: FurnaceDispatchPlatform.VERA,
FurnaceSCC: FurnaceDispatchPlatform.SCC,
FurnaceTIA: FurnaceDispatchPlatform.TIA,
FurnaceAMIGA: FurnaceDispatchPlatform.AMIGA,
FurnacePET: FurnaceDispatchPlatform.PET,
FurnacePCSPKR: FurnaceDispatchPlatform.PCSPKR,
FurnaceZXBEEPER: FurnaceDispatchPlatform.SFX_BEEPER,
FurnacePOKEY: FurnaceDispatchPlatform.POKEY,
FurnacePONG: FurnaceDispatchPlatform.PONG,
FurnacePV1000: FurnaceDispatchPlatform.PV1000,
FurnaceDAVE: FurnaceDispatchPlatform.DAVE,
FurnaceSU: FurnaceDispatchPlatform.SOUND_UNIT,
FurnacePOWERNOISE: FurnaceDispatchPlatform.POWERNOISE,
// Sample-based chips
FurnaceSEGAPCM: FurnaceDispatchPlatform.SEGAPCM,
FurnaceQSOUND: FurnaceDispatchPlatform.QSOUND,
FurnaceES5506: FurnaceDispatchPlatform.ES5506,
FurnaceRF5C68: FurnaceDispatchPlatform.RF5C68,
FurnaceC140: FurnaceDispatchPlatform.C140,
FurnaceK007232: FurnaceDispatchPlatform.K007232,
FurnaceK053260: FurnaceDispatchPlatform.K053260,
FurnaceGA20: FurnaceDispatchPlatform.GA20,
FurnaceOKI: FurnaceDispatchPlatform.MSM6295,
FurnaceYMZ280B: FurnaceDispatchPlatform.YMZ280B,
FurnaceX1_010: FurnaceDispatchPlatform.X1_010,
FurnaceMSM6258: FurnaceDispatchPlatform.MSM6258,
FurnaceMSM5232: FurnaceDispatchPlatform.MSM5232,
FurnaceMULTIPCM: FurnaceDispatchPlatform.MULTIPCM,
FurnaceNAMCO: FurnaceDispatchPlatform.NAMCO,
FurnacePCMDAC: FurnaceDispatchPlatform.PCM_DAC,
// Misc chips
FurnaceBUBBLE: FurnaceDispatchPlatform.BUBSYS_WSG,
FurnaceSM8521: FurnaceDispatchPlatform.SM8521,
FurnaceT6W28: FurnaceDispatchPlatform.T6W28,
FurnaceSUPERVISION: FurnaceDispatchPlatform.SUPERVISION,
FurnaceUPD1771: FurnaceDispatchPlatform.UPD1771C,
FurnaceSCVTONE: FurnaceDispatchPlatform.UPD1771C,
// FM chips (Yamaha) — unified under FurnaceDispatch
FurnaceOPN: FurnaceDispatchPlatform.GENESIS,
FurnaceOPM: FurnaceDispatchPlatform.ARCADE,
FurnaceOPL: FurnaceDispatchPlatform.OPL3,
FurnaceOPLL: FurnaceDispatchPlatform.OPLL,
FurnaceESFM: FurnaceDispatchPlatform.ESFM,
FurnaceOPZ: FurnaceDispatchPlatform.OPZ,
FurnaceOPNA: FurnaceDispatchPlatform.YM2608,
FurnaceOPNB: FurnaceDispatchPlatform.YM2610,
FurnaceOPL4: FurnaceDispatchPlatform.OPL4,
FurnaceY8950: FurnaceDispatchPlatform.Y8950,
FurnaceVRC7: FurnaceDispatchPlatform.VRC7,
FurnaceOPN2203: FurnaceDispatchPlatform.YM2203,
FurnaceOPNBB: FurnaceDispatchPlatform.YM2610B,
// Generic Furnace type defaults to Genesis (OPN2)
Furnace: FurnaceDispatchPlatform.GENESIS,
};


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

export function getDefaultFurnaceConfig(synthType: string): import('@typedefs/instrument').FurnaceConfig | undefined {
  // Map synth type to chip ID
  const chipTypeMap: Record<string, number> = {
    'FurnaceOPN': 0, 'FurnaceOPM': 1, 'FurnaceOPL': 2, 'FurnacePSG': 3,
    'FurnaceNES': 4, 'FurnaceGB': 5, 'FurnacePCE': 6, 'FurnaceSCC': 7,
    'FurnaceN163': 8, 'FurnaceVRC6': 9, 'FurnaceC64': 10, 'FurnaceOPLL': 11,
    'FurnaceAY': 12, 'FurnaceOPNA': 13, 'FurnaceOPNB': 14, 'FurnaceTIA': 15,
    'FurnaceFDS': 16, 'FurnaceMMC5': 17, 'FurnaceSAA': 18, 'FurnaceSWAN': 19,
    'FurnaceOKI': 20, 'FurnaceES5506': 21, 'FurnaceOPZ': 22, 'FurnaceY8950': 23,
    'FurnaceSNES': 24, 'FurnaceLYNX': 25, 'FurnaceOPL4': 26, 'FurnaceSEGAPCM': 27,
    'FurnaceYMZ280B': 28, 'FurnaceRF5C68': 29, 'FurnaceGA20': 30, 'FurnaceC140': 31,
    'FurnaceQSOUND': 32, 'FurnaceVIC': 33, 'FurnaceTED': 34, 'FurnaceSUPERVISION': 35,
    'FurnaceVERA': 36, 'FurnaceSM8521': 37, 'FurnaceBUBBLE': 38,
    'FurnaceK007232': 39, 'FurnaceK053260': 40, 'FurnaceX1_010': 41,
    'FurnaceUPD1771': 42, 'FurnaceT6W28': 43, 'FurnaceVB': 44,
    'FurnaceSID6581': 45, 'FurnaceSID8580': 46,
    // NEW Chips (47-72)
    'FurnaceOPN2203': 47, 'FurnaceOPNBB': 48, 'FurnaceESFM': 49,
    'FurnaceAY8930': 50, 'FurnaceNDS': 51, 'FurnaceGBA': 52,
    'FurnacePOKEMINI': 54, 'FurnaceNAMCO': 55, 'FurnacePET': 56,
    'FurnacePOKEY': 57, 'FurnaceMSM6258': 58, 'FurnaceMSM5232': 59,
    'FurnaceMULTIPCM': 60, 'FurnaceAMIGA': 61, 'FurnacePCSPKR': 62,
    'FurnacePONG': 63, 'FurnacePV1000': 64, 'FurnaceDAVE': 65,
    'FurnaceSU': 66, 'FurnacePOWERNOISE': 68,
    'FurnaceZXBEEPER': 69, 'FurnaceSCVTONE': 71, 'FurnacePCMDAC': 72,
    'Furnace': 0, // Default to OPN
  };

  const chipType = chipTypeMap[synthType];
  if (chipType === undefined) return undefined;

  // Use DEFAULT_FURNACE as base (has good FM operator settings)
  // Then override with the correct chip type
  const config: import('@typedefs/instrument').FurnaceConfig = {
    ...DEFAULT_FURNACE,
    chipType,
    // Deep copy operators to avoid mutation
    operators: DEFAULT_FURNACE.operators.map(op => ({ ...op })),
  };

  // Add chip-specific defaults
  if (synthType === 'FurnaceC64' || synthType === 'FurnaceSID6581' || synthType === 'FurnaceSID8580') {
    config.c64 = {
      triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
      a: 0, d: 8, s: 12, r: 6,
      duty: 2048,
      ringMod: false, oscSync: false,
      toFilter: false, initFilter: false,
      filterCutoff: 1024, filterResonance: 8,
      filterLP: true, filterBP: false, filterHP: false,
      filterCh3Off: false,
    };
  }

  return config;
}

