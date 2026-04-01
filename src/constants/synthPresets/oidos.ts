import type { SynthPreset } from './types';
import type { OidosConfig } from '../../types/oidosInstrument';

const base: OidosConfig = {
  seed: 0.5, modes: 0.40, fat: 0.10, width: 0.34,
  overtones: 0.27, sharpness: 0.9, harmonicity: 1.0,
  decayLow: 1.0, decayHigh: 1.0,
  filterLow: 0.0, filterSlopeLow: 0.0, filterSweepLow: 0.5,
  filterHigh: 1.0, filterSlopeHigh: 0.0, filterSweepHigh: 0.5,
  gain: 0.25, attack: 0.25, release: 0.5,
  qDecayDiff: 0, qDecayLow: 0, qHarmonicity: 0, qSharpness: 0, qWidth: 0,
  qFilterLow: 0, qFilterSlopeLow: 0, qFilterSweepLow: 0,
  qFilterHigh: 0, qFilterSlopeHigh: 0, qFilterSweepHigh: 0,
  qGain: 0, qAttack: 0, qRelease: 0,
};

function patch(overrides: Partial<OidosConfig>): OidosConfig {
  return { ...base, ...overrides };
}

export const OIDOS_PRESETS: SynthPreset[] = [
  {
    id: 'oidos-init',
    name: 'Init',
    description: 'Default Oidos patch',
    category: 'pad',
    config: { synth: patch({}) },
  },
  {
    id: 'oidos-glass-pad',
    name: 'Glass Pad',
    description: 'Shimmering crystalline pad with harmonic overtones',
    category: 'pad',
    config: { synth: patch({ seed: 0.32, modes: 0.60, fat: 0.05, width: 0.15, overtones: 0.50, sharpness: 0.7, harmonicity: 1.0, decayLow: 0.9, decayHigh: 0.5, gain: 0.20, attack: 0.40, release: 0.70 }) },
  },
  {
    id: 'oidos-dark-drone',
    name: 'Dark Drone',
    description: 'Deep evolving bass drone with inharmonic partials',
    category: 'bass',
    config: { synth: patch({ seed: 0.78, modes: 0.80, fat: 0.30, width: 0.50, overtones: 0.15, sharpness: 0.95, harmonicity: 0.3, decayLow: 1.0, decayHigh: 0.2, filterHigh: 0.4, filterSlopeHigh: 0.3, gain: 0.35, attack: 0.50, release: 0.80 }) },
  },
  {
    id: 'oidos-bell',
    name: 'Crystal Bell',
    description: 'Bright bell with fast decay and many harmonics',
    category: 'key',
    config: { synth: patch({ seed: 0.15, modes: 0.45, fat: 0.02, width: 0.08, overtones: 0.70, sharpness: 0.5, harmonicity: 0.85, decayLow: 0.6, decayHigh: 0.3, gain: 0.30, attack: 0.0, release: 0.60 }) },
  },
  {
    id: 'oidos-organ',
    name: 'Additive Organ',
    description: 'Rich organ-like tone with pure harmonics',
    category: 'key',
    config: { synth: patch({ seed: 0.0, modes: 0.20, fat: 0.01, width: 0.0, overtones: 0.40, sharpness: 0.8, harmonicity: 1.0, decayLow: 1.0, decayHigh: 1.0, gain: 0.20, attack: 0.05, release: 0.15 }) },
  },
  {
    id: 'oidos-pluck',
    name: 'Pluck',
    description: 'Short plucked string with bright attack',
    category: 'pluck',
    config: { synth: patch({ seed: 0.42, modes: 0.35, fat: 0.08, width: 0.20, overtones: 0.55, sharpness: 0.6, harmonicity: 0.95, decayLow: 0.4, decayHigh: 0.15, filterHigh: 0.7, filterSweepHigh: 0.3, gain: 0.30, attack: 0.0, release: 0.25 }) },
  },
  {
    id: 'oidos-choir',
    name: 'Spectral Choir',
    description: 'Ethereal vocal-like pad with fat detuning',
    category: 'pad',
    config: { synth: patch({ seed: 0.65, modes: 0.50, fat: 0.25, width: 0.40, overtones: 0.35, sharpness: 0.85, harmonicity: 0.7, decayLow: 0.95, decayHigh: 0.6, filterLow: 0.2, filterSlopeLow: 0.2, gain: 0.22, attack: 0.55, release: 0.75 }) },
  },
  {
    id: 'oidos-sub-bass',
    name: 'Sub Bass',
    description: 'Deep fundamental bass with minimal harmonics',
    category: 'bass',
    config: { synth: patch({ seed: 0.10, modes: 0.15, fat: 0.03, width: 0.05, overtones: 0.05, sharpness: 1.0, harmonicity: 1.0, decayLow: 1.0, decayHigh: 0.1, filterHigh: 0.25, filterSlopeHigh: 0.5, gain: 0.40, attack: 0.02, release: 0.20 }) },
  },
  {
    id: 'oidos-metallic',
    name: 'Metallic Hit',
    description: 'Inharmonic metallic percussion sound',
    category: 'fx',
    config: { synth: patch({ seed: 0.88, modes: 0.70, fat: 0.15, width: 0.60, overtones: 0.80, sharpness: 0.3, harmonicity: 0.1, decayLow: 0.3, decayHigh: 0.5, gain: 0.25, attack: 0.0, release: 0.35 }) },
  },
  {
    id: 'oidos-sweep-lead',
    name: 'Sweep Lead',
    description: 'Bright lead with filter sweep animation',
    category: 'lead',
    config: { synth: patch({ seed: 0.22, modes: 0.30, fat: 0.12, width: 0.25, overtones: 0.45, sharpness: 0.75, harmonicity: 0.9, decayLow: 0.7, decayHigh: 0.4, filterLow: 0.3, filterSweepLow: 0.2, filterHigh: 0.6, filterSweepHigh: 0.7, gain: 0.28, attack: 0.05, release: 0.30 }) },
  },
  {
    id: 'oidos-ice',
    name: 'Ice Crystal',
    description: 'Frozen high-frequency shimmer',
    category: 'fx',
    config: { synth: patch({ seed: 0.55, modes: 0.25, fat: 0.20, width: 0.70, overtones: 0.90, sharpness: 0.4, harmonicity: 0.6, decayLow: 0.2, decayHigh: 0.8, filterLow: 0.5, filterSlopeLow: 0.4, gain: 0.18, attack: 0.10, release: 0.90 }) },
  },
  {
    id: 'oidos-warm-pad',
    name: 'Warm Pad',
    description: 'Soft warm evolving texture with slow attack',
    category: 'pad',
    config: { synth: patch({ seed: 0.40, modes: 0.55, fat: 0.18, width: 0.30, overtones: 0.20, sharpness: 0.95, harmonicity: 0.8, decayLow: 1.0, decayHigh: 0.7, filterHigh: 0.5, filterSlopeHigh: 0.2, gain: 0.22, attack: 0.65, release: 0.80 }) },
  },
  {
    id: 'oidos-harsh-lead',
    name: 'Harsh Lead',
    description: 'Aggressive distorted lead for demoscene intros',
    category: 'lead',
    config: { synth: patch({ seed: 0.73, modes: 0.45, fat: 0.08, width: 0.15, overtones: 0.60, sharpness: 0.5, harmonicity: 0.75, decayLow: 0.8, decayHigh: 0.6, gain: 0.40, attack: 0.0, release: 0.20 }) },
  },
  {
    id: 'oidos-string',
    name: 'Bowed String',
    description: 'String ensemble with slow attack and rich harmonics',
    category: 'string',
    config: { synth: patch({ seed: 0.28, modes: 0.50, fat: 0.22, width: 0.35, overtones: 0.30, sharpness: 0.85, harmonicity: 0.95, decayLow: 1.0, decayHigh: 0.8, gain: 0.20, attack: 0.50, release: 0.55 }) },
  },
  {
    id: 'oidos-noise-hit',
    name: 'Noise Hit',
    description: 'White noise burst with spectral shaping',
    category: 'drum',
    config: { synth: patch({ seed: 0.99, modes: 0.90, fat: 0.40, width: 0.90, overtones: 1.0, sharpness: 0.1, harmonicity: 0.0, decayLow: 0.15, decayHigh: 0.15, gain: 0.35, attack: 0.0, release: 0.10 }) },
  },
  {
    id: 'oidos-space',
    name: 'Deep Space',
    description: 'Vast atmospheric texture with slow filter sweep',
    category: 'pad',
    config: { synth: patch({ seed: 0.60, modes: 0.70, fat: 0.30, width: 0.55, overtones: 0.40, sharpness: 0.7, harmonicity: 0.5, decayLow: 1.0, decayHigh: 0.9, filterLow: 0.1, filterSweepLow: 0.3, filterHigh: 0.8, filterSweepHigh: 0.6, gain: 0.18, attack: 0.70, release: 0.95 }) },
  },
];
