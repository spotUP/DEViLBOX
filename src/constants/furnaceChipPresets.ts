/**
 * Furnace Chip Presets
 * Expanded factory presets for Furnace chips.
 * Covers multiple instrument types (Bass, Lead, Pad, etc.) for major systems.
 */

import type { InstrumentPreset } from '@typedefs/instrument';
import { FurnaceChipType } from '../engine/chips/FurnaceChipEngine';
import { op, disabledOp } from './furnacePresets';
import { neoGeoPresets } from './neoGeoPresetBank';

const noMacros = { macros: [] as never[], opMacros: [] as never[], wavetables: [] as never[] };
const twoOp = (mod: Parameters<typeof op>[0], car: Parameters<typeof op>[0]) => ({
  ops: 2, operators: [op(mod), op(car), disabledOp(), disabledOp()], ...noMacros,
});

type OpOverrides = Parameters<typeof op>[0];
/** Four-operator FM patch (YM2203 / YM2608 / YM2610 family: 4 operators, 3-bit algorithm and feedback). */
const fourOp = (algorithm: number, feedback: number, o: [OpOverrides, OpOverrides, OpOverrides, OpOverrides]) => ({
  algorithm, feedback, ops: 4, operators: o.map((x) => op(x)), ...noMacros,
});

/** Neo Geo / OPN-family voices: ranges tl 0-127, ar/dr/d2r 0-31, sl/rr 0-15, mult 0-15, dt -3..3. */
const OPN_VOICES = {
  lead: fourOp(4, 6, [
    { mult: 1, tl: 22, ar: 31, dr: 6, sl: 2, rr: 6 },
    { mult: 1, tl: 4, ar: 31, dr: 5, sl: 3, rr: 7 },
    { mult: 2, tl: 30, ar: 31, dr: 8, sl: 3, rr: 7, dt: 2 },
    { mult: 1, tl: 2, ar: 31, dr: 6, sl: 2, rr: 8, dt: -1, am: true },
  ]),
  bass: fourOp(0, 5, [
    { mult: 1, tl: 28, ar: 31, dr: 12, sl: 4, rr: 8 },
    { mult: 1, tl: 34, ar: 31, dr: 14, sl: 5, rr: 8 },
    { mult: 1, tl: 20, ar: 31, dr: 10, sl: 3, rr: 8 },
    { mult: 1, tl: 0, ar: 31, dr: 8, sl: 3, rr: 9, d2r: 2 },
  ]),
  chord: fourOp(2, 3, [
    { mult: 1, tl: 36, ar: 24, dr: 4, sl: 3, rr: 5, dt: 1 },
    { mult: 2, tl: 40, ar: 22, dr: 5, sl: 4, rr: 5, dt: -2 },
    { mult: 1, tl: 18, ar: 26, dr: 3, sl: 2, rr: 6, dt: 3 },
    { mult: 1, tl: 6, ar: 20, dr: 3, sl: 2, rr: 6, dt: -1 },
  ]),
  arp: fourOp(5, 2, [
    { mult: 3, tl: 26, ar: 31, dr: 18, sl: 8, rr: 10 },
    { mult: 1, tl: 10, ar: 31, dr: 16, sl: 7, rr: 10, dt: 1 },
    { mult: 2, tl: 14, ar: 31, dr: 16, sl: 7, rr: 10, dt: -1 },
    { mult: 1, tl: 8, ar: 31, dr: 15, sl: 6, rr: 11 },
  ]),
  pad: fourOp(7, 4, [
    { mult: 1, tl: 22, ar: 14, dr: 2, sl: 1, rr: 4, dt: 2 },
    { mult: 2, tl: 26, ar: 12, dr: 2, sl: 1, rr: 4, dt: -2 },
    { mult: 1, tl: 24, ar: 13, dr: 3, sl: 2, rr: 4, dt: 1 },
    { mult: 4, tl: 30, ar: 12, dr: 3, sl: 2, rr: 5, dt: -3 },
  ]),
  pluck: fourOp(3, 4, [
    { mult: 2, tl: 30, ar: 31, dr: 20, sl: 10, rr: 12 },
    { mult: 1, tl: 20, ar: 31, dr: 18, sl: 9, rr: 12 },
    { mult: 5, tl: 38, ar: 31, dr: 22, sl: 12, rr: 13, dt: 1 },
    { mult: 1, tl: 0, ar: 31, dr: 16, sl: 8, rr: 11 },
  ]),
  bell: fourOp(4, 1, [
    { mult: 7, tl: 36, ar: 31, dr: 14, sl: 9, rr: 9 },
    { mult: 1, tl: 8, ar: 31, dr: 12, sl: 8, rr: 8 },
    { mult: 14, tl: 44, ar: 31, dr: 16, sl: 11, rr: 9, dt: 3 },
    { mult: 3, tl: 12, ar: 31, dr: 13, sl: 9, rr: 8, dt: -3 },
  ]),
  brass: fourOp(6, 5, [
    { mult: 1, tl: 18, ar: 20, dr: 4, sl: 2, rr: 6 },
    { mult: 1, tl: 10, ar: 22, dr: 5, sl: 3, rr: 7 },
    { mult: 1, tl: 12, ar: 22, dr: 5, sl: 3, rr: 7, dt: 1, vib: true },
    { mult: 2, tl: 14, ar: 24, dr: 6, sl: 3, rr: 7, dt: -1 },
  ]),
};
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
    furnace: { chipType: FurnaceChipType.OPL3, algorithm: 0, feedback: 6, ...twoOp({ mult: 1, tl: 22, ar: 15, dr: 6, sl: 4, rr: 6 }, { mult: 1, tl: 0, ar: 15, dr: 5, sl: 3, rr: 7 }) }
  },
  {
    name: 'OPL3 FM Strings',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPL3, algorithm: 1, feedback: 2, ...twoOp({ mult: 1, tl: 8, ar: 10, dr: 3, sl: 2, rr: 6 }, { mult: 2, tl: 8, ar: 9, dr: 3, sl: 2, rr: 7 }) }
  },
  {
    name: 'OPL3 FM Brass',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPL3, algorithm: 0, feedback: 4, ...twoOp({ mult: 1, tl: 25, ar: 12, dr: 5, sl: 5, rr: 6 }, { mult: 1, tl: 0, ar: 14, dr: 4, sl: 3, rr: 8 }) }
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
  // === COMMODORE 64 — SID (generic C64) ===
  {
    name: 'C64 Pulse Lead',
    type: 'synth',
    synthType: 'FurnaceC64',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID,
      c64: {
        triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
        a: 0, d: 6, s: 12, r: 4,
        duty: 2048,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 1200, filterResonance: 4,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: 'C64 Saw Lead',
    type: 'synth',
    synthType: 'FurnaceC64',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 10, r: 6,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: false, initFilter: false,
        filterCutoff: 1024, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: 'C64 Bass',
    type: 'synth',
    synthType: 'FurnaceC64',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 14, r: 2,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 512, filterResonance: 6,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: 'C64 Arp',
    type: 'synth',
    synthType: 'FurnaceC64',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID,
      c64: {
        triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
        a: 0, d: 4, s: 0, r: 2,
        duty: 2048,
        ringMod: false, oscSync: false,
        toFilter: false, initFilter: false,
        filterCutoff: 1024, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: 'C64 Noise Drum',
    type: 'synth',
    synthType: 'FurnaceC64',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID,
      c64: {
        triOn: false, sawOn: false, pulseOn: false, noiseOn: true,
        a: 0, d: 4, s: 0, r: 0,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 800, filterResonance: 2,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: 'C64 Pad',
    type: 'synth',
    synthType: 'FurnaceC64',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID,
      c64: {
        triOn: false, sawOn: true, pulseOn: true, noiseOn: false,
        a: 8, d: 6, s: 10, r: 10,
        duty: 2048,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 700, filterResonance: 4,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  // === COMMODORE 64 — SID 6581 (warm, gritty) ===
  {
    name: '6581 Saw+Pulse',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID_6581,
      c64: {
        triOn: false, sawOn: true, pulseOn: true, noiseOn: false,
        a: 0, d: 8, s: 10, r: 6,
        duty: 1536,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 900, filterResonance: 6,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: '6581 Triangle Sub',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID_6581,
      c64: {
        triOn: true, sawOn: false, pulseOn: false, noiseOn: false,
        a: 0, d: 10, s: 15, r: 4,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: false, initFilter: false,
        filterCutoff: 1024, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: '6581 Dirty Reso',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID_6581,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 10, s: 8, r: 6,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 600, filterResonance: 14,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: '6581 PWM Throb',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID_6581,
      c64: {
        triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
        a: 4, d: 6, s: 12, r: 8,
        duty: 512,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 700, filterResonance: 8,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  // === COMMODORE 64 — SID 8580 (cleaner, crisper) ===
  {
    name: '8580 Clean Pulse',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID_8580,
      c64: {
        triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
        a: 0, d: 6, s: 12, r: 4,
        duty: 2048,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 1400, filterResonance: 4,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: '8580 Bandpass',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID_8580,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 10, r: 6,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 800, filterResonance: 10,
        filterLP: false, filterBP: true, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: '8580 Ring Mod',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID_8580,
      c64: {
        triOn: true, sawOn: false, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 8, r: 6,
        duty: 0,
        ringMod: true, oscSync: false,
        toFilter: false, initFilter: false,
        filterCutoff: 1024, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
  },
  {
    name: '8580 Noise Perc',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: FurnaceChipType.SID_8580,
      c64: {
        triOn: false, sawOn: false, pulseOn: false, noiseOn: true,
        a: 0, d: 3, s: 0, r: 0,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 1000, filterResonance: 2,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
    }
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
    furnace: { chipType: FurnaceChipType.OPN, ...OPN_VOICES.bass }
  },
  {
    name: 'YM2608 FM Strings',
    type: 'synth',
    synthType: 'FurnaceOPNA',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPNA, ...OPN_VOICES.pad }
  },
  ...neoGeoPresets('YM2610', 'FurnaceOPNB', FurnaceChipType.OPNB),
  ...neoGeoPresets('YM2610B', 'FurnaceOPNBB', FurnaceChipType.OPNB_B),
  {
    name: 'YMF278B FM Piano',
    type: 'synth',
    synthType: 'FurnaceOPL4',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPL4, algorithm: 0, feedback: 2, ...twoOp({ mult: 4, tl: 28, ar: 15, dr: 7, sl: 5, rr: 7 }, { mult: 1, tl: 0, ar: 15, dr: 5, sl: 4, rr: 7 }) }
  },
  {
    name: 'VRC7 FM Brass',
    type: 'synth',
    synthType: 'FurnaceVRC7',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: { chipType: FurnaceChipType.OPLL, opllPreset: 0, algorithm: 0, feedback: 4, ...twoOp({ mult: 1, tl: 25, ar: 12, dr: 5, sl: 5, rr: 6 }, { mult: 1, tl: 0, ar: 14, dr: 4, sl: 3, rr: 8 }) }
  },

  // === Missing Furnace chips — init presets ===
  { name: 'AY-3-8930 Init', type: 'synth', synthType: 'FurnaceAY8930', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.AY8930 } },
  { name: 'Bubble System Init', type: 'synth', synthType: 'FurnaceBUBBLE', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.BUBBLE } },
  { name: 'DAVE Init', type: 'synth', synthType: 'FurnaceDAVE', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.DAVE } },
  { name: 'ES5506 Init', type: 'synth', synthType: 'FurnaceES5506', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.ES5506 } },
  { name: 'GA20 Init', type: 'synth', synthType: 'FurnaceGA20', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.GA20 } },
  { name: 'K007232 Init', type: 'synth', synthType: 'FurnaceK007232', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.K007232 } },
  { name: 'K053260 Init', type: 'synth', synthType: 'FurnaceK053260', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.K053260 } },
  { name: 'MSM5232 Init', type: 'synth', synthType: 'FurnaceMSM5232', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.MSM5232 } },
  { name: 'Namco WSG Init', type: 'synth', synthType: 'FurnaceNAMCO', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.NAMCO } },
  { name: 'YM2610B Init', type: 'synth', synthType: 'FurnaceOPNBB', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.OPNB_B } },
  { name: 'PCM DAC Init', type: 'synth', synthType: 'FurnacePCMDAC', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.PCMDAC } },
  { name: 'Pokemon Mini Init', type: 'synth', synthType: 'FurnacePOKEMINI', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.POKEMINI } },
  { name: 'POKEY Init', type: 'synth', synthType: 'FurnacePOKEY', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.POKEY } },
  { name: 'Pong Init', type: 'synth', synthType: 'FurnacePONG', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.PONG } },
  { name: 'Power Noise Init', type: 'synth', synthType: 'FurnacePOWERNOISE', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.POWERNOISE } },
  { name: 'PV-1000 Init', type: 'synth', synthType: 'FurnacePV1000', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.PV1000 } },
  { name: 'RF5C68 Init', type: 'synth', synthType: 'FurnaceRF5C68', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.RF5C68 } },
  { name: 'SCV Tone Init', type: 'synth', synthType: 'FurnaceSCVTONE', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.SCVTONE } },
  { name: 'SM8521 Init', type: 'synth', synthType: 'FurnaceSM8521', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.SM8521 } },
  { name: 'Sound Unit Init', type: 'synth', synthType: 'FurnaceSU', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.SU } },
  { name: 'Supervision Init', type: 'synth', synthType: 'FurnaceSUPERVISION', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.SUPERVISION } },
  { name: 'TED Init', type: 'synth', synthType: 'FurnaceTED', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.TED } },
  { name: 'µPD1771 Init', type: 'synth', synthType: 'FurnaceUPD1771', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.UPD1771 } },
  { name: 'X1-010 Init', type: 'synth', synthType: 'FurnaceX1_010', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.X1_010 } },
  { name: 'Y8950 Init', type: 'synth', synthType: 'FurnaceY8950', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.Y8950 } },
  { name: 'YMZ280B Init', type: 'synth', synthType: 'FurnaceYMZ280B', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.YMZ280B } },
  { name: 'Furnace Generic Init', type: 'synth', synthType: 'Furnace', volume: -8, pan: 0, effects: [], furnace: { chipType: FurnaceChipType.OPN2 } },
];
