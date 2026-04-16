/**
 * Synth panel layout registry — maps synth type to layout descriptor.
 */

import type { SynthPanelLayout } from '@/types/synthPanel';
import { DUB_SIREN_LAYOUT } from './dubSiren';
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
import { FURNACE_LAYOUT, FURNACE_GB_HWSEQ_LAYOUT, FURNACE_WAVESYNTH_LAYOUT, FURNACE_SID3_LAYOUT, FURNACE_OPL_DRUMS_LAYOUT } from './furnace';
import { SUPER_SAW_LAYOUT } from './superSaw';
import { WAVETABLE_LAYOUT } from './wavetable';
import { PWM_SYNTH_LAYOUT } from './pwmSynth';
import { WOBBLE_BASS_LAYOUT } from './wobbleBass';
import { SYNARE_LAYOUT } from './synare';
import { ORGAN_LAYOUT } from './organ';
import { STRING_MACHINE_LAYOUT } from './stringMachine';
import { FORMANT_SYNTH_LAYOUT } from './formantSynth';
import { DRUM_MACHINE_LAYOUT } from './drumMachine';
import { DRUM_KIT_LAYOUT } from './drumKit';
import { POLY_SYNTH_LAYOUT } from './polySynth';
import { OPENWURLI_LAYOUT } from './openwurli';
import { OPL3_LAYOUT } from './opl3';
import { DX7_LAYOUT } from './dx7';
import { OIDOS_LAYOUT } from './oidos';
import { TUNEFISH_LAYOUT } from './tunefish';
import { SLAUGHTER_LAYOUT } from './wavesabreSlaughter';
import { FALCON_LAYOUT } from './wavesabreFalcon';
import { V2_LAYOUT } from './v2';
import { MDA_EPIANO_LAYOUT } from './mdaEPiano';
import { MDA_JX10_LAYOUT } from './mdaJX10';
import { MDA_DX10_LAYOUT } from './mdaDX10';
import { AMSYNTH_LAYOUT } from './amsynth';
import { RAFFO_LAYOUT } from './raffo';
import { CALF_MONO_LAYOUT } from './calfMono';
import { SETBFREE_LAYOUT } from './setbfree';
import { SYNTHV1_LAYOUT } from './synthv1';
import { MONIQUE_LAYOUT } from './monique';
import { VL1_LAYOUT } from './vl1';
import { TAL_NOIZEMAKER_LAYOUT } from './talNoizeMaker';
import { AEOLUS_LAYOUT } from './aeolus';
import { FLUIDSYNTH_LAYOUT } from './fluidsynth';
import { SFIZZ_LAYOUT } from './sfizz';
import { ZYNADDSUBFX_LAYOUT } from './zynaddsubfx';
import { PINK_TROMBONE_LAYOUT } from './pinkTrombone';
import { DECTALK_LAYOUT } from './dectalk';
import { SAM_LAYOUT } from './sam';
import { TR707_LAYOUT } from './tr707';
import { TR808_LAYOUT } from './tr808';
import { TR909_LAYOUT } from './tr909';
import { CZ101_LAYOUT } from './cz101';
import { D50_LAYOUT } from './d50';
import { C64SID_LAYOUT } from './c64sid';
import { V2SPEECH_LAYOUT } from './v2speech';

