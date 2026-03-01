/**
 * Synth panel layout registry — maps synth type to layout descriptor.
 */

import type { SynthPanelLayout } from '../synthPanelTypes';
import { TB303_LAYOUT } from './tb303';
import { DEXED_LAYOUT } from './dexed';
import { DUB_SIREN_LAYOUT } from './dubSiren';
import { OBXD_LAYOUT } from './obxd';
import { CHIP_SYNTH_LAYOUT } from './chipSynth';
import { HARMONIC_SYNTH_LAYOUT } from './harmonicSynth';
import { SPACE_LASER_LAYOUT } from './spaceLaser';
import { ODIN2_LAYOUT } from './odin2';
import { SURGE_LAYOUT } from './surge';
import { VITAL_LAYOUT } from './vital';
import { SAMPLER_LAYOUT } from './sampler';
import {
  SYNTH_LAYOUT, MONO_SYNTH_LAYOUT, DUO_SYNTH_LAYOUT,
  FM_SYNTH_LAYOUT, AM_SYNTH_LAYOUT, PLUCK_SYNTH_LAYOUT,
  METAL_SYNTH_LAYOUT, MEMBRANE_SYNTH_LAYOUT, NOISE_SYNTH_LAYOUT,
} from './toneSynths';
import { GRANULAR_SYNTH_LAYOUT } from './granularSynth';
import { FURNACE_LAYOUT } from './furnace';

