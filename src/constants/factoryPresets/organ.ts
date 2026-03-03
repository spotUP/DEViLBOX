import type { InstrumentPreset } from '../../types/instrument';

// ============================================================================
// ORGAN PRESETS (4) - Drawbar organ settings
// ============================================================================

export const ORGAN_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'Jazz Organ',
    synthType: 'Organ',
    organ: {
      drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: true, volume: 60, decay: 'fast', harmonic: 'third' },
      keyClick: 40,
      vibrato: { type: 'C3', depth: 60 },
      rotary: { enabled: true, speed: 'fast' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Gospel Organ',
    synthType: 'Organ',
    organ: {
      drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8],
      percussion: { enabled: false, volume: 50, decay: 'slow', harmonic: 'second' },
      keyClick: 20,
      vibrato: { type: 'V3', depth: 40 },
      rotary: { enabled: true, speed: 'slow' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Church Organ',
    synthType: 'Organ',
    organ: {
      drawbars: [8, 0, 8, 0, 8, 0, 0, 8, 8],
      percussion: { enabled: false, volume: 0, decay: 'fast', harmonic: 'third' },
      keyClick: 0,
      vibrato: { type: 'V1', depth: 20 },
      rotary: { enabled: false, speed: 'slow' },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Rock Organ',
    synthType: 'Organ',
    organ: {
      drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: false, volume: 0, decay: 'fast', harmonic: 'third' },
      keyClick: 80,
      vibrato: { type: 'C3', depth: 80 },
      rotary: { enabled: true, speed: 'fast' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
];
