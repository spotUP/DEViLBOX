/**
 * JUCE WASM Synth Factory Presets
 * Presets for Dexed (DX7) and OB-Xd (Oberheim OB-X)
 */

import type { InstrumentPreset } from '@typedefs/instrument';
import { OBXD_PRESETS } from '../engine/obxd/OBXdSynth';
import { DX7_VCED_PRESETS } from '../engine/dexed/dx7presets';

/**
 * Dexed (DX7) factory presets — all use native VCED patch loading
 * Each preset loads a 156-byte VCED patch directly into the engine via loadSysEx
 */
export const DEXED_FACTORY_PRESETS: InstrumentPreset['config'][] = DX7_VCED_PRESETS.map(preset => ({
  name: `DX7 ${preset.name}`,
  type: 'synth' as const,
  synthType: 'Dexed',
  volume: -10,
  pan: 0,
  effects: [],
  dexed: {},
  dexedVcedPreset: preset.name,
}));

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