/** Map from SynthType string to layout descriptor */
export const SYNTH_LAYOUTS: Record<string, SynthPanelLayout> = {
  // TB-303 variants
  TB303: TB303_LAYOUT,
  Buzz3o3: TB303_LAYOUT,

  // JUCE WASM synths
  Dexed: DEXED_LAYOUT,
  OBXd: OBXD_LAYOUT,
  Odin2: ODIN2_LAYOUT,
  Surge: SURGE_LAYOUT,
  Vital: VITAL_LAYOUT,

  // Custom Tone.js synths
  DubSiren: DUB_SIREN_LAYOUT,
  ChipSynth: CHIP_SYNTH_LAYOUT,
  HarmonicSynth: HARMONIC_SYNTH_LAYOUT,
  SpaceLaser: SPACE_LASER_LAYOUT,

  // Sample-based
  Sampler: SAMPLER_LAYOUT,
  Player: SAMPLER_LAYOUT,
  GranularSynth: GRANULAR_SYNTH_LAYOUT,

  // Tone.js core synths
  Synth: SYNTH_LAYOUT,
  MonoSynth: MONO_SYNTH_LAYOUT,
  DuoSynth: DUO_SYNTH_LAYOUT,
  FMSynth: FM_SYNTH_LAYOUT,
  AMSynth: AM_SYNTH_LAYOUT,
  PluckSynth: PLUCK_SYNTH_LAYOUT,
  MetalSynth: METAL_SYNTH_LAYOUT,
  MembraneSynth: MEMBRANE_SYNTH_LAYOUT,
  NoiseSynth: NOISE_SYNTH_LAYOUT,

  // Furnace chip emulation (all share a minimal AMP layout)
  Furnace: FURNACE_LAYOUT,
  FurnaceOPN: FURNACE_LAYOUT,
  FurnaceOPM: FURNACE_LAYOUT,
  FurnaceOPL: FURNACE_LAYOUT,
  FurnaceOPLL: FURNACE_LAYOUT,
  FurnaceESFM: FURNACE_LAYOUT,
  FurnaceOPZ: FURNACE_LAYOUT,
  FurnaceOPNA: FURNACE_LAYOUT,
  FurnaceOPNB: FURNACE_LAYOUT,
  FurnaceOPL4: FURNACE_LAYOUT,
  FurnaceY8950: FURNACE_LAYOUT,
  FurnaceVRC7: FURNACE_LAYOUT,
  FurnaceOPN2203: FURNACE_LAYOUT,
  FurnaceOPNBB: FURNACE_LAYOUT,
  FurnaceNES: FURNACE_LAYOUT,
  FurnaceGB: FURNACE_LAYOUT,
  FurnaceSNES: FURNACE_LAYOUT,
  FurnacePCE: FURNACE_LAYOUT,
  FurnacePSG: FURNACE_LAYOUT,
  FurnaceVB: FURNACE_LAYOUT,
  FurnaceLynx: FURNACE_LAYOUT,
  FurnaceSWAN: FURNACE_LAYOUT,
  FurnaceVRC6: FURNACE_LAYOUT,
  FurnaceN163: FURNACE_LAYOUT,
  FurnaceFDS: FURNACE_LAYOUT,
  FurnaceMMC5: FURNACE_LAYOUT,
  FurnaceGBA: FURNACE_LAYOUT,
  FurnaceNDS: FURNACE_LAYOUT,
  FurnacePOKEMINI: FURNACE_LAYOUT,
  FurnaceC64: FURNACE_LAYOUT,
  FurnaceSID6581: FURNACE_LAYOUT,
  FurnaceSID8580: FURNACE_LAYOUT,
  FurnaceAY: FURNACE_LAYOUT,
  FurnaceAY8930: FURNACE_LAYOUT,
  FurnaceVIC: FURNACE_LAYOUT,
  FurnaceSAA: FURNACE_LAYOUT,
  FurnaceTED: FURNACE_LAYOUT,
  FurnaceVERA: FURNACE_LAYOUT,
  FurnaceSCC: FURNACE_LAYOUT,
  FurnaceTIA: FURNACE_LAYOUT,
  FurnaceAMIGA: FURNACE_LAYOUT,
  FurnacePET: FURNACE_LAYOUT,
  FurnacePCSPKR: FURNACE_LAYOUT,
  FurnaceZXBEEPER: FURNACE_LAYOUT,
  FurnacePOKEY: FURNACE_LAYOUT,
  FurnacePONG: FURNACE_LAYOUT,
  FurnacePV1000: FURNACE_LAYOUT,
  FurnaceDAVE: FURNACE_LAYOUT,
  FurnaceSU: FURNACE_LAYOUT,
  FurnacePOWERNOISE: FURNACE_LAYOUT,
  FurnaceSEGAPCM: FURNACE_LAYOUT,
  FurnaceQSOUND: FURNACE_LAYOUT,
  FurnaceES5506: FURNACE_LAYOUT,
  FurnaceRF5C68: FURNACE_LAYOUT,
  FurnaceC140: FURNACE_LAYOUT,
  FurnaceK007232: FURNACE_LAYOUT,
  FurnaceK053260: FURNACE_LAYOUT,
  FurnaceGA20: FURNACE_LAYOUT,
  FurnaceOKI: FURNACE_LAYOUT,
  FurnaceYMZ280B: FURNACE_LAYOUT,
  FurnaceX1_010: FURNACE_LAYOUT,
  FurnaceMSM6258: FURNACE_LAYOUT,
  FurnaceMSM5232: FURNACE_LAYOUT,
  FurnaceMULTIPCM: FURNACE_LAYOUT,
  FurnaceNAMCO: FURNACE_LAYOUT,
  FurnacePCMDAC: FURNACE_LAYOUT,
  FurnaceBUBBLE: FURNACE_LAYOUT,
  FurnaceSM8521: FURNACE_LAYOUT,
  FurnaceT6W28: FURNACE_LAYOUT,
  FurnaceSUPERVISION: FURNACE_LAYOUT,
  FurnaceUPD1771: FURNACE_LAYOUT,
  FurnaceSCVTONE: FURNACE_LAYOUT,
};

/**
 * Get the layout for a synth type. Returns undefined for types not yet mapped.
 */
export function getSynthLayout(synthType: string): SynthPanelLayout | undefined {
  return SYNTH_LAYOUTS[synthType];
}
