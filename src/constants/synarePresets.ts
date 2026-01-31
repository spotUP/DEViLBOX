import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_SYNARE } from '@typedefs/instrument';

// Classic Disco Tom
export const SYNARE_DISCO_TOM: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Disco Tom',
  synthType: 'Synare',
  synare: {
    ...DEFAULT_SYNARE,
    oscillator: { type: 'square', tune: 150, fine: 0 },
    sweep: { enabled: true, amount: 24, time: 200 },
    envelope: { decay: 400, sustain: 0 },
    noise: { enabled: false, type: 'white', mix: 0, color: 100 },
  },
  effects: [],
  volume: -8,
  pan: 0,
};

// Dub Percussion (Short, resonant)
export const SYNARE_DUB_PERC: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Dub Perc',
  synthType: 'Synare',
  synare: {
    ...DEFAULT_SYNARE,
    oscillator: { type: 'square', tune: 80, fine: 0 },
    sweep: { enabled: true, amount: 12, time: 100 },
    filter: { cutoff: 400, resonance: 85, envMod: 80, decay: 150 },
    envelope: { decay: 200, sustain: 0 },
    noise: { enabled: true, type: 'white', mix: 0.1, color: 50 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// Gritty Snare
export const SYNARE_SNARE: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Synare Snare',
  synthType: 'Synare',
  synare: {
    ...DEFAULT_SYNARE,
    oscillator: { type: 'square', tune: 220, fine: 0 },
    noise: { enabled: true, type: 'white', mix: 0.6, color: 80 },
    filter: { cutoff: 2000, resonance: 30, envMod: 40, decay: 100 },
    envelope: { decay: 150, sustain: 0 },
    sweep: { enabled: false, amount: 0, time: 0 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// Sci-Fi Zap
export const SYNARE_ZAP: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Space Zap',
  synthType: 'Synare',
  synare: {
    ...DEFAULT_SYNARE,
    oscillator: { type: 'square', tune: 600, fine: 0 },
    sweep: { enabled: true, amount: 48, time: 300 },
    lfo: { enabled: true, rate: 12, depth: 50, target: 'pitch' },
    envelope: { decay: 500, sustain: 0 },
  },
  effects: [],
  volume: -12,
  pan: 0,
};

export const SYNARE_PRESETS = [
  SYNARE_DISCO_TOM,
  SYNARE_DUB_PERC,
  SYNARE_SNARE,
  SYNARE_ZAP,
];
