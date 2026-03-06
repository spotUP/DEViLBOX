import type { SynthPreset } from './types';

export const MONO_SYNTH_PRESETS: SynthPreset[] = [
  {
    id: 'mono-acid-bass',
    name: 'Acid Bass',
    description: 'Squelchy resonant acid line',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.1 },
      filter: { type: 'lowpass', frequency: 800, Q: 12 },
      filterEnvelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.2, baseFrequency: 200, octaves: 4 },
    },
  },
  {
    id: 'mono-sub-bass',
    name: 'Sub Bass',
    description: 'Deep sine sub bass',
    category: 'bass',
    config: {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.3 },
      filter: { type: 'lowpass', frequency: 400, Q: 1 },
      filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.3, baseFrequency: 100, octaves: 1 },
    },
  },
  {
    id: 'mono-reese-bass',
    name: 'Reese Bass',
    description: 'Dark detuned DnB bass',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.2 },
      filter: { type: 'lowpass', frequency: 1200, Q: 4 },
      filterEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.3, release: 0.3, baseFrequency: 150, octaves: 3 },
    },
  },
  {
    id: 'mono-plucky-lead',
    name: 'Plucky Lead',
    description: 'Short percussive pluck lead',
    category: 'lead',
    config: {
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.05 },
      filter: { type: 'lowpass', frequency: 3000, Q: 6 },
      filterEnvelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.1, baseFrequency: 500, octaves: 5 },
    },
  },
  {
    id: 'mono-squelchy-lead',
    name: 'Squelchy Lead',
    description: 'High resonance filter sweep lead',
    category: 'lead',
    config: {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.15 },
      filter: { type: 'lowpass', frequency: 1500, Q: 15 },
      filterEnvelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.2, baseFrequency: 300, octaves: 5 },
    },
  },
  {
    id: 'mono-warm-bass',
    name: 'Warm Bass',
    description: 'Smooth moog-style bass',
    category: 'bass',
    config: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.2 },
      filter: { type: 'lowpass', frequency: 600, Q: 3 },
      filterEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.4, release: 0.3, baseFrequency: 100, octaves: 2 },
    },
  },
  {
    id: 'mono-buzzy-lead',
    name: 'Buzzy Lead',
    description: 'Bright buzzy square lead',
    category: 'lead',
    config: {
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.2 },
      filter: { type: 'lowpass', frequency: 4000, Q: 8 },
      filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.2, baseFrequency: 800, octaves: 3 },
    },
  },
  {
    id: 'mono-screamer',
    name: 'Screamer',
    description: 'Aggressive high-resonance screaming lead',
    category: 'lead',
    config: {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.002, decay: 0.1, sustain: 0.9, release: 0.1 },
      filter: { type: 'lowpass', frequency: 2000, Q: 18 },
      filterEnvelope: { attack: 0.002, decay: 0.6, sustain: 0.4, release: 0.15, baseFrequency: 400, octaves: 6 },
    },
  },
  {
    id: 'mono-rubber-bass',
    name: 'Rubber Bass',
    description: 'Bouncy filter envelope bass',
    category: 'bass',
    config: {
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.15 },
      filter: { type: 'lowpass', frequency: 500, Q: 10 },
      filterEnvelope: { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1, baseFrequency: 100, octaves: 5 },
    },
  },
];
