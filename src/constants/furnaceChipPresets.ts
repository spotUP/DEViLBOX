/**
 * Furnace Chip Presets
 * Expanded factory presets for Furnace chips.
 * Covers multiple instrument types (Bass, Lead, Pad, etc.) for major systems.
 */

import type { InstrumentPreset } from '@typedefs/instrument';
import { FurnaceChipType } from '../engine/chips/FurnaceChipEngine';

export const FURNACE_CHIP_PRESETS: InstrumentPreset['config'][] = [
  // === NES (2A03) ===
  {
    name: 'NES Pulse Lead',
    type: 'synth',
    synthType: 'FurnaceNES',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.NES }
  },
  {
    name: 'NES Pulse 12.5%',
    type: 'synth',
    synthType: 'FurnaceNES',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.NES, nes: { dutyNoise: 0, envMode: 'env', envValue: 15, sweepEnabled: false, sweepPeriod: 0, sweepNegate: false, sweepShift: 0 } }
  },
  {
    name: 'NES Pulse 25%',
    type: 'synth',
    synthType: 'FurnaceNES',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.NES, nes: { dutyNoise: 1, envMode: 'env', envValue: 15, sweepEnabled: false, sweepPeriod: 0, sweepNegate: false, sweepShift: 0 } }
  },
  {
    name: 'NES Triangle Bass',
    type: 'synth',
    synthType: 'FurnaceNES',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.NES }
  },
  {
    name: 'NES Noise Drums',
    type: 'synth',
    synthType: 'FurnaceNES',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.NES }
  },
  {
    name: 'MMC5 Expansion Init',
    type: 'synth',
    synthType: 'FurnaceMMC5',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.MMC5 }
  },

  // === GAME BOY ===
  {
    name: 'GB Pulse 50%',
    type: 'synth',
    synthType: 'FurnaceGB',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.GB }
  },
  {
    name: 'GB Pulse 25%',
    type: 'synth',
    synthType: 'FurnaceGB',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.GB }
  },
  {
    name: 'GB Wave Bass',
    type: 'synth',
    synthType: 'FurnaceGB',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.GB }
  },
  {
    name: 'GB Noise Snare',
    type: 'synth',
    synthType: 'FurnaceGB',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.GB }
  },
  {
    name: 'GB Wave Organ',
    type: 'synth',
    synthType: 'FurnaceGB',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.GB }
  },
  {
    name: 'GB Noise HiHat',
    type: 'synth',
    synthType: 'FurnaceGB',
    volume: -12,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.GB }
  },

  // === SEGA MASTER SYSTEM (PSG) ===
  {
    name: 'PSG Square Lead',
    type: 'synth',
    synthType: 'FurnacePSG',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.PSG }
  },
  {
    name: 'PSG Bass',
    type: 'synth',
    synthType: 'FurnacePSG',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.PSG }
  },
  {
    name: 'PSG Periodic Noise',
    type: 'synth',
    synthType: 'FurnacePSG',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.PSG }
  },

  // === PC ENGINE (HuC6280) ===
  {
    name: 'PCE Wave Lead',
    type: 'synth',
    synthType: 'FurnacePCE',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.PCE }
  },
  {
    name: 'PCE Bass',
    type: 'synth',
    synthType: 'FurnacePCE',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.PCE }
  },

  // === COMMODORE VIC-20 ===
  {
    name: 'VIC Pulse',
    type: 'synth',
    synthType: 'FurnaceVIC',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.VIC }
  },
  {
    name: 'VIC Noise',
    type: 'synth',
    synthType: 'FurnaceVIC',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.VIC }
  },

  // === ATARI TIA ===
  {
    name: 'TIA Square',
    type: 'synth',
    synthType: 'FurnaceTIA',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.TIA }
  },
  {
    name: 'TIA Bass',
    type: 'synth',
    synthType: 'FurnaceTIA',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.TIA }
  },

  // === FM (OPL) ===
  {
    name: 'OPL3 FM Bass',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPL3, algorithm: 0, feedback: 6 }
  },
  {
    name: 'OPL3 FM Strings',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPL3, algorithm: 1, feedback: 2 }
  },
  {
    name: 'OPL3 FM Brass',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPL3, algorithm: 0, feedback: 4 }
  },

  // === AMIGA PAULA ===
  {
    name: 'Amiga ST-01 Bass',
    type: 'synth',
    synthType: 'FurnaceAMIGA',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.AMIGA, amiga: { initSample: 0, useNoteMap: false, useSample: true, useWave: false, waveLen: 32, noteMap: [] } }
  },
  {
    name: 'Amiga Lead Strings',
    type: 'synth',
    synthType: 'FurnaceAMIGA',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.AMIGA, amiga: { initSample: 0, useNoteMap: false, useSample: true, useWave: false, waveLen: 32, noteMap: [] } }
  },
  {
    name: 'Amiga Poly Pad',
    type: 'synth',
    synthType: 'FurnaceAMIGA',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.AMIGA, amiga: { initSample: 0, useNoteMap: false, useSample: true, useWave: false, waveLen: 32, noteMap: [] } }
  },

  // === COMMODORE PET / PC SPEAKER ===
  {
    name: 'PET Bleep',
    type: 'synth',
    synthType: 'FurnacePET',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.PET }
  },
  {
    name: 'PC Speaker Beeper',
    type: 'synth',
    synthType: 'FurnacePCSPKR',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.PCSPKR }
  },
  {
    name: 'ZX Beeper QuadTone',
    type: 'synth',
    synthType: 'FurnaceZXBEEPER',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.ZXBEEPER_QT }
  },
  {
    name: 'SID Pulse PWM',
    type: 'synth',
    synthType: 'FurnaceC64',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.SID }
  },
  {
    name: 'SID Ring Mod',
    type: 'synth',
    synthType: 'FurnaceC64',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.SID }
  },

  // === GAME BOY ADVANCE / DS ===
  {
    name: 'GBA Synth Bass',
    type: 'synth',
    synthType: 'FurnaceGBA',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.GBA_DMA }
  },
  {
    name: 'GBA Lead Strings',
    type: 'synth',
    synthType: 'FurnaceGBA',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.GBA_DMA }
  },
  {
    name: 'NDS Piano',
    type: 'synth',
    synthType: 'FurnaceNDS',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.NDS }
  },
  {
    name: 'NDS Pad',
    type: 'synth',
    synthType: 'FurnaceNDS',
    volume: -12,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.NDS }
  },

  // === HANDHELDS ===
  {
    name: 'Virtual Boy Lead',
    type: 'synth',
    synthType: 'FurnaceVB',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.VB }
  },
  {
    name: 'WonderSwan Wave',
    type: 'synth',
    synthType: 'FurnaceSWAN',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.SWAN }
  },
  {
    name: 'Atari Lynx Pulse',
    type: 'synth',
    synthType: 'FurnaceLynx',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.LYNX }
  },
  {
    name: 'Neo Geo Pocket Bass',
    type: 'synth',
    synthType: 'FurnaceT6W28',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.T6W28 }
  },

  // === ARCADE / PCM ===
  {
    name: 'QSound Fat Bass',
    type: 'synth',
    synthType: 'FurnaceQSOUND',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.QSOUND }
  },
  {
    name: 'Sega MultiPCM Strings',
    type: 'synth',
    synthType: 'FurnaceMULTIPCM',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.MULTIPCM }
  },
  {
    name: 'Sega PCM Lead',
    type: 'synth',
    synthType: 'FurnaceSEGAPCM',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.SEGAPCM }
  },
  {
    name: 'Namco C140 Drum',
    type: 'synth',
    synthType: 'FurnaceC140',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.C140 }
  },
  {
    name: 'OKI MSM6295 Kick',
    type: 'synth',
    synthType: 'FurnaceOKI',
    volume: -4,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OKI }
  },
  {
    name: 'OKI MSM6258 Snare',
    type: 'synth',
    synthType: 'FurnaceMSM6258',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.MSM6258 }
  },

  // === FM / ADVANCED ===
  {
    name: 'YM2203 FM Bass',
    type: 'synth',
    synthType: 'FurnaceOPN2203',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPN, algorithm: 4, feedback: 5 }
  },
  {
    name: 'YM2608 FM Strings',
    type: 'synth',
    synthType: 'FurnaceOPNA',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPNA, algorithm: 5, feedback: 3 }
  },
  {
    name: 'YM2610 FM Lead',
    type: 'synth',
    synthType: 'FurnaceOPNB',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPNB, algorithm: 4, feedback: 6 }
  },
  {
    name: 'YMF278B FM Piano',
    type: 'synth',
    synthType: 'FurnaceOPL4',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPL4, algorithm: 4, feedback: 2 }
  },
  {
    name: 'VRC7 FM Brass',
    type: 'synth',
    synthType: 'FurnaceVRC7',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPLL, algorithm: 0, feedback: 4 }
  },
];