/** Map from SynthType string to layout descriptor */
export const SYNTH_LAYOUTS: Record<string, SynthPanelLayout> = {
  // JUCE WASM synths
  Odin2: ODIN2_LAYOUT,
  Surge: SURGE_LAYOUT,
  Vital: VITAL_LAYOUT,

  // Retromulator WASM synths
  OpenWurli: OPENWURLI_LAYOUT,
  OPL3: OPL3_LAYOUT,
  DX7: DX7_LAYOUT,
  OidosSynth: OIDOS_LAYOUT,

  // Demoscene WASM synths
  V2: V2_LAYOUT,
  TunefishSynth: TUNEFISH_LAYOUT,
  WaveSabreSlaughter: SLAUGHTER_LAYOUT,
  WaveSabreFalcon: FALCON_LAYOUT,
  WaveSabreSynth: FALCON_LAYOUT, // Default for generic WaveSabre

  // Custom Tone.js synths
  DubSiren: DUB_SIREN_LAYOUT,
  ChipSynth: CHIP_SYNTH_LAYOUT,
  HarmonicSynth: HARMONIC_SYNTH_LAYOUT,
  SpaceLaser: SPACE_LASER_LAYOUT,

  // Sample-based
  Sampler: SAMPLER_LAYOUT,
  Player: SAMPLER_LAYOUT,
  GranularSynth: GRANULAR_SYNTH_LAYOUT,
  DrumKit: DRUM_KIT_LAYOUT,

  // New custom synths
  SuperSaw: SUPER_SAW_LAYOUT,
  PolySynth: POLY_SYNTH_LAYOUT,
  Organ: ORGAN_LAYOUT,
  PWMSynth: PWM_SYNTH_LAYOUT,
  StringMachine: STRING_MACHINE_LAYOUT,
  FormantSynth: FORMANT_SYNTH_LAYOUT,
  WobbleBass: WOBBLE_BASS_LAYOUT,
  Synare: SYNARE_LAYOUT,
  Wavetable: WAVETABLE_LAYOUT,
  DrumMachine: DRUM_MACHINE_LAYOUT,

  // Tone.js core synths
  Synth: SYNTH_LAYOUT,
  MonoSynth: MONO_SYNTH_LAYOUT,
  DuoSynth: DUO_SYNTH_LAYOUT,
  FMSynth: FM_SYNTH_LAYOUT,
  ToneAM: AM_SYNTH_LAYOUT,
  PluckSynth: PLUCK_SYNTH_LAYOUT,
  MetalSynth: METAL_SYNTH_LAYOUT,
  MembraneSynth: MEMBRANE_SYNTH_LAYOUT,
  NoiseSynth: NOISE_SYNTH_LAYOUT,

  // WASM synths (MDA, AMSynth, Raffo, etc.)
  MdaEPiano: MDA_EPIANO_LAYOUT,
  MdaJX10: MDA_JX10_LAYOUT,
  MdaDX10: MDA_DX10_LAYOUT,
  Amsynth: AMSYNTH_LAYOUT,
  RaffoSynth: RAFFO_LAYOUT,
  CalfMono: CALF_MONO_LAYOUT,
  SetBfree: SETBFREE_LAYOUT,
  SynthV1: SYNTHV1_LAYOUT,
  Monique: MONIQUE_LAYOUT,
  VL1: VL1_LAYOUT,
  TalNoizeMaker: TAL_NOIZEMAKER_LAYOUT,
  Aeolus: AEOLUS_LAYOUT,
  FluidSynth: FLUIDSYNTH_LAYOUT,
  Sfizz: SFIZZ_LAYOUT,
  ZynAddSubFX: ZYNADDSUBFX_LAYOUT,

  // MAME chip synths with dedicated panels
  CZ101: CZ101_LAYOUT,
  D50: D50_LAYOUT,

  // Drum machines
  MAMETR707: TR707_LAYOUT,
  TR808: TR808_LAYOUT,
  TR909: TR909_LAYOUT,

  // Playback engines with minimal controls
  C64SID: C64SID_LAYOUT,

  // Speech synths
  V2Speech: V2SPEECH_LAYOUT,
  PinkTrombone: PINK_TROMBONE_LAYOUT,
  DECtalk: DECTALK_LAYOUT,
  Sam: SAM_LAYOUT,

  // Furnace chip-specific panels
  FurnaceGBHWSeq: FURNACE_GB_HWSEQ_LAYOUT,
  FurnaceWaveSynth: FURNACE_WAVESYNTH_LAYOUT,
  FurnaceSID3: FURNACE_SID3_LAYOUT,
  FurnaceOPLDrums: FURNACE_OPL_DRUMS_LAYOUT,

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
