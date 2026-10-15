import type { InstrumentPreset } from '../../types/instrument';
import { CZ101_PRESET_NAMES, cz101PresetParameters } from '../../engine/cz101/cz101Presets';

/** One factory preset per bank entry: the names and knob values come from the bank, not from here. */
const CZ101_FACTORY_PRESETS: InstrumentPreset['config'][] = CZ101_PRESET_NAMES.map((name, index) => ({
  type: 'synth' as const,
  name: `CZ ${name}`,
  synthType: 'CZ101' as const,
  parameters: { ...cz101PresetParameters(index), volume: 0.8 },
  effects: [],
  volume: -8,
  pan: 0,
}));

// ============================================================================
// MAME CLASSIC PRESETS (8) - Hardware-accurate classic synths
// ============================================================================

export const MAME_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'VFX Digital Pad',
    synthType: 'MAMEVFX',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'VFX Evolving',
    synthType: 'MAMEVFX',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'ESQ-1 Bass',
    synthType: 'MAMEDOC',
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'ESQ-1 Gritty Keys',
    synthType: 'MAMEDOC',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'MKS-20 E.Piano 1',
    synthType: 'MAMERSA',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'RD-1000 Grand',
    synthType: 'MAMERSA',
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'AWM2 Grand Piano',
    synthType: 'MAMESWP30',
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'AWM2 Synth Brass',
    synthType: 'MAMESWP30',
    effects: [],
    volume: -10,
    pan: 0,
  },
  ...CZ101_FACTORY_PRESETS,
];
