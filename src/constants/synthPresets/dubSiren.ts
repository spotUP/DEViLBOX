import type { SynthPreset } from './types';
import type { DubSirenConfig } from '../../types/instrument';

export const DUB_SIREN_PRESETS: SynthPreset[] = [
  {
    id: 'dub-siren-classic',
    name: 'Classic Siren',
    description: 'Standard dub sound system siren',
    category: 'fx',
    config: {
      oscillator: { type: 'sine', frequency: 440 },
      lfo: { enabled: true, type: 'triangle', rate: 2, depth: 200 },
      delay: { enabled: true, time: 0.3, feedback: 0.4, wet: 0.3 },
    } as Partial<DubSirenConfig>,
  },
  {
    id: 'dub-siren-alert',
    name: 'Code Red',
    description: 'Fast emergency alert siren',
    category: 'fx',
    config: {
      oscillator: { type: 'square', frequency: 600 },
      lfo: { enabled: true, type: 'square', rate: 8, depth: 100 },
      reverb: { enabled: true, decay: 2.0, wet: 0.4 },
    } as Partial<DubSirenConfig>,
  },
  {
    id: 'dub-siren-space',
    name: 'Space Echo',
    description: 'Deep space echoing siren',
    category: 'fx',
    config: {
      oscillator: { type: 'sawtooth', frequency: 220 },
      lfo: { enabled: true, type: 'sine', rate: 0.5, depth: 50 },
      delay: { enabled: true, time: 0.4, feedback: 0.7, wet: 0.5 },
      filter: { enabled: true, type: 'highpass', frequency: 300 },
    } as Partial<DubSirenConfig>,
  },
  {
    id: 'dub-siren-horn',
    name: 'Air Horn',
    description: 'Punchy sound system air horn',
    category: 'fx',
    config: {
      oscillator: { type: 'sawtooth', frequency: 150 },
      lfo: { enabled: true, type: 'sawtooth', rate: 15, depth: 20 },
      delay: { enabled: true, time: 0.15, feedback: 0.2, wet: 0.2 },
      filter: { enabled: true, type: 'lowpass', frequency: 1200 },
    } as Partial<DubSirenConfig>,
  },
];

// ============================================
// SPACE LASER PRESETS
// ============================================

