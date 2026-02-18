/**
 * instrumentFactory.ts - Utility functions for creating default instruments
 */

import type { InstrumentConfig, TB303Config } from '@typedefs/instrument';
import { DEFAULT_TB303 } from '@/types/instrument';
import { DEFAULT_MODULAR_PATCH } from '@/types/modular';
import { useInstrumentStore } from '@stores/useInstrumentStore';

/** Find next available instrument ID in 1-128 range */
function findNextAvailableId(existingIds: number[]): number {
  for (let id = 1; id <= 128; id++) {
    if (!existingIds.includes(id)) return id;
  }
  return 1;
}

/**
 * Creates a new TB-303 instrument with default settings
 */
export function createDefaultTB303Instrument(): InstrumentConfig {
  const existingIds = useInstrumentStore.getState().instruments.map(i => i.id);
  const nextId = findNextAvailableId(existingIds);
  return {
    id: nextId,
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
  const existingIds = useInstrumentStore.getState().instruments.map(i => i.id);
  const nextId = findNextAvailableId(existingIds);
  return {
    id: nextId,
    name: 'Modular Synth',
    type: 'synth',
    synthType: 'ModularSynth',
    modularSynth: { ...DEFAULT_MODULAR_PATCH },
    effects: [],
    volume: -6,
    pan: 0,
  };
}
