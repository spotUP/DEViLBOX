/**
 * Makk M4 Wavetable Presets
 * Authentic presets for the Makk M4 Buzzmachine synth.
 * Uses wave index selection to demonstrate the 100+ internal waveforms.
 */

import type { InstrumentPreset } from '@typedefs/instrument';

export const MAKK_FACTORY_PRESETS: InstrumentPreset['config'][] = [
  // --- BASS ---
  {
    name: 'M4 Deep Bass',
    type: 'synth',
    synthType: 'BuzzM4',
    volume: -8,
    pan: 0,
    effects: [],
    parameters: {
      0: 1,  // Wave 1: BASS01
      1: 64, // Mix
      2: 32, // Cutoff
      3: 80, // Resonance
    }
  },
  {
    name: 'M4 Sub Bass',
    type: 'synth',
    synthType: 'BuzzM4',
    volume: -6,
    pan: 0,
    effects: [],
    parameters: {
      0: 5,  // Wave 1: BASS05
      1: 0,  // Osc 1 only
      2: 20, // Low Cutoff
    }
  },
  {
    name: 'M4 Rezzy Growl',
    type: 'synth',
    synthType: 'BuzzM4',
    volume: -10,
    pan: 0,
    effects: [],
    parameters: {
      0: 13, // Wave 1: BASS13
      1: 127, // Osc 2 only (implicit)
      2: 45,
      3: 110,
    }
  },

  // --- LEADS ---
  {
    name: 'M4 Sharp Saw',
    type: 'synth',
    synthType: 'BuzzM4',
    volume: -10,
    pan: 0,
    effects: [],
    parameters: {
      0: 20, // Wave 1: SAW01
      1: 64,
      2: 100,
      3: 20,
    }
  },
  {
    name: 'M4 Digi Lead',
    type: 'synth',
    synthType: 'BuzzM4',
    volume: -10,
    pan: 0,
    effects: [],
    parameters: {
      0: 45, // Wave 1: SYNTH05
      1: 80,
      2: 120,
    }
  },
  {
    name: 'M4 Sync Lead',
    type: 'synth',
    synthType: 'BuzzM4',
    volume: -12,
    pan: 0,
    effects: [],
    parameters: {
      0: 30, // Wave 1: SAW10
      1: 64,
      4: 12, // Transpose Osc 2
    }
  },

  // --- PADS & TEXTURES ---
  {
    name: 'M4 Soft Pad',
    type: 'synth',
    synthType: 'BuzzM4',
    volume: -12,
    pan: 0,
    effects: [],
    parameters: {
      0: 60, // Wave 1: SYNTH20
      1: 64,
      2: 60,
      3: 10,
    }
  },
  {
    name: 'M4 Metallic Text',
    type: 'synth',
    synthType: 'BuzzM4',
    volume: -14,
    pan: 0,
    effects: [],
    parameters: {
      0: 85, // Wave 1: HARD05
      1: 100,
      2: 80,
      3: 90,
    }
  },
];
