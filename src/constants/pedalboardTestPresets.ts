/**
 * Test Presets for Neural Overdrive
 *
 * Simple presets to verify overdrive functionality
 */

import type { TB303Config } from '@typedefs/instrument';

/**
 * Test Preset 1: Single TS808 Overdrive
 */
export const TEST_PRESET_TS808: TB303Config = {
  oscillator: { type: 'sawtooth' },
  filter: { cutoff: 800, resonance: 70 },
  filterEnvelope: { envMod: 60, decay: 200 },
  accent: { amount: 60 },
  slide: { time: 60, mode: 'exponential' },
  overdrive: {
    amount: 60,
    modelIndex: 0, // TS808
    drive: 60,
    dryWet: 100,
  },
};

/**
 * Test Preset 2: Heavy Overdrive
 */
export const TEST_PRESET_HEAVY: TB303Config = {
  oscillator: { type: 'sawtooth' },
  filter: { cutoff: 1200, resonance: 80 },
  filterEnvelope: { envMod: 70, decay: 300 },
  accent: { amount: 80 },
  slide: { time: 60, mode: 'exponential' },
  overdrive: {
    amount: 80,
    modelIndex: 1, // ProCo RAT
    drive: 80,
    dryWet: 100,
  },
};

/**
 * Test Preset 3: Clean Amp
 */
export const TEST_PRESET_CLEAN: TB303Config = {
  oscillator: { type: 'sawtooth' },
  filter: { cutoff: 600, resonance: 60 },
  filterEnvelope: { envMod: 50, decay: 180 },
  accent: { amount: 50 },
  slide: { time: 60, mode: 'exponential' },
  overdrive: {
    amount: 30,
    modelIndex: 8, // Fender Princeton Clean
    drive: 30,
    dryWet: 100,
  },
};

/**
 * Test Preset 4: No Overdrive
 */
export const TEST_PRESET_NO_EFFECTS: TB303Config = {
  oscillator: { type: 'sawtooth' },
  filter: { cutoff: 800, resonance: 70 },
  filterEnvelope: { envMod: 60, decay: 200 },
  accent: { amount: 60 },
  slide: { time: 60, mode: 'exponential' },
  overdrive: {
    amount: 0,
  },
};

/**
 * All test presets
 */
export const OVERDRIVE_TEST_PRESETS = {
  'Single TS808': TEST_PRESET_TS808,
  'Heavy (RAT)': TEST_PRESET_HEAVY,
  'Clean (Princeton)': TEST_PRESET_CLEAN,
  'No Overdrive': TEST_PRESET_NO_EFFECTS,
};
