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
  {
    id: 'dub-siren-submarine',
    name: 'Submarine Ping',
    description: 'Low sine sweep with long delay tail — sonar from the deep',
    category: 'fx',
    config: {
      oscillator: { type: 'sine', frequency: 120 },
      lfo: { enabled: true, type: 'sine', rate: 0.15, depth: 80 },
      delay: { enabled: true, time: 0.8, feedback: 0.65, wet: 0.6 },
      reverb: { enabled: true, decay: 4.0, wet: 0.5 },
    } as Partial<DubSirenConfig>,
  },
  {
    id: 'dub-siren-police',
    name: 'Police Wail',
    description: 'Dual-tone alternating — classic wail pattern',
    category: 'fx',
    config: {
      oscillator: { type: 'sine', frequency: 500 },
      lfo: { enabled: true, type: 'square', rate: 1.5, depth: 200 },
      reverb: { enabled: true, decay: 1.5, wet: 0.3 },
    } as Partial<DubSirenConfig>,
  },
  {
    id: 'dub-siren-ambulance',
    name: 'Ambulance Warble',
    description: 'Rapid warble with square wave — urgent and insistent',
    category: 'fx',
    config: {
      oscillator: { type: 'square', frequency: 700 },
      lfo: { enabled: true, type: 'sine', rate: 6, depth: 150 },
      filter: { enabled: true, type: 'lowpass', frequency: 3000 },
    } as Partial<DubSirenConfig>,
  },
  {
    id: 'dub-siren-cosmic',
    name: 'Cosmic Ray',
    description: 'High-frequency descending sweep — sci-fi laser from space',
    category: 'fx',
    config: {
      oscillator: { type: 'sawtooth', frequency: 900 },
      lfo: { enabled: true, type: 'sawtooth', rate: 0.3, depth: 600 },
      delay: { enabled: true, time: 0.25, feedback: 0.5, wet: 0.4 },
      reverb: { enabled: true, decay: 3.0, wet: 0.6 },
    } as Partial<DubSirenConfig>,
  },
  {
    id: 'dub-siren-foghorn',
    name: 'Foghorn',
    description: 'Very low sawtooth with slow LFO — harbor at midnight',
    category: 'fx',
    config: {
      oscillator: { type: 'sawtooth', frequency: 65 },
      lfo: { enabled: true, type: 'sine', rate: 0.08, depth: 20 },
      filter: { enabled: true, type: 'lowpass', frequency: 800 },
      reverb: { enabled: true, decay: 5.0, wet: 0.4 },
    } as Partial<DubSirenConfig>,
  },
  {
    id: 'dub-siren-laser',
    name: 'Laser Sweep',
    description: 'Extreme chorus rate + depth — from Interruptor Dub Scrolls',
    category: 'fx',
    config: {
      oscillator: { type: 'square', frequency: 440 },
      lfo: { enabled: true, type: 'triangle', rate: 15, depth: 400 },
      delay: { enabled: true, time: 0.05, feedback: 0.3, wet: 0.3 },
    } as Partial<DubSirenConfig>,
  },
  {
    id: 'dub-siren-dubplate',
    name: 'Dub Plate Special',
    description: 'The classic sound system dub plate siren — low and heavy',
    category: 'fx',
    config: {
      oscillator: { type: 'sine', frequency: 180 },
      lfo: { enabled: true, type: 'sine', rate: 2.0, depth: 120 },
      delay: { enabled: true, time: 0.35, feedback: 0.55, wet: 0.45 },
      reverb: { enabled: true, decay: 2.5, wet: 0.35 },
      filter: { enabled: true, type: 'lowpass', frequency: 2000 },
    } as Partial<DubSirenConfig>,
  },
];

// ============================================
// SPACE LASER PRESETS
// ============================================

