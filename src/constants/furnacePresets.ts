import type { InstrumentPreset } from '@typedefs/instrument';

/**
 * Furnace Engine Factory Presets
 * Authentic instrument patches for each chip type.
 * Organized by chip category for easy browsing.
 */

// Helper to create operator with defaults
const op = (overrides: Partial<{
  enabled: boolean; am: boolean; ar: number; dr: number; mult: number;
  rr: number; sl: number; tl: number; dt2: number; rs: number; dt: number;
  d2r: number; ssg: number; ksl: number; ksr: boolean; sus: boolean;
  vib: boolean; ws: number;
}> = {}) => ({
  enabled: true, am: false, ar: 31, dr: 0, mult: 1, rr: 15, sl: 0, tl: 0,
  dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false,
  vib: false, ws: 0, ...overrides,
});

const disabledOp = () => op({ enabled: false, tl: 127, ar: 0, rr: 0 });

export const FURNACE_PRESETS: InstrumentPreset['config'][] = [
  // ============================================
  // SEGA GENESIS / MEGA DRIVE (YM2612 / OPN2)
  // ============================================
  {
    name: 'Genesis Bass',
    type: 'synth',
    synthType: 'FurnaceOPN',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 0,  // OPN2 (YM2612) - Genesis
      algorithm: 4,
      feedback: 5,
      operators: [
        op({ mult: 1, tl: 20, ar: 31, dr: 8, sl: 2, rr: 8 }),
        op({ mult: 2, tl: 30, ar: 31, dr: 12, sl: 4, rr: 6, dt: 3 }),
        op({ mult: 1, tl: 25, ar: 31, dr: 10, sl: 3, rr: 8 }),
        op({ mult: 4, tl: 35, ar: 28, dr: 15, sl: 5, rr: 10, dt: -1 }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'Genesis Lead',
    type: 'synth',
    synthType: 'FurnaceOPN',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 0,  // OPN2 (YM2612) - Genesis
      algorithm: 5,
      feedback: 6,
      operators: [
        op({ mult: 1, tl: 10, ar: 31, dr: 4, sl: 1, rr: 6 }),
        op({ mult: 3, tl: 35, ar: 31, dr: 8, sl: 3, rr: 8, dt: 2 }),
        op({ mult: 2, tl: 30, ar: 31, dr: 6, sl: 2, rr: 8, dt: -2 }),
        op({ mult: 1, tl: 15, ar: 31, dr: 10, sl: 4, rr: 10, am: true }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'Genesis Brass',
    type: 'synth',
    synthType: 'FurnaceOPN',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 0,  // OPN2 (YM2612) - Genesis
      algorithm: 2,
      feedback: 7,
      operators: [
        op({ mult: 1, tl: 25, ar: 28, dr: 10, sl: 4, rr: 8 }),
        op({ mult: 1, tl: 20, ar: 31, dr: 8, sl: 3, rr: 10 }),
        op({ mult: 2, tl: 30, ar: 31, dr: 12, sl: 5, rr: 8, dt: 1 }),
        op({ mult: 1, tl: 15, ar: 25, dr: 6, sl: 2, rr: 6 }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'Genesis Bell',
    type: 'synth',
    synthType: 'FurnaceOPN',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 0,  // OPN2 (YM2612) - Genesis
      algorithm: 4,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 15, ar: 31, dr: 8, sl: 0, rr: 10 }),
        op({ mult: 7, tl: 40, ar: 31, dr: 12, sl: 2, rr: 12, dt: 3 }),
        op({ mult: 1, tl: 20, ar: 31, dr: 10, sl: 1, rr: 10 }),
        op({ mult: 14, tl: 45, ar: 31, dr: 15, sl: 3, rr: 14, dt: -2 }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'Genesis Strings',
    type: 'synth',
    synthType: 'FurnaceOPN',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 0,  // OPN2 (YM2612) - Genesis
      algorithm: 1,
      feedback: 3,
      operators: [
        op({ mult: 1, tl: 20, ar: 20, dr: 5, sl: 2, rr: 8 }),
        op({ mult: 2, tl: 35, ar: 25, dr: 8, sl: 4, rr: 10, dt: 1 }),
        op({ mult: 1, tl: 25, ar: 22, dr: 6, sl: 3, rr: 8, dt: -1 }),
        op({ mult: 3, tl: 40, ar: 28, dr: 10, sl: 5, rr: 12, am: true }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // YAMAHA OPM (X68000, Arcade)
  // ============================================
  {
    name: 'OPM Synth Lead',
    type: 'synth',
    synthType: 'FurnaceOPM',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 33,
      algorithm: 5,
      feedback: 6,
      operators: [
        op({ mult: 1, tl: 15, ar: 31, dr: 5, sl: 1, rr: 6 }),
        op({ mult: 3, tl: 40, ar: 31, dr: 8, sl: 3, rr: 8, dt: 2 }),
        op({ mult: 2, tl: 35, ar: 31, dr: 10, sl: 4, rr: 8, dt: -2 }),
        op({ mult: 1, tl: 25, ar: 31, dr: 12, sl: 5, rr: 10, am: true }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'OPM Electric Piano',
    type: 'synth',
    synthType: 'FurnaceOPM',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 33,
      algorithm: 4,
      feedback: 2,
      operators: [
        op({ mult: 1, tl: 18, ar: 31, dr: 10, sl: 3, rr: 8 }),
        op({ mult: 14, tl: 50, ar: 31, dr: 15, sl: 5, rr: 10 }),
        op({ mult: 1, tl: 20, ar: 31, dr: 12, sl: 4, rr: 10 }),
        op({ mult: 1, tl: 45, ar: 31, dr: 18, sl: 6, rr: 12, dt: 1 }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'OPM Metallic Drum',
    type: 'synth',
    synthType: 'FurnaceOPM',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 33,
      algorithm: 4,
      feedback: 7,
      operators: [
        op({ mult: 1, tl: 20, ar: 31, dr: 15, sl: 0, rr: 15 }),
        op({ mult: 5, tl: 30, ar: 31, dr: 12, sl: 0, rr: 15, dt: 2 }),
        op({ mult: 9, tl: 40, ar: 31, dr: 10, sl: 0, rr: 15, dt: -2 }),
        op({ mult: 2, tl: 50, ar: 31, dr: 8, sl: 0, rr: 15 }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // PC ADLIB / SOUND BLASTER (OPL3)
  // ============================================
  {
    name: 'OPL3 Organ',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 14,
      algorithm: 0,
      feedback: 3,
      operators: [
        op({ mult: 2, tl: 30, ar: 15, dr: 4, sl: 8, rr: 5, ws: 1 }),
        op({ mult: 1, tl: 0, ar: 15, dr: 2, sl: 4, rr: 8, ws: 0 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'OPL3 Slap Bass',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 14,
      algorithm: 0,
      feedback: 5,
      operators: [
        op({ mult: 4, tl: 35, ar: 15, dr: 6, sl: 3, rr: 4, ws: 0 }),
        op({ mult: 1, tl: 0, ar: 15, dr: 3, sl: 2, rr: 6, ws: 0 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'OPL3 Bass Drum',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -4,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 14,
      algorithm: 0,
      feedback: 4,
      operators: [
        op({ mult: 1, tl: 10, ar: 31, dr: 6, sl: 2, rr: 6, ws: 0 }),
        op({ mult: 0, tl: 0, ar: 31, dr: 8, sl: 0, rr: 8, ws: 0 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'OPL3 Snare',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 14,
      algorithm: 0,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 5, ar: 31, dr: 10, sl: 0, rr: 10, ws: 3 }),
        op({ mult: 4, tl: 20, ar: 31, dr: 8, sl: 0, rr: 8, ws: 0 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'OPL3 Brass',
    type: 'synth',
    synthType: 'FurnaceOPL',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 14,
      algorithm: 0,
      feedback: 4,
      operators: [
        op({ mult: 1, tl: 25, ar: 12, dr: 5, sl: 5, rr: 6, ws: 0 }),
        op({ mult: 1, tl: 5, ar: 14, dr: 4, sl: 3, rr: 8, ws: 0 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // NINTENDO NES (2A03)
  // ============================================
  {
    name: 'NES Pulse Lead',
    type: 'synth',
    synthType: 'FurnaceNES',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 34,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 0, ar: 31, dr: 0, sl: 0, rr: 12 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'NES Bass',
    type: 'synth',
    synthType: 'FurnaceNES',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 34,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 5, ar: 31, dr: 4, sl: 2, rr: 8 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'NES Triangle',
    type: 'synth',
    synthType: 'FurnaceNES',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 34,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 8, ar: 31, dr: 2, sl: 1, rr: 10 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // GAME BOY (DMG)
  // ============================================
  {
    name: 'GB Pulse',
    type: 'synth',
    synthType: 'FurnaceGB',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 2,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 5, ar: 28, dr: 2, sl: 2, rr: 10 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'GB Wave Bass',
    type: 'synth',
    synthType: 'FurnaceGB',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 2,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 8, ar: 31, dr: 5, sl: 3, rr: 8 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'GB Arp Lead',
    type: 'synth',
    synthType: 'FurnaceGB',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 2,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 3, ar: 31, dr: 3, sl: 1, rr: 12 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // SEGA MASTER SYSTEM / PSG (SN76489)
  // ============================================
  {
    name: 'PSG Square Lead',
    type: 'synth',
    synthType: 'FurnacePSG',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 8,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 8, ar: 31, dr: 4, sl: 3, rr: 8 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'PSG Bass',
    type: 'synth',
    synthType: 'FurnacePSG',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 8,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 12, ar: 31, dr: 6, sl: 4, rr: 6 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // COMMODORE 64 — SID 6581 (warm, gritty analog)
  // ============================================
  {
    name: '6581 Pulse Lead',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
        a: 0, d: 6, s: 12, r: 4,
        duty: 2048,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 1200, filterResonance: 4,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '6581 Saw Lead',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 10, r: 6,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: false, initFilter: false,
        filterCutoff: 1024, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '6581 Saw Bass',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 14, r: 2,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 512, filterResonance: 6,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '6581 Pulse Bass',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
        a: 0, d: 6, s: 15, r: 3,
        duty: 1024,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 400, filterResonance: 8,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '6581 Arp Pulse',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
        a: 0, d: 4, s: 0, r: 2,
        duty: 2048,
        ringMod: false, oscSync: false,
        toFilter: false, initFilter: false,
        filterCutoff: 1024, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '6581 Noise Snare',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: false, sawOn: false, pulseOn: false, noiseOn: true,
        a: 0, d: 4, s: 0, r: 0,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 800, filterResonance: 2,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '6581 Kick',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -4,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: true, sawOn: false, pulseOn: false, noiseOn: false,
        a: 0, d: 6, s: 0, r: 0,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 300, filterResonance: 0,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '6581 Ring Mod',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: true, sawOn: false, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 8, r: 6,
        duty: 0,
        ringMod: true, oscSync: false,
        toFilter: false, initFilter: false,
        filterCutoff: 1024, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '6581 Filter Sweep',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 2, d: 10, s: 6, r: 8,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 900, filterResonance: 12,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '6581 Pad',
    type: 'synth',
    synthType: 'FurnaceSID6581',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 45,
      c64: {
        triOn: false, sawOn: true, pulseOn: true, noiseOn: false,
        a: 8, d: 6, s: 10, r: 10,
        duty: 2048,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 700, filterResonance: 4,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // COMMODORE 64 — SID 8580 (cleaner, crisper)
  // ============================================
  {
    name: '8580 Pulse Lead',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 46,
      c64: {
        triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
        a: 0, d: 6, s: 12, r: 4,
        duty: 2048,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 1400, filterResonance: 4,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '8580 Saw Lead',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 46,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 10, r: 6,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: false, initFilter: false,
        filterCutoff: 1024, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '8580 Saw Bass',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 46,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 14, r: 2,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 600, filterResonance: 6,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '8580 Pulse Bass',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 46,
      c64: {
        triOn: false, sawOn: false, pulseOn: true, noiseOn: false,
        a: 0, d: 6, s: 15, r: 3,
        duty: 1024,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 500, filterResonance: 8,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '8580 Arp Saw',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 46,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 3, s: 0, r: 2,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: false, initFilter: false,
        filterCutoff: 1024, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '8580 Hi-Hat',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 46,
      c64: {
        triOn: false, sawOn: false, pulseOn: false, noiseOn: true,
        a: 0, d: 2, s: 0, r: 0,
        duty: 0,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 1200, filterResonance: 0,
        filterLP: false, filterBP: false, filterHP: true, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '8580 Sync Lead',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 46,
      c64: {
        triOn: false, sawOn: true, pulseOn: false, noiseOn: false,
        a: 0, d: 8, s: 10, r: 6,
        duty: 0,
        ringMod: false, oscSync: true,
        toFilter: true, initFilter: true,
        filterCutoff: 1000, filterResonance: 6,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: '8580 Pad',
    type: 'synth',
    synthType: 'FurnaceSID8580',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 46,
      c64: {
        triOn: false, sawOn: true, pulseOn: true, noiseOn: false,
        a: 8, d: 6, s: 10, r: 10,
        duty: 2048,
        ringMod: false, oscSync: false,
        toFilter: true, initFilter: true,
        filterCutoff: 800, filterResonance: 4,
        filterLP: true, filterBP: false, filterHP: false, filterCh3Off: false,
      },
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // AY-3-8910 (ZX Spectrum, MSX, Atari ST)
  // ============================================
  {
    name: 'AY Buzzy Lead',
    type: 'synth',
    synthType: 'FurnaceAY',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 5,
      algorithm: 7,
      feedback: 1,
      operators: [
        op({ mult: 1, tl: 10, ar: 31, dr: 6, d2r: 2, sl: 4, rr: 6 }),
        op({ mult: 3, tl: 50, ar: 31, dr: 8, sl: 8, rr: 10 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'AY Square Bass',
    type: 'synth',
    synthType: 'FurnaceAY',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 5,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 15, ar: 31, dr: 8, sl: 5, rr: 5 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // PC ENGINE / TURBOGRAFX (HuC6280)
  // ============================================
  {
    name: 'PCE Wave Lead',
    type: 'synth',
    synthType: 'FurnacePCE',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 4,
      algorithm: 6,
      feedback: 2,
      operators: [
        op({ mult: 1, tl: 12, ar: 31, dr: 5, sl: 2, rr: 8 }),
        op({ mult: 2, tl: 40, ar: 31, dr: 8, sl: 4, rr: 10 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'PCE Bass',
    type: 'synth',
    synthType: 'FurnacePCE',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 4,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 8, ar: 31, dr: 6, sl: 3, rr: 6 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // VRC6 (Famicom expansion)
  // ============================================
  {
    name: 'VRC6 Pulse Lead',
    type: 'synth',
    synthType: 'FurnaceVRC6',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 21,
      algorithm: 5,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 5, ar: 31, dr: 3, sl: 1, rr: 10 }),
        op({ mult: 2, tl: 30, ar: 31, dr: 6, sl: 3, rr: 12 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'VRC6 Saw Bass',
    type: 'synth',
    synthType: 'FurnaceVRC6',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 21,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 10, ar: 31, dr: 5, sl: 2, rr: 8 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // N163 (Namco wavetable)
  // ============================================
  {
    name: 'N163 Wave Lead',
    type: 'synth',
    synthType: 'FurnaceN163',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 22,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 8, ar: 31, dr: 4, sl: 2, rr: 8 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [],
      wavetables: [{ id: 0, data: [8,10,12,14,15,14,12,10,8,6,4,2,1,2,4,6] }]
    }
  },

  // ============================================
  // ATARI TIA (2600)
  // ============================================
  {
    name: 'TIA Buzzy',
    type: 'synth',
    synthType: 'FurnaceTIA',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 38,
      algorithm: 7,
      feedback: 7,
      operators: [
        op({ mult: 1, tl: 20, ar: 31, dr: 15, d2r: 5, sl: 8, rr: 4 }),
        op({ mult: 5, tl: 45, ar: 31, dr: 20, sl: 10, rr: 6, dt: 2 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // VERA (Commander X16)
  // ============================================
  {
    name: 'VERA PSG Lead',
    type: 'synth',
    synthType: 'FurnaceVERA',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 42,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 10, ar: 31, dr: 4, sl: 2, rr: 10 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // SCC (Konami wavetable)
  // ============================================
  {
    name: 'SCC Wave',
    type: 'synth',
    synthType: 'FurnaceSCC',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 10,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 8, ar: 31, dr: 5, sl: 2, rr: 10 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [],
      wavetables: [{ id: 0, data: [0,32,64,96,127,96,64,32,0,-32,-64,-96,-127,-96,-64,-32] }]
    }
  },

  // ============================================
  // OPLL (MSX, VRC7)
  // ============================================
  {
    name: 'OPLL Piano',
    type: 'synth',
    synthType: 'FurnaceOPLL',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 9,
      algorithm: 0,
      feedback: 2,
      operators: [
        op({ mult: 4, tl: 35, ar: 15, dr: 5, sl: 6, rr: 7 }),
        op({ mult: 1, tl: 0, ar: 15, dr: 3, sl: 3, rr: 6 }),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // SNES (S-DSP)
  // ============================================
  {
    name: 'SNES Pad',
    type: 'synth',
    synthType: 'FurnaceSNES',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 41,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 12, ar: 20, dr: 4, sl: 2, rr: 12 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
  {
    name: 'SNES Bass',
    type: 'synth',
    synthType: 'FurnaceSNES',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 41,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 8, ar: 31, dr: 6, sl: 3, rr: 8 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // FDS (Famicom Disk System)
  // ============================================
  {
    name: 'FDS Wave',
    type: 'synth',
    synthType: 'FurnaceFDS',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 23,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 10, ar: 31, dr: 4, sl: 2, rr: 10 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [],
      wavetables: [{ id: 0, data: [32,40,48,56,63,56,48,40,32,24,16,8,0,8,16,24] }]
    }
  },

  // ============================================
  // VIC-20
  // ============================================
  {
    name: 'VIC Pulse',
    type: 'synth',
    synthType: 'FurnaceVIC',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 32,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 12, ar: 31, dr: 5, sl: 3, rr: 8 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // SAA1099 (SAM Coupe, etc.)
  // ============================================
  {
    name: 'SAA Square',
    type: 'synth',
    synthType: 'FurnaceSAA',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 31,
      algorithm: 7,
      feedback: 0,
      operators: [
        op({ mult: 1, tl: 10, ar: 31, dr: 4, sl: 2, rr: 10 }),
        disabledOp(),
        disabledOp(),
        disabledOp(),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // ESFM (Enhanced OPL)
  // ============================================
  {
    name: 'ESFM Lead',
    type: 'synth',
    synthType: 'FurnaceESFM',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 48,
      algorithm: 5,
      feedback: 5,
      operators: [
        op({ mult: 1, tl: 15, ar: 15, dr: 4, sl: 2, rr: 6 }),
        op({ mult: 3, tl: 35, ar: 15, dr: 6, sl: 4, rr: 8, dt: 1 }),
        op({ mult: 2, tl: 30, ar: 15, dr: 5, sl: 3, rr: 8 }),
        op({ mult: 1, tl: 20, ar: 15, dr: 8, sl: 5, rr: 10, am: true }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },

  // ============================================
  // OPZ (TX81Z style)
  // ============================================
  {
    name: 'OPZ E.Piano',
    type: 'synth',
    synthType: 'FurnaceOPZ',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 40,
      algorithm: 4,
      feedback: 3,
      operators: [
        op({ mult: 1, tl: 18, ar: 31, dr: 10, sl: 3, rr: 8 }),
        op({ mult: 14, tl: 48, ar: 31, dr: 14, sl: 5, rr: 10, dt: 1 }),
        op({ mult: 1, tl: 20, ar: 31, dr: 12, sl: 4, rr: 10 }),
        op({ mult: 1, tl: 45, ar: 31, dr: 16, sl: 6, rr: 12 }),
      ],
      macros: [], opMacros: [], wavetables: []
    }
  },
];
