import type { SynthPreset } from './types';

export const AM_SYNTH_PRESETS: SynthPreset[] = [
  {
    id: 'am-tremolo-pad',
    name: 'Tremolo Pad',
    description: 'Warm pad with gentle tremolo',
    category: 'pad',
    config: {
      oscillator: { type: 'sine' },
      harmonicity: 2,
      envelope: { attack: 0.6, decay: 1.5, sustain: 0.7, release: 1.8 },
      modulationEnvelope: { attack: 0.8, decay: 1.0, sustain: 0.5, release: 1.2 },
    },
  },
  {
    id: 'am-bright-lead',
    name: 'AM Lead',
    description: 'Bright amplitude-modulated lead',
    category: 'lead',
    config: {
      oscillator: { type: 'sawtooth' },
      harmonicity: 3,
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.2 },
      modulationEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.8, release: 0.15 },
    },
  },
  {
    id: 'am-ring-mod',
    name: 'Ring Mod',
    description: 'Inharmonic ring modulation tones',
    category: 'fx',
    config: {
      oscillator: { type: 'square' },
      harmonicity: 1.414,
      envelope: { attack: 0.005, decay: 0.4, sustain: 0.3, release: 0.3 },
      modulationEnvelope: { attack: 0.001, decay: 0.3, sustain: 0.7, release: 0.2 },
    },
  },
  {
    id: 'am-warm-keys',
    name: 'Warm Keys',
    description: 'Soft AM electric piano feel',
    category: 'key',
    config: {
      oscillator: { type: 'triangle' },
      harmonicity: 2,
      envelope: { attack: 0.01, decay: 0.8, sustain: 0.3, release: 0.6 },
      modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.4 },
    },
  },
  {
    id: 'am-shimmer-pad',
    name: 'Shimmer Pad',
    description: 'Evolving shimmering texture',
    category: 'pad',
    config: {
      oscillator: { type: 'sine' },
      harmonicity: 4,
      envelope: { attack: 1.0, decay: 2.0, sustain: 0.5, release: 2.5 },
      modulationEnvelope: { attack: 1.5, decay: 2.5, sustain: 0.3, release: 2.0 },
    },
  },
  {
    id: 'am-staccato',
    name: 'AM Staccato',
    description: 'Tight choppy rhythmic sound',
    category: 'lead',
    config: {
      oscillator: { type: 'square' },
      harmonicity: 1,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0.0, release: 0.05 },
      modulationEnvelope: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.03 },
    },
  },
  {
    id: 'am-glass-bell',
    name: 'Glass Bell',
    description: 'Delicate bell-like AM tone',
    category: 'key',
    config: {
      oscillator: { type: 'sine' },
      harmonicity: 5.07,
      envelope: { attack: 0.001, decay: 1.8, sustain: 0.0, release: 1.2 },
      modulationEnvelope: { attack: 0.001, decay: 1.0, sustain: 0.0, release: 0.8 },
    },
  },
  {
    id: 'am-thick-lead',
    name: 'Thick Lead',
    description: 'Full-bodied harmonically rich lead',
    category: 'lead',
    config: {
      oscillator: { type: 'sawtooth' },
      harmonicity: 1,
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.15 },
      modulationEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.9, release: 0.1 },
    },
  },
];
