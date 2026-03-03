import type { SynthPreset } from './types';
import type { SpaceLaserConfig } from '../../types/instrument';

export const SPACE_LASER_PRESETS: SynthPreset[] = [
  {
    id: 'laser-standard',
    name: 'Standard Zap',
    description: 'Classic electronic laser zap',
    category: 'fx',
    config: {
      laser: { startFreq: 4000, endFreq: 150, sweepTime: 150, sweepCurve: 'exponential' },
      fm: { amount: 30, ratio: 2.0 },
      filter: { type: 'bandpass', cutoff: 2000, resonance: 30 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-cosmic',
    name: 'Cosmic Burst',
    description: 'Deep space energy blast',
    category: 'fx',
    config: {
      laser: { startFreq: 8000, endFreq: 400, sweepTime: 300, sweepCurve: 'exponential' },
      fm: { amount: 60, ratio: 4.5 },
      delay: { enabled: true, time: 0.4, feedback: 0.7, wet: 0.5 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-anime',
    name: 'Anime Pew',
    description: 'Sharp vintage anime laser beam',
    category: 'fx',
    config: {
      laser: { startFreq: 6000, endFreq: 2000, sweepTime: 80, sweepCurve: 'exponential' },
      fm: { amount: 80, ratio: 8.0 },
      filter: { type: 'bandpass', cutoff: 4000, resonance: 60 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-dub',
    name: 'Dub Blaster',
    description: 'Heavy bassy dub sound system laser',
    category: 'fx',
    config: {
      laser: { startFreq: 1500, endFreq: 40, sweepTime: 500, sweepCurve: 'linear' },
      fm: { amount: 20, ratio: 1.5 },
      filter: { type: 'lowpass', cutoff: 800, resonance: 40 },
      delay: { enabled: true, time: 0.33, feedback: 0.6, wet: 0.6 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-arcade',
    name: 'Retro Arcade',
    description: '8-bit arcade style pulse zap',
    category: 'fx',
    config: {
      laser: { startFreq: 3000, endFreq: 100, sweepTime: 100, sweepCurve: 'exponential' },
      fm: { amount: 0, ratio: 1 },
      noise: { amount: 20, type: 'white' },
      filter: { type: 'lowpass', cutoff: 2000, resonance: 0 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-plasma',
    name: 'Plasma Gun',
    description: 'Grit-heavy plasma weapon discharge',
    category: 'fx',
    config: {
      laser: { startFreq: 5000, endFreq: 800, sweepTime: 200, sweepCurve: 'exponential' },
      fm: { amount: 90, ratio: 0.5 },
      noise: { amount: 30, type: 'pink' },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-ion',
    name: 'Ion Cannon',
    description: 'Long, powerful orbital beam',
    category: 'fx',
    config: {
      laser: { startFreq: 10000, endFreq: 20, sweepTime: 1200, sweepCurve: 'exponential' },
      fm: { amount: 50, ratio: 3.33 },
      reverb: { enabled: true, decay: 6.0, wet: 0.5 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-chirp',
    name: 'Alien Chirp',
    description: 'High-pitched extra-terrestrial communication',
    category: 'fx',
    config: {
      laser: { startFreq: 12000, endFreq: 6000, sweepTime: 50, sweepCurve: 'exponential' },
      fm: { amount: 70, ratio: 12.0 },
      filter: { type: 'highpass', cutoff: 5000, resonance: 20 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-teleport',
    name: 'Beam Up',
    description: 'Rising teleportation effect',
    category: 'fx',
    config: {
      laser: { startFreq: 100, endFreq: 8000, sweepTime: 800, sweepCurve: 'exponential' },
      fm: { amount: 40, ratio: 2.5 },
      filter: { type: 'bandpass', cutoff: 2000, resonance: 40 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-shield',
    name: 'Shield Hit',
    description: 'Metallic deflection sound',
    category: 'fx',
    config: {
      laser: { startFreq: 4000, endFreq: 3800, sweepTime: 40, sweepCurve: 'linear' },
      fm: { amount: 100, ratio: 1.61 },
      noise: { amount: 50, type: 'white' },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-torpedo',
    name: 'Photon Torpedo',
    description: 'Heavy explosive projectile',
    category: 'fx',
    config: {
      laser: { startFreq: 2000, endFreq: 50, sweepTime: 400, sweepCurve: 'exponential' },
      fm: { amount: 45, ratio: 0.75 },
      noise: { amount: 15, type: 'brown' },
      filter: { type: 'lowpass', cutoff: 1200, resonance: 20 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-bubble',
    name: 'Bubble Zap',
    description: 'Liquid-style underwater laser',
    category: 'fx',
    config: {
      laser: { startFreq: 3000, endFreq: 800, sweepTime: 120, sweepCurve: 'exponential' },
      fm: { amount: 10, ratio: 4.0 },
      filter: { type: 'bandpass', cutoff: 1500, resonance: 80 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-glitch',
    name: 'Glitch Beam',
    description: 'Malfunctioning digital weapon',
    category: 'fx',
    config: {
      laser: { startFreq: 7000, endFreq: 200, sweepTime: 60, sweepCurve: 'exponential' },
      fm: { amount: 100, ratio: 15.5 },
      noise: { amount: 80, type: 'white' },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-sub',
    name: 'Sub-Atomic',
    description: 'Low frequency vibration zap',
    category: 'fx',
    config: {
      laser: { startFreq: 400, endFreq: 20, sweepTime: 250, sweepCurve: 'linear' },
      fm: { amount: 20, ratio: 0.5 },
      filter: { type: 'lowpass', cutoff: 200, resonance: 10 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-hyper',
    name: 'Hyperdrive',
    description: 'Fast rising anime speed-up',
    category: 'fx',
    config: {
      laser: { startFreq: 800, endFreq: 12000, sweepTime: 1500, sweepCurve: 'exponential' },
      fm: { amount: 30, ratio: 1.0 },
      delay: { enabled: true, time: 0.1, feedback: 0.4, wet: 0.3 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-stun',
    name: 'Stun Gun',
    description: 'Quick paralyzing burst',
    category: 'fx',
    config: {
      laser: { startFreq: 5000, endFreq: 4500, sweepTime: 30, sweepCurve: 'linear' },
      fm: { amount: 60, ratio: 5.0 },
      filter: { type: 'bandpass', cutoff: 4800, resonance: 50 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-mega',
    name: 'Mega Blast',
    description: 'Maximum power anime destruction beam',
    category: 'fx',
    config: {
      laser: { startFreq: 9000, endFreq: 10, sweepTime: 2000, sweepCurve: 'exponential' },
      fm: { amount: 100, ratio: 2.2 },
      noise: { amount: 40, type: 'white' },
      delay: { enabled: true, time: 0.5, feedback: 0.8, wet: 0.7 },
      reverb: { enabled: true, decay: 8.0, wet: 0.6 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-ufo',
    name: 'UFO Sweep',
    description: 'Classic flying saucer sound',
    category: 'fx',
    config: {
      laser: { startFreq: 2000, endFreq: 2100, sweepTime: 500, sweepCurve: 'linear' },
      fm: { amount: 40, ratio: 1.0 },
      filter: { type: 'bandpass', cutoff: 2000, resonance: 90 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-droid',
    name: 'Droid Talk',
    description: 'Small robotic communication blip',
    category: 'fx',
    config: {
      laser: { startFreq: 4000, endFreq: 6000, sweepTime: 40, sweepCurve: 'exponential' },
      fm: { amount: 90, ratio: 7.2 },
      filter: { type: 'highpass', cutoff: 3000, resonance: 40 },
    } as Partial<SpaceLaserConfig>,
  },
  {
    id: 'laser-neutron',
    name: 'Neutron Star',
    description: 'Dense, heavy pulsating zap',
    category: 'fx',
    config: {
      laser: { startFreq: 1000, endFreq: 100, sweepTime: 800, sweepCurve: 'exponential' },
      fm: { amount: 100, ratio: 0.1 },
      filter: { type: 'lowpass', cutoff: 500, resonance: 60 },
    } as Partial<SpaceLaserConfig>,
  },
];

// ============================================
// POLYSYNTH PRESETS
// ============================================

