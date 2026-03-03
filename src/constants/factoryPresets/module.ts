import type { InstrumentPreset } from '../../types/instrument';

// ============================================================================
// TRACKER MODULE PRESETS (1)
// ============================================================================

export const MODULE_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'Generic Module',
    synthType: 'ChiptuneModule',
    effects: [],
    volume: -6,
    pan: 0,
  },
];
