/**
 * JUCE WASM Synth Factory Presets
 * Presets for Dexed (DX7) and OB-Xd (Oberheim OB-X)
 */

import type { InstrumentPreset } from '@typedefs/instrument';
import { DEXED_PRESETS } from '../engine/dexed/DexedSynth';
import { OBXD_PRESETS } from '../engine/obxd/OBXdSynth';

// Helper to create basic DX7 operator
const dxOp = (level: number, coarse: number, fine: number = 0, detune: number = 7) => ({
  level, coarse, fine, detune,
  egRates: [99, 99, 99, 99] as [number, number, number, number], 
  egLevels: [99, 99, 99, 0] as [number, number, number, number]
});

export const DEXED_FACTORY_PRESETS: InstrumentPreset['config'][] = [
  // --- KEYS & PIANOS ---
  {
    name: 'DX7 E.Piano 1',
    type: 'synth',
    synthType: 'Dexed',
    volume: -10,
    pan: 0,
    effects: [],
    dexed: DEXED_PRESETS['E.PIANO 1'],
  },
  {
    name: 'DX7 E.Piano Bright',
    type: 'synth',
    synthType: 'Dexed',
    volume: -10,
    pan: 0,
    effects: [],
    dexed: {
      ...DEXED_PRESETS['E.PIANO 1'],
      feedback: 7, // More harmonics
    },
  },
  {
    name: 'DX7 Clavinet',
    type: 'synth',
    synthType: 'Dexed',
    volume: -10,
    pan: 0,
    effects: [],
    dexed: {
      algorithm: 4,
      feedback: 0,
      operators: [
        { level: 99, coarse: 1, egRates: [99, 60, 30, 60] as [number, number, number, number], egLevels: [99, 0, 0, 0] as [number, number, number, number] },
        { level: 80, coarse: 2, egRates: [99, 50, 20, 50] as [number, number, number, number], egLevels: [99, 0, 0, 0] as [number, number, number, number] },
        dxOp(0, 1), dxOp(0, 1), dxOp(0, 1), dxOp(0, 1)
      ]
    },
  },
  {
    name: 'DX7 Organ',
    type: 'synth',
    synthType: 'Dexed',
    volume: -12,
    pan: 0,
    effects: [],
    dexed: {
      algorithm: 3, // Stacked modulators
      feedback: 0,
      operators: [
        { level: 99, coarse: 1 }, // Fundamental
        { level: 90, coarse: 2 }, // Octave
        { level: 85, coarse: 3 }, // Fifth
        { level: 80, coarse: 4 }, // 2 Octaves
        dxOp(0, 1), dxOp(0, 1)
      ]
    },
  },

  // --- BASS ---
  {
    name: 'DX7 Bass 1',
    type: 'synth',
    synthType: 'Dexed',
    volume: -8,
    pan: 0,
    effects: [],
    dexed: {
      algorithm: 5,
      feedback: 7,
      operators: [
        { level: 99, coarse: 1, fine: 0, detune: 7, egRates: [99, 75, 40, 60] as [number, number, number, number], egLevels: [99, 90, 0, 0] as [number, number, number, number] },
        { level: 75, coarse: 1, fine: 0, detune: 7, egRates: [99, 75, 40, 60] as [number, number, number, number], egLevels: [99, 90, 0, 0] as [number, number, number, number] },
        { level: 50, coarse: 2, fine: 0, detune: 7, egRates: [99, 75, 40, 60] as [number, number, number, number], egLevels: [99, 90, 0, 0] as [number, number, number, number] },
        dxOp(0, 1), dxOp(0, 1), dxOp(0, 1)
      ]
    },
  },
  {
    name: 'DX7 Slap Bass',
    type: 'synth',
    synthType: 'Dexed',
    volume: -8,
    pan: 0,
    effects: [],
    dexed: {
      algorithm: 16, // 1 carrier, 1 modulator stack
      feedback: 6,
      operators: [
        { level: 99, coarse: 1, egRates: [99, 60, 40, 60] as [number, number, number, number], egLevels: [99, 95, 0, 0] as [number, number, number, number] },
        { level: 88, coarse: 4, egRates: [99, 80, 60, 80] as [number, number, number, number], egLevels: [99, 0, 0, 0] as [number, number, number, number] }, // Snap
        dxOp(0, 1), dxOp(0, 1), dxOp(0, 1), dxOp(0, 1)
      ]
    },
  },
  {
    name: 'DX7 Solid Bass',
    type: 'synth',
    synthType: 'Dexed',
    volume: -8,
    pan: 0,
    effects: [],
    dexed: {
      algorithm: 18,
      feedback: 4,
      operators: [
        { level: 99, coarse: 0, fine: 50 }, // Sub
        { level: 80, coarse: 1 },
        { level: 70, coarse: 1 },
        dxOp(0, 1), dxOp(0, 1), dxOp(0, 1)
      ]
    },
  },

  // --- BELLS & MALLETS ---
  {
    name: 'DX7 Tubular Bells',
    type: 'synth',
    synthType: 'Dexed',
    volume: -12,
    pan: 0,
    effects: [],
    dexed: {
      algorithm: 1,
      feedback: 5,
      operators: [
        { level: 99, coarse: 1, fine: 0, detune: 7, egRates: [99, 40, 20, 50] as [number, number, number, number], egLevels: [99, 0, 0, 0] as [number, number, number, number] },
        { level: 85, coarse: 3, fine: 50, detune: 7, egRates: [99, 60, 30, 50] as [number, number, number, number], egLevels: [99, 0, 0, 0] as [number, number, number, number] }, // Non-integer ratio
        dxOp(0, 1), dxOp(0, 1), dxOp(0, 1), dxOp(0, 1)
      ]
    },
  },
  {
    name: 'DX7 Marimba',
    type: 'synth',
    synthType: 'Dexed',
    volume: -10,
    pan: 0,
    effects: [],
    dexed: {
      algorithm: 4,
      feedback: 0,
      operators: [
        { level: 99, coarse: 1, egRates: [99, 70, 30, 60] as [number, number, number, number], egLevels: [99, 0, 0, 0] as [number, number, number, number] },
        { level: 80, coarse: 4, egRates: [99, 60, 20, 50] as [number, number, number, number], egLevels: [99, 0, 0, 0] as [number, number, number, number] },
        dxOp(0, 1), dxOp(0, 1), dxOp(0, 1), dxOp(0, 1)
      ]
    },
  },

  // --- BRASS & STRINGS ---
  {
    name: 'DX7 Brass 1',
    type: 'synth',
    synthType: 'Dexed',
    volume: -10,
    pan: 0,
    effects: [],
    dexed: DEXED_PRESETS['BRASS 1'],
  },
  {
    name: 'DX7 Strings 1',
    type: 'synth',
    synthType: 'Dexed',
    volume: -10,
    pan: 0,
    effects: [],
    dexed: DEXED_PRESETS['STRINGS 1'],
  },
  {
    name: 'DX7 Init Voice',
    type: 'synth',
    synthType: 'Dexed',
    volume: -10,
    pan: 0,
    effects: [],
    dexed: DEXED_PRESETS['INIT VOICE'],
  },
];

