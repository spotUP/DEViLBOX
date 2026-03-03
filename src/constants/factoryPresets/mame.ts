import type { InstrumentPreset } from '../../types/instrument';

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
  {
    type: 'synth' as const,
    name: 'CZ Brass 1',
    synthType: 'CZ101',
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'CZ Electric Piano',
    synthType: 'CZ101',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'CZ Synth Bass',
    synthType: 'CZ101',
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'CZ Digital Pad',
    synthType: 'CZ101',
    effects: [],
    volume: -10,
    pan: 0,
  },
];
