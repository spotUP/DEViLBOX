/**
 * instrumentFactory.ts - Utility functions for creating default instruments
 */

import type { InstrumentConfig, TB303Config } from '@typedefs/instrument';
import { DEFAULT_TB303 } from '@/types/instrument';

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
