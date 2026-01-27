import type { InstrumentConfig } from '@typedefs/instrument';

/**
 * Furnace Engine Factory Presets
 * Authentic instrument patches extracted from Furnace Tracker libraries.
 */

export const FURNACE_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  // === SEGA GENESIS (YM2612) ===
  {
    name: 'Genesis E. Bass 1a',
    type: 'synth',
    synthType: 'Furnace',
    volume: -6,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 1, // OPN2 in Furnace
      algorithm: 0,
      feedback: 1,
      operators: [
        { enabled: true, am: false, ar: 31, dr: 18, mult: 10, rr: 15, sl: 2, tl: 36, dt2: 0, rs: 0, dt: 3, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: true, am: false, ar: 31, dr: 15, mult: 2, rr: 15, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: true, am: false, ar: 31, dr: 15, mult: 1, rr: 15, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: true, am: true, ar: 31, dr: 15, mult: 2, rr: 15, sl: 0, tl: 0, dt2: 0, rs: 4, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
      ],
      macros: [],
      opMacros: [],
      wavetables: []
    }
  },

  // === PC ADLIB (OPL3) ===
  {
    name: 'OPL3 Slap Bass',
    type: 'synth',
    synthType: 'Furnace',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 14, // OPL
      algorithm: 0,
      feedback: 0,
      operators: [
        { enabled: true, am: false, ar: 15, dr: 3, mult: 7, rr: 3, sl: 2, tl: 31, dt2: 0, rs: 0, dt: 5, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: true, am: false, ar: 15, dr: 0, mult: 1, rr: 15, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: false, am: false, ar: 0, dr: 0, mult: 0, rr: 0, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: true, am: true, ar: 3, dr: 3, mult: 1, rr: 29, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
      ],
      macros: [],
      opMacros: [],
      wavetables: []
    }
  },

  // === ATARI TIA ===
  {
    name: 'TIA Snare Drum',
    type: 'synth',
    synthType: 'Furnace',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 8, // TIA
      algorithm: 0,
      feedback: 4,
      operators: [
        { enabled: true, am: false, ar: 31, dr: 8, mult: 5, rr: 3, sl: 15, tl: 42, dt2: 0, rs: 0, dt: 5, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: true, am: false, ar: 0, dr: 0, mult: 0, rr: 0, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 15, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: false, am: false, ar: 0, dr: 0, mult: 0, rr: 0, sl: 0, tl: 0, dt2: 0, rs: 1, dt: 2, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: false, am: true, ar: 1, dr: 4, mult: 15, rr: 18, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
      ],
      macros: [],
      opMacros: [],
      wavetables: []
    }
  },

  // === COMMANDER X16 (VERA) ===
  {
    name: 'VERA 0-3-5 Arp Lead',
    type: 'synth',
    synthType: 'Furnace',
    volume: -10,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 24, // VERA
      algorithm: 0,
      feedback: 4,
      operators: [
        { enabled: true, am: false, ar: 31, dr: 8, mult: 5, rr: 3, sl: 15, tl: 42, dt2: 0, rs: 0, dt: 5, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: true, am: false, ar: 0, dr: 0, mult: 0, rr: 0, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 15, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: false, am: false, ar: 0, dr: 0, mult: 0, rr: 0, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
        { enabled: false, am: true, ar: 1, dr: 4, mult: 15, rr: 18, sl: 0, tl: 0, dt2: 0, rs: 0, dt: 0, d2r: 0, ssg: 0, ksl: 0, ksr: false, sus: false, vib: false, ws: 0 },
      ],
      macros: [],
      opMacros: [],
      wavetables: []
    }
  },

  // === KONAMI BUBBLE SYSTEM ===
  {
    name: 'Gradius Bubble Lead',
    type: 'synth',
    synthType: 'Furnace',
    volume: -8,
    pan: 0,
    effects: [],
    furnace: {
      chipType: 66, // Bubble System
      algorithm: 0,
      feedback: 0,
      operators: [],
      macros: [],
      opMacros: [],
      wavetables: [
        { 
          id: 0, 
          data: [128, 150, 180, 200, 220, 240, 255, 240, 220, 200, 180, 150, 128, 100, 70, 50, 30, 15, 0, 15, 30, 50, 70, 100, 128, 128, 128, 128, 128, 128, 128, 128]
        }
      ]
    }
  }
];