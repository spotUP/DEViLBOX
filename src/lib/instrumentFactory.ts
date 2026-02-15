/**
 * instrumentFactory.ts - Utility functions for creating default instruments
 */

import type { InstrumentConfig, TB303Config } from '@typedefs/instrument';
import { DEFAULT_TB303 } from '@/types/instrument';
import { DEFAULT_MODULAR_PATCH } from '@/types/modular';

/**
 * Creates a new TB-303 instrument with default settings
 */
export function createDefaultTB303Instrument(): InstrumentConfig {
  return {
    id: Date.now(), // Use timestamp as numeric ID (matches existing patterns)
    name: 'TB-303',
    type: 'synth',
    synthType: 'TB303',
    tb303: { ...DEFAULT_TB303 } as TB303Config,
    effects: [],
    volume: -6,
    pan: 0,
  };
}

/**
 * Creates a new Modular Synth instrument with default settings
 */
export function createDefaultModularSynthInstrument(): InstrumentConfig {
  return {
    id: Date.now(),
    name: 'Modular Synth',
    type: 'synth',
    synthType: 'ModularSynth',
    modularSynth: { ...DEFAULT_MODULAR_PATCH },
    effects: [],
    volume: -6,
    pan: 0,
  };
}
