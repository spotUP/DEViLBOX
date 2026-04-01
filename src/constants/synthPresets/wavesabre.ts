import type { SynthPreset } from './types';
import type { SlaughterConfig, FalconConfig } from '../../types/wavesabreInstrument';
import { DEFAULT_SLAUGHTER_CONFIG, DEFAULT_FALCON_CONFIG } from '../../types/wavesabreInstrument';

function slaughter(overrides: Partial<SlaughterConfig>): { slaughter: SlaughterConfig } {
  return { slaughter: { ...DEFAULT_SLAUGHTER_CONFIG, ...overrides } };
}

function falcon(overrides: Partial<FalconConfig>): { falcon: FalconConfig } {
  return { falcon: { ...DEFAULT_FALCON_CONFIG, ...overrides } };
}

export const WAVESABRE_SLAUGHTER_PRESETS: SynthPreset[] = [
  {
    id: 'ws-s-init',
    name: 'Init',
    description: 'Default Slaughter patch',
    category: 'lead',
    config: slaughter({}),
  },
  {
    id: 'ws-s-acid-bass',
    name: 'Acid Bass',
    description: 'Classic acid squelch bass line',
    category: 'bass',
    config: slaughter({ waveform: 0, cutoff: 0.25, resonance: 0.8, filterEnvAmount: 0.7, ampDecay: 0.2, ampSustain: 0.4, filterDecay: 0.15, filterSustain: 0.1 }),
  },
  {
    id: 'ws-s-dirty-lead',
    name: 'Dirty Lead',
    description: 'Aggressive saw lead with resonance',
    category: 'lead',
    config: slaughter({ waveform: 0, cutoff: 0.6, resonance: 0.5, filterEnvAmount: 0.3, ampAttack: 0.02, ampSustain: 0.8, ampRelease: 0.2, gain: 0.6 }),
  },
  {
    id: 'ws-s-pulse-pad',
    name: 'Pulse Pad',
    description: 'Warm pulse wave pad with slow attack',
    category: 'pad',
    config: slaughter({ waveform: 0.5, pulseWidth: 0.35, cutoff: 0.4, resonance: 0.15, filterEnvAmount: 0.2, ampAttack: 0.4, ampDecay: 0.5, ampSustain: 0.8, ampRelease: 0.5, voices: 0.375, detune: 0.15, spread: 0.7 }),
  },
  {
    id: 'ws-s-noise-hit',
    name: 'Noise Hit',
    description: 'Filtered noise percussion',
    category: 'drum',
    config: slaughter({ waveform: 1.0, cutoff: 0.6, resonance: 0.3, filterEnvAmount: 0.8, ampAttack: 0, ampDecay: 0.15, ampSustain: 0, ampRelease: 0.1, filterDecay: 0.1, filterSustain: 0 }),
  },
  {
    id: 'ws-s-screamer',
    name: 'Screamer',
    description: 'High-resonance aggressive lead',
    category: 'lead',
    config: slaughter({ waveform: 0, cutoff: 0.35, resonance: 0.9, filterEnvAmount: 0.6, ampSustain: 0.9, filterDecay: 0.3, filterSustain: 0.2, gain: 0.5 }),
  },
  {
    id: 'ws-s-sub',
    name: 'Deep Sub',
    description: 'Filtered sub bass',
    category: 'bass',
    config: slaughter({ waveform: 0.5, pulseWidth: 0.5, cutoff: 0.2, resonance: 0.1, filterEnvAmount: 0.1, ampSustain: 1.0, gain: 0.7 }),
  },
  {
    id: 'ws-s-pluck',
    name: 'Pluck',
    description: 'Short bright pluck sound',
    category: 'pluck',
    config: slaughter({ waveform: 0, cutoff: 0.7, resonance: 0.2, filterEnvAmount: 0.5, ampDecay: 0.2, ampSustain: 0, ampRelease: 0.15, filterDecay: 0.15, filterSustain: 0 }),
  },
];

export const WAVESABRE_FALCON_PRESETS: SynthPreset[] = [
  {
    id: 'ws-f-init',
    name: 'Init',
    description: 'Default Falcon patch',
    category: 'key',
    config: falcon({}),
  },
  {
    id: 'ws-f-electric-piano',
    name: 'FM Electric Piano',
    description: 'Classic FM e-piano',
    category: 'key',
    config: falcon({ osc1Waveform: 0, fmAmount: 0.35, fmCoarse: 0.125, feedback: 0.05, decay1: 0.5, sustain1: 0.3, release1: 0.4, decay2: 0.3, sustain2: 0.1 }),
  },
  {
    id: 'ws-f-bell',
    name: 'FM Bell',
    description: 'Bright metallic bell tone',
    category: 'key',
    config: falcon({ osc1Waveform: 0, fmAmount: 0.6, fmCoarse: 0.3125, feedback: 0.15, decay1: 0.7, sustain1: 0, release1: 0.5, decay2: 0.4, sustain2: 0 }),
  },
  {
    id: 'ws-f-bass',
    name: 'FM Bass',
    description: 'Punchy FM bass',
    category: 'bass',
    config: falcon({ osc1Waveform: 0, fmAmount: 0.5, fmCoarse: 0.0625, feedback: 0.2, osc1Coarse: 0.25, decay1: 0.3, sustain1: 0.5, release1: 0.15, decay2: 0.15, sustain2: 0.2 }),
  },
  {
    id: 'ws-f-organ',
    name: 'FM Organ',
    description: 'Hammond-style FM organ',
    category: 'key',
    config: falcon({ osc1Waveform: 0, fmAmount: 0.25, fmCoarse: 0.125, feedback: 0.0, sustain1: 0.8, sustain2: 0.7, release1: 0.1, release2: 0.1 }),
  },
  {
    id: 'ws-f-brass',
    name: 'FM Brass',
    description: 'Brassy FM stab',
    category: 'lead',
    config: falcon({ osc1Waveform: 0, fmAmount: 0.45, fmCoarse: 0.0625, feedback: 0.1, attack1: 0.05, decay1: 0.2, sustain1: 0.7, attack2: 0.03, decay2: 0.15, sustain2: 0.5, voices: 0.25, detune: 0.05, spread: 0.4 }),
  },
  {
    id: 'ws-f-glassy',
    name: 'Glassy',
    description: 'Clean glassy FM tones',
    category: 'pad',
    config: falcon({ osc1Waveform: 0, fmAmount: 0.2, fmCoarse: 0.1875, fmFine: 0.52, feedback: 0.0, attack1: 0.15, decay1: 0.4, sustain1: 0.6, release1: 0.5, voices: 0.375, detune: 0.12, spread: 0.6 }),
  },
  {
    id: 'ws-f-harsh-lead',
    name: 'Harsh Lead',
    description: 'Aggressive FM with high feedback',
    category: 'lead',
    config: falcon({ osc1Waveform: 0, fmAmount: 0.8, fmCoarse: 0.0625, feedback: 0.6, sustain1: 0.9, sustain2: 0.8, gain: 0.4 }),
  },
];
