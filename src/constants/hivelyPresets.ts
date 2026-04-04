/**
 * HivelyTracker Factory Presets
 *
 * The HivelyTracker/AHX synth engine generates sound through waveform tables
 * (triangle, sawtooth, square, noise) with a performance list that sequences
 * waveform changes, filter sweeps, and pitch slides per tick. The performance
 * list is what gives HVL its characteristic buzzy, morphing chiptune sound.
 *
 * Waveforms: 0=triangle, 1=sawtooth, 2=square, 3=noise, +4=filtered variants
 * Effects in plist: 0=filter, 1=slide up, 2=slide down, 3=square mod,
 *   4=filter mod, 5=jump, 6=raw tri, 7=raw saw, 8=raw sqr, 9=raw noise, C=volume, F=speed
 */

import type { InstrumentPreset } from '@typedefs/instrument';
import type { HivelyConfig, HivelyPerfEntryConfig } from '@typedefs/instrument/exotic';

// Shorthand for performance list entries
const pe = (
  waveform: number, note = 0, fixed = false,
  fx1 = 0, fp1 = 0, fx2 = 0, fp2 = 0,
): HivelyPerfEntryConfig => ({
  note, waveform, fixed,
  fx: [fx1, fx2] as [number, number],
  fxParam: [fp1, fp2] as [number, number],
});

// Wrap a HivelyConfig into a full preset
const preset = (name: string, h: HivelyConfig): InstrumentPreset['config'] => ({
  type: 'synth' as const,
  name,
  synthType: 'HivelySynth' as const,
  hively: h,
  effects: [],
  volume: -8,
  pan: 0,
});

// ══════════════════════════════════════════════════════════════════════════════
//  BASS
// ══════════════════════════════════════════════════════════════════════════════

