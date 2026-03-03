import type { SynthPreset } from './types';
import type { TB303Config } from '../../types/instrument';

export const TB303_PRESETS: SynthPreset[] = [
  {
    id: 'tb303-squelch',
    name: 'Classic Squelch',
    description: 'The iconic acid sound with resonant filter sweep',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 800, resonance: 85 },
      filterEnvelope: { envMod: 80, decay: 300 },
      accent: { amount: 70 },
      slide: { time: 60, mode: 'exponential' },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-devilfish',
    name: 'Devil Fish',
    description: 'Extended range with Robin Whittle mod character',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 600, resonance: 90 },
      filterEnvelope: { envMod: 100, decay: 200 },
      devilFish: { enabled: true, highResonance: true, filterTracking: 150 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-bubbling',
    name: 'Bubbling Bass',
    description: 'Fast decay with resonant bubbles',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 500, resonance: 75 },
      filterEnvelope: { envMod: 90, decay: 150 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-square-bass',
    name: 'Square Throb',
    description: 'Hollow square wave bass',
    category: 'bass',
    config: {
      oscillator: { type: 'square' },
      filter: { cutoff: 1200, resonance: 40 },
      filterEnvelope: { envMod: 50, decay: 400 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-screamer',
    name: 'Screamer',
    description: 'Self-oscillating filter scream',
    category: 'lead',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 2000, resonance: 95 },
      filterEnvelope: { envMod: 70, decay: 500 },
      devilFish: { enabled: true, highResonance: true },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-rubber',
    name: 'Rubber Bass',
    description: 'Bouncy low-end with slow filter',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 400, resonance: 60 },
      filterEnvelope: { envMod: 60, decay: 800 },
      slide: { time: 120, mode: 'exponential' },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-dirty',
    name: 'Dirty Acid',
    description: 'Heavy distortion with filter growl',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 700, resonance: 80 },
      filterEnvelope: { envMod: 85, decay: 250 },
      overdrive: { amount: 70 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-subtle',
    name: 'Subtle Sub',
    description: 'Deep sub-bass with minimal filter',
    category: 'bass',
    config: {
      oscillator: { type: 'square' },
      filter: { cutoff: 300, resonance: 20 },
      filterEnvelope: { envMod: 20, decay: 600 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-psychedelic',
    name: 'Psychedelic',
    description: 'Trippy slow sweep with high resonance',
    category: 'lead',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 1500, resonance: 88 },
      filterEnvelope: { envMod: 95, decay: 1200 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-stab',
    name: 'Acid Stab',
    description: 'Sharp attack for staccato lines',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 1800, resonance: 70 },
      filterEnvelope: { envMod: 75, decay: 100 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-hardfloor',
    name: 'Hardfloor',
    description: 'Classic hardfloor acid style',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 900, resonance: 82 },
      filterEnvelope: { envMod: 88, decay: 280 },
      accent: { amount: 80 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-phuture',
    name: 'Phuture',
    description: 'Acid Tracks tribute sound',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 750, resonance: 78 },
      filterEnvelope: { envMod: 82, decay: 350 },
      slide: { time: 80, mode: 'exponential' },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-talking',
    name: 'Talking Bass',
    description: 'Vowel-like filter movement',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 1100, resonance: 85 },
      filterEnvelope: { envMod: 70, decay: 450 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-minimal',
    name: 'Minimal Techno',
    description: 'Clean, tight bass for minimal',
    category: 'bass',
    config: {
      oscillator: { type: 'square' },
      filter: { cutoff: 600, resonance: 45 },
      filterEnvelope: { envMod: 40, decay: 200 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-wobble',
    name: 'Wobble Bass',
    description: 'Proto-dubstep wobbly bass',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 500, resonance: 70 },
      filterEnvelope: { envMod: 65, decay: 600 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-uk-hard',
    name: 'UK Hardcore',
    description: 'Fast decay for breakbeat acid',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 1200, resonance: 75 },
      filterEnvelope: { envMod: 80, decay: 120 },
      accent: { amount: 85 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-goa',
    name: 'Goa Acid',
    description: 'Psychedelic trance acid',
    category: 'lead',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 2200, resonance: 80 },
      filterEnvelope: { envMod: 90, decay: 400 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-electro',
    name: 'Electro Bass',
    description: 'Punchy electro-style bass',
    category: 'bass',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 800, resonance: 55 },
      filterEnvelope: { envMod: 55, decay: 180 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-dark',
    name: 'Dark Matter',
    description: 'Very low, ominous bass',
    category: 'bass',
    config: {
      oscillator: { type: 'square' },
      filter: { cutoff: 250, resonance: 30 },
      filterEnvelope: { envMod: 25, decay: 700 },
    } as Partial<TB303Config>,
  },
  {
    id: 'tb303-resonant-lead',
    name: 'Resonant Lead',
    description: 'High-pitched screaming lead',
    category: 'lead',
    config: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 3000, resonance: 92 },
      filterEnvelope: { envMod: 60, decay: 350 },
    } as Partial<TB303Config>,
  },
];

// ============================================
// CHIPSYNTH PRESETS (8-bit / Chiptune)
// ============================================

