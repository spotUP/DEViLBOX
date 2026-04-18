import type { SynthPreset } from './types';
import type { DubSirenConfig } from '../../types/instrument';

// Note: "Classic Siren" and "Air Horn" previously lived here but duplicated
// the far richer DJ one-shot presets "Dub Siren" and "DJ Air Horn" in
// `djOneShotPresets.ts` (same oscillator/LFO/filter). They've been removed —
// pick the DJ one-shot versions for the full dub FX chain.
export const DUB_SIREN_PRESETS: SynthPreset[] = [
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
];

// ============================================
// SPACE LASER PRESETS
// ============================================