export const HIVELY_PRESETS: InstrumentPreset['config'][] = [
  preset('HVL Thick Bass', {
    volume: 64, waveLength: 4,
    filterLowerLimit: 10, filterUpperLimit: 40, filterSpeed: 4,
    squareLowerLimit: 16, squareUpperLimit: 48, squareSpeed: 1,
    vibratoDelay: 0, vibratoSpeed: 0, vibratoDepth: 0,
    hardCutRelease: false, hardCutReleaseFrames: 0,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 8, dVolume: 50, sFrames: 32, rFrames: 4, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(1, 0),        // sawtooth
      pe(1, 0),
      pe(2, 0),        // switch to square
      pe(2, 0),
    ]},
  }),

  preset('HVL Sub Bass', {
    volume: 64, waveLength: 5,
    filterLowerLimit: 5, filterUpperLimit: 20, filterSpeed: 2,
    squareLowerLimit: 32, squareUpperLimit: 32, squareSpeed: 0,
    vibratoDelay: 0, vibratoSpeed: 0, vibratoDepth: 0,
    hardCutRelease: false, hardCutReleaseFrames: 0,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 4, dVolume: 56, sFrames: 50, rFrames: 6, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(0, 0),        // triangle — pure sub
    ]},
  }),

  preset('HVL Acid Bass', {
    volume: 64, waveLength: 3,
    filterLowerLimit: 8, filterUpperLimit: 50, filterSpeed: 8,
    squareLowerLimit: 20, squareUpperLimit: 60, squareSpeed: 3,
    vibratoDelay: 0, vibratoSpeed: 0, vibratoDepth: 0,
    hardCutRelease: true, hardCutReleaseFrames: 3,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 6, dVolume: 40, sFrames: 20, rFrames: 3, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(2, 0, false, 0, 40),   // square with filter sweep
      pe(2, 0, false, 0, 30),
      pe(1, 0, false, 0, 20),   // morph to saw
      pe(1, 0, false, 0, 10),
    ]},
  }),

  // ══════════════════════════════════════════════════════════════════════════
  //  LEADS
  // ══════════════════════════════════════════════════════════════════════════

  preset('HVL Buzz Lead', {
    volume: 60, waveLength: 2,
    filterLowerLimit: 20, filterUpperLimit: 50, filterSpeed: 6,
    squareLowerLimit: 10, squareUpperLimit: 50, squareSpeed: 4,
    vibratoDelay: 20, vibratoSpeed: 4, vibratoDepth: 2,
    hardCutRelease: false, hardCutReleaseFrames: 0,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 4, dVolume: 52, sFrames: 40, rFrames: 6, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(2, 0),        // square
      pe(1, 0),        // saw
      pe(2, 0),        // square
      pe(1, 0),        // saw — alternating creates buzz
    ]},
  }),

  preset('HVL Screamer', {
    volume: 58, waveLength: 1,
    filterLowerLimit: 30, filterUpperLimit: 63, filterSpeed: 10,
    squareLowerLimit: 8, squareUpperLimit: 120, squareSpeed: 6,
    vibratoDelay: 0, vibratoSpeed: 6, vibratoDepth: 3,
    hardCutRelease: true, hardCutReleaseFrames: 2,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 2, dVolume: 58, sFrames: 60, rFrames: 3, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(1, 0, false, 0, 50),   // saw + filter high
      pe(1, 0, false, 0, 60),
      pe(2, 0, false, 0, 50),   // square
      pe(1, 0, false, 0, 40),
    ]},
  }),

  preset('HVL Chip Lead', {
    volume: 56, waveLength: 2,
    filterLowerLimit: 0, filterUpperLimit: 0, filterSpeed: 0,
    squareLowerLimit: 32, squareUpperLimit: 32, squareSpeed: 0,
    vibratoDelay: 30, vibratoSpeed: 3, vibratoDepth: 1,
    hardCutRelease: false, hardCutReleaseFrames: 0,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 1, dVolume: 60, sFrames: 80, rFrames: 8, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(2, 0),        // clean square
    ]},
  }),

  preset('HVL Morphing Lead', {
    volume: 58, waveLength: 3,
    filterLowerLimit: 15, filterUpperLimit: 45, filterSpeed: 3,
    squareLowerLimit: 16, squareUpperLimit: 80, squareSpeed: 2,
    vibratoDelay: 10, vibratoSpeed: 3, vibratoDepth: 2,
    hardCutRelease: false, hardCutReleaseFrames: 0,
    envelope: { aFrames: 2, aVolume: 64, dFrames: 6, dVolume: 48, sFrames: 40, rFrames: 10, rVolume: 0 },
    performanceList: { speed: 2, entries: [
      pe(0, 0),        // triangle
      pe(0, 0),
      pe(1, 0),        // sawtooth
      pe(1, 0),
      pe(2, 0),        // square
      pe(2, 0),
      pe(1, 0),        // back to saw
      pe(0, 0),        // back to tri
    ]},
  }),

  // ══════════════════════════════════════════════════════════════════════════
  //  PADS / ATMOSPHERE
  // ══════════════════════════════════════════════════════════════════════════

  preset('HVL Soft Pad', {
    volume: 50, waveLength: 4,
    filterLowerLimit: 5, filterUpperLimit: 25, filterSpeed: 1,
    squareLowerLimit: 30, squareUpperLimit: 50, squareSpeed: 1,
    vibratoDelay: 10, vibratoSpeed: 2, vibratoDepth: 1,
    hardCutRelease: false, hardCutReleaseFrames: 0,
    envelope: { aFrames: 15, aVolume: 55, dFrames: 10, dVolume: 45, sFrames: 80, rFrames: 20, rVolume: 0 },
    performanceList: { speed: 3, entries: [
      pe(0, 0),        // triangle — soft
      pe(0, 0),
      pe(0, 0),
      pe(0, 0),
    ]},
  }),

  preset('HVL Sweeping Pad', {
    volume: 48, waveLength: 4,
    filterLowerLimit: 8, filterUpperLimit: 50, filterSpeed: 2,
    squareLowerLimit: 20, squareUpperLimit: 100, squareSpeed: 1,
    vibratoDelay: 5, vibratoSpeed: 2, vibratoDepth: 2,
    hardCutRelease: false, hardCutReleaseFrames: 0,
    envelope: { aFrames: 20, aVolume: 50, dFrames: 15, dVolume: 40, sFrames: 60, rFrames: 25, rVolume: 0 },
    performanceList: { speed: 4, entries: [
      pe(1, 0, false, 0, 10),   // saw with filter
      pe(1, 0, false, 0, 20),
      pe(1, 0, false, 0, 30),
      pe(1, 0, false, 0, 40),
      pe(1, 0, false, 0, 30),
      pe(1, 0, false, 0, 20),
    ]},
  }),

  // ══════════════════════════════════════════════════════════════════════════
  //  PERCUSSION / FX
  // ══════════════════════════════════════════════════════════════════════════

  preset('HVL Snare', {
    volume: 64, waveLength: 1,
    filterLowerLimit: 20, filterUpperLimit: 60, filterSpeed: 12,
    squareLowerLimit: 0, squareUpperLimit: 0, squareSpeed: 0,
    vibratoDelay: 0, vibratoSpeed: 0, vibratoDepth: 0,
    hardCutRelease: true, hardCutReleaseFrames: 4,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 8, dVolume: 0, sFrames: 1, rFrames: 1, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(3, 36, true),    // noise at fixed pitch
      pe(3, 36, true),
      pe(3, 30, true),    // pitch down
      pe(3, 24, true),
    ]},
  }),

  preset('HVL Kick', {
    volume: 64, waveLength: 4,
    filterLowerLimit: 0, filterUpperLimit: 0, filterSpeed: 0,
    squareLowerLimit: 32, squareUpperLimit: 32, squareSpeed: 0,
    vibratoDelay: 0, vibratoSpeed: 0, vibratoDepth: 0,
    hardCutRelease: true, hardCutReleaseFrames: 5,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 10, dVolume: 0, sFrames: 1, rFrames: 1, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(0, 48, true),    // triangle at high pitch
      pe(0, 36, true),    // drop
      pe(0, 24, true),    // lower
      pe(0, 12, true),    // sub
      pe(0, 6, true),     // very low
    ]},
  }),

  preset('HVL Hi-Hat', {
    volume: 50, waveLength: 0,
    filterLowerLimit: 40, filterUpperLimit: 63, filterSpeed: 15,
    squareLowerLimit: 0, squareUpperLimit: 0, squareSpeed: 0,
    vibratoDelay: 0, vibratoSpeed: 0, vibratoDepth: 0,
    hardCutRelease: true, hardCutReleaseFrames: 2,
    envelope: { aFrames: 1, aVolume: 50, dFrames: 4, dVolume: 0, sFrames: 1, rFrames: 1, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(3, 48, true),    // noise — short burst
      pe(3, 48, true),
    ]},
  }),

  preset('HVL Laser', {
    volume: 58, waveLength: 2,
    filterLowerLimit: 30, filterUpperLimit: 63, filterSpeed: 15,
    squareLowerLimit: 8, squareUpperLimit: 120, squareSpeed: 8,
    vibratoDelay: 0, vibratoSpeed: 0, vibratoDepth: 0,
    hardCutRelease: true, hardCutReleaseFrames: 3,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 12, dVolume: 0, sFrames: 1, rFrames: 1, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(1, 0, false, 2, 8),    // saw + slide down
      pe(1, 0, false, 2, 8),
      pe(1, 0, false, 2, 8),
      pe(1, 0, false, 2, 8),
    ]},
  }),

  preset('HVL Arpeggio', {
    volume: 56, waveLength: 2,
    filterLowerLimit: 10, filterUpperLimit: 40, filterSpeed: 4,
    squareLowerLimit: 24, squareUpperLimit: 48, squareSpeed: 2,
    vibratoDelay: 0, vibratoSpeed: 0, vibratoDepth: 0,
    hardCutRelease: false, hardCutReleaseFrames: 0,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 3, dVolume: 52, sFrames: 30, rFrames: 6, rVolume: 0 },
    performanceList: { speed: 1, entries: [
      pe(2, 0),          // root
      pe(2, 4),          // +4 semitones (major 3rd)
      pe(2, 7),          // +7 semitones (5th)
      pe(2, 12),         // +12 semitones (octave)
      pe(2, 7),          // back down
      pe(2, 4),
    ]},
  }),

  preset('HVL Wobble', {
    volume: 60, waveLength: 3,
    filterLowerLimit: 5, filterUpperLimit: 55, filterSpeed: 6,
    squareLowerLimit: 10, squareUpperLimit: 120, squareSpeed: 4,
    vibratoDelay: 0, vibratoSpeed: 8, vibratoDepth: 4,
    hardCutRelease: false, hardCutReleaseFrames: 0,
    envelope: { aFrames: 1, aVolume: 64, dFrames: 4, dVolume: 55, sFrames: 50, rFrames: 8, rVolume: 0 },
    performanceList: { speed: 2, entries: [
      pe(1, 0, false, 4, 20),   // saw + filter mod
      pe(2, 0, false, 4, 40),   // square + stronger filter mod
      pe(1, 0, false, 4, 60),
      pe(2, 0, false, 4, 40),
    ]},
  }),
];