export const OBXD_FACTORY_PRESETS: InstrumentPreset['config'][] = [
  // --- BRASS ---
  {
    name: 'OB-X Classic Brass',
    type: 'synth',
    synthType: 'OBXd',
    volume: -10,
    pan: 0,
    effects: [],
    obxd: OBXD_PRESETS['Classic Brass'],
  },
  {
    name: 'OB-X Bright Brass',
    type: 'synth',
    synthType: 'OBXd',
    volume: -10,
    pan: 0,
    effects: [],
    obxd: {
      ...OBXD_PRESETS['Classic Brass'],
      filterCutoff: 0.6,
      filterEnvAmount: 0.7,
      unison: true,
      unisonDetune: 0.1,
    },
  },

  // --- LEADS ---
  {
    name: 'OB-X Fat Lead',
    type: 'synth',
    synthType: 'OBXd',
    volume: -10,
    pan: 0,
    effects: [],
    obxd: OBXD_PRESETS['Fat Lead'],
  },
  {
    name: 'OB-X Sync Lead',
    type: 'synth',
    synthType: 'OBXd',
    volume: -10,
    pan: 0,
    effects: [],
    obxd: OBXD_PRESETS['Sync Lead'],
  },
  {
    name: 'OB-X Unison Saw',
    type: 'synth',
    synthType: 'OBXd',
    volume: -8,
    pan: 0,
    effects: [],
    obxd: {
      osc1Waveform: 0, // SAW
      osc2Waveform: 0, // SAW
      unison: true,
      unisonDetune: 0.2,
      panSpread: 0.5,
      filterCutoff: 1.0,
      ampRelease: 0.2,
    }
  },

  // --- BASS ---
  {
    name: 'OB-X Rez Bass',
    type: 'synth',
    synthType: 'OBXd',
    volume: -8,
    pan: 0,
    effects: [],
    obxd: {
      osc1Waveform: 0, // SAW
      osc2Waveform: 1, // PULSE
      osc2Detune: 0.08,
      filterCutoff: 0.3,
      filterResonance: 0.6,
      filterEnvAmount: 0.7,
      filterAttack: 0.05,
      filterDecay: 0.2,
      ampAttack: 0.01,
      ampDecay: 0.3,
    }
  },
  {
    name: 'OB-X Sub Bass',
    type: 'synth',
    synthType: 'OBXd',
    volume: -6,
    pan: 0,
    effects: [],
    obxd: {
      osc1Waveform: 2, // TRIANGLE
      osc2Waveform: 0, // SAW
      osc2Octave: -1 as -1 | -2,
      filterCutoff: 0.2,
      filterResonance: 0.0,
      filterEnvAmount: 0.3,
      filterDecay: 0.4,
    }
  },

  // --- PADS & STRINGS ---
  {
    name: 'OB-X PWM Strings',
    type: 'synth',
    synthType: 'OBXd',
    volume: -12,
    pan: 0,
    effects: [],
    obxd: {
      osc1Waveform: 1, // PULSE
      osc2Waveform: 1, // PULSE
      osc1PulseWidth: 0.5,
      osc2Detune: 0.03,
      lfoRate: 0.2,
      lfoPwAmount: 0.4,
      filterCutoff: 0.4,
      filterResonance: 0.1,
      ampAttack: 0.2,
      ampRelease: 0.5,
    }
  },
  {
    name: 'OB-X Pulse Pad',
    type: 'synth',
    synthType: 'OBXd',
    volume: -10,
    pan: 0,
    effects: [],
    obxd: OBXD_PRESETS['Pulse Pad'],
  },
  {
    name: 'OB-X Sweep Pad',
    type: 'synth',
    synthType: 'OBXd',
    volume: -10,
    pan: 0,
    effects: [],
    obxd: {
      osc1Waveform: 0, // SAW
      osc2Waveform: 0, // SAW
      filterCutoff: 0.3,
      filterResonance: 0.5,
      lfoRate: 0.1,
      lfoFilterAmount: 0.4,
      ampAttack: 0.5,
      ampRelease: 0.8,
    }
  },

  // --- FX ---
  {
    name: 'OB-X S&H Sci-Fi',
    type: 'synth',
    synthType: 'OBXd',
    volume: -10,
    pan: 0,
    effects: [],
    obxd: {
      osc1Waveform: 1,
      lfoWaveform: 4, // SAMPLE_HOLD
      lfoRate: 0.7,
      lfoFilterAmount: 0.8,
      lfoOscAmount: 0.3,
      filterResonance: 0.7,
    }
  },
  {
    name: 'OB-X Init',
    type: 'synth',
    synthType: 'OBXd',
    volume: -10,
    pan: 0,
    effects: [],
    obxd: OBXD_PRESETS['Init'],
  },
];
