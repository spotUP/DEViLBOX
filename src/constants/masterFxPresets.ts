/**
 * Master Effects Presets
 * Pre-configured effect chains for common mixing scenarios
 */

import type { EffectConfig } from '@typedefs/instrument';

export interface MasterFxPreset {
  name: string;
  description: string;
  category: 'Clean' | 'Club' | 'Lo-Fi' | 'Ambient' | 'Aggressive';
  effects: Omit<EffectConfig, 'id'>[];
}

export const MASTER_FX_PRESETS: MasterFxPreset[] = [
  // === CLEAN ===
  {
    name: 'Clean Master',
    description: 'Subtle compression and EQ for polished output',
    category: 'Clean',
    effects: [
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -18, ratio: 3, attack: 0.01, release: 0.2 },
      },
      {
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 1, mid: 0, high: 0.5 },
      },
    ],
  },
  {
    name: 'Transparent',
    description: 'Very light processing, preserves dynamics',
    category: 'Clean',
    effects: [
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -12, ratio: 2, attack: 0.02, release: 0.3 },
      },
    ],
  },
  {
    name: 'Stereo Wide',
    description: 'Clean stereo enhancement for wider soundstage',
    category: 'Clean',
    effects: [
      {
        type: 'StereoWidener',
        enabled: true,
        wet: 100,
        parameters: { width: 0.7 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -15, ratio: 2.5, attack: 0.015, release: 0.25 },
      },
    ],
  },

  // === CLUB ===
  {
    name: 'Club Ready',
    description: 'Punchy compression with subs, ready for the dancefloor',
    category: 'Club',
    effects: [
      {
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 3, mid: -1, high: 2 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -15, ratio: 4, attack: 0.005, release: 0.15 },
      },
    ],
  },
  {
    name: 'Techno Master',
    description: 'Hard compression and subs for driving techno',
    category: 'Club',
    effects: [
      {
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 4, mid: -2, high: 1 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -12, ratio: 5, attack: 0.003, release: 0.1 },
      },
      {
        type: 'Distortion',
        enabled: true,
        wet: 15,
        parameters: { distortion: 0.15 },
      },
    ],
  },
  {
    name: 'Acid House',
    description: 'Warm compression with subtle room reverb',
    category: 'Club',
    effects: [
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -18, ratio: 3.5, attack: 0.01, release: 0.2 },
      },
      {
        type: 'Reverb',
        enabled: true,
        wet: 12,
        parameters: { decay: 1.5, preDelay: 0.01 },
      },
      {
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 2, mid: 0, high: 1 },
      },
    ],
  },
  {
    name: 'Deep House',
    description: 'Smooth and warm with controlled dynamics',
    category: 'Club',
    effects: [
      {
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 2, mid: 1, high: -1 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -20, ratio: 2.5, attack: 0.02, release: 0.3 },
      },
      {
        type: 'Chorus',
        enabled: true,
        wet: 15,
        parameters: { frequency: 0.5, depth: 0.3 },
      },
    ],
  },

  // === LO-FI ===
  {
    name: 'Lo-Fi Crunch',
    description: 'Bit-crushed and filtered for retro vibes',
    category: 'Lo-Fi',
    effects: [
      {
        type: 'BitCrusher',
        enabled: true,
        wet: 40,
        parameters: { bits: 8 },
      },
      {
        type: 'Filter',
        enabled: true,
        wet: 100,
        parameters: { frequency: 8000, type: 'lowpass', Q: 1 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -15, ratio: 4, attack: 0.01, release: 0.2 },
      },
    ],
  },
  {
    name: 'Tape Warmth',
    description: 'Subtle saturation and filtering like vintage tape',
    category: 'Lo-Fi',
    effects: [
      {
        type: 'Distortion',
        enabled: true,
        wet: 20,
        parameters: { distortion: 0.2 },
      },
      {
        type: 'Filter',
        enabled: true,
        wet: 100,
        parameters: { frequency: 12000, type: 'lowpass', Q: 0.7 },
      },
      {
        type: 'Chorus',
        enabled: true,
        wet: 8,
        parameters: { frequency: 0.2, depth: 0.15 },
      },
    ],
  },
  {
    name: 'VHS Vibe',
    description: 'Wobbly and degraded like old VHS audio',
    category: 'Lo-Fi',
    effects: [
      {
        type: 'BitCrusher',
        enabled: true,
        wet: 25,
        parameters: { bits: 12 },
      },
      {
        type: 'Vibrato',
        enabled: true,
        wet: 30,
        parameters: { frequency: 4, depth: 0.08 },
      },
      {
        type: 'Filter',
        enabled: true,
        wet: 100,
        parameters: { frequency: 6000, type: 'lowpass', Q: 0.5 },
      },
      {
        type: 'Reverb',
        enabled: true,
        wet: 15,
        parameters: { decay: 1.2, preDelay: 0.02 },
      },
    ],
  },

  // === AMBIENT ===
  {
    name: 'Ambient Space',
    description: 'Lush reverb and delay for atmospheric soundscapes',
    category: 'Ambient',
    effects: [
      {
        type: 'Reverb',
        enabled: true,
        wet: 45,
        parameters: { decay: 5, preDelay: 0.05 },
      },
      {
        type: 'PingPongDelay',
        enabled: true,
        wet: 30,
        parameters: { delayTime: 0.4, feedback: 0.5 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -20, ratio: 2, attack: 0.05, release: 0.4 },
      },
    ],
  },
  {
    name: 'Dreamy Haze',
    description: 'Soft and floaty with modulated delays',
    category: 'Ambient',
    effects: [
      {
        type: 'Chorus',
        enabled: true,
        wet: 35,
        parameters: { frequency: 0.3, depth: 0.5 },
      },
      {
        type: 'Reverb',
        enabled: true,
        wet: 55,
        parameters: { decay: 6, preDelay: 0.08 },
      },
      {
        type: 'Filter',
        enabled: true,
        wet: 100,
        parameters: { frequency: 5000, type: 'lowpass', Q: 0.5 },
      },
    ],
  },
  {
    name: 'Cathedral',
    description: 'Massive reverb for epic, cavernous sound',
    category: 'Ambient',
    effects: [
      {
        type: 'JCReverb',
        enabled: true,
        wet: 60,
        parameters: { roomSize: 0.9 },
      },
      {
        type: 'Delay',
        enabled: true,
        wet: 20,
        parameters: { delayTime: 0.25, feedback: 0.3 },
      },
    ],
  },
  {
    name: 'Underwater',
    description: 'Filtered and submerged atmospheric effect',
    category: 'Ambient',
    effects: [
      {
        type: 'Filter',
        enabled: true,
        wet: 100,
        parameters: { frequency: 1200, type: 'lowpass', Q: 2 },
      },
      {
        type: 'Chorus',
        enabled: true,
        wet: 40,
        parameters: { frequency: 0.4, depth: 0.6 },
      },
      {
        type: 'Reverb',
        enabled: true,
        wet: 50,
        parameters: { decay: 4, preDelay: 0.03 },
      },
    ],
  },

  // === AGGRESSIVE ===
  {
    name: 'Industrial',
    description: 'Harsh distortion and compression for aggressive sound',
    category: 'Aggressive',
    effects: [
      {
        type: 'Distortion',
        enabled: true,
        wet: 45,
        parameters: { distortion: 0.6 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -10, ratio: 8, attack: 0.001, release: 0.08 },
      },
      {
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 3, mid: 2, high: 4 },
      },
    ],
  },
  {
    name: 'Crushed',
    description: 'Heavy bit-crushing and distortion',
    category: 'Aggressive',
    effects: [
      {
        type: 'BitCrusher',
        enabled: true,
        wet: 60,
        parameters: { bits: 6 },
      },
      {
        type: 'Distortion',
        enabled: true,
        wet: 35,
        parameters: { distortion: 0.5 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -8, ratio: 10, attack: 0.001, release: 0.05 },
      },
    ],
  },
  {
    name: 'Hardstyle',
    description: 'Punchy kick-focused processing for hard dance',
    category: 'Aggressive',
    effects: [
      {
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 5, mid: -1, high: 3 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -10, ratio: 6, attack: 0.002, release: 0.08 },
      },
      {
        type: 'Distortion',
        enabled: true,
        wet: 20,
        parameters: { distortion: 0.3 },
      },
    ],
  },
  {
    name: 'Gabber',
    description: 'Extreme compression and saturation for hardcore',
    category: 'Aggressive',
    effects: [
      {
        type: 'Chebyshev',
        enabled: true,
        wet: 50,
        parameters: { order: 8 },
      },
      {
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -6, ratio: 20, attack: 0.0005, release: 0.03 },
      },
      {
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 6, mid: 0, high: 5 },
      },
    ],
  },
];
