import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_SPACE_LASER } from '@typedefs/instrument';

// Standard Zap
export const SPACE_LASER_STANDARD: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Standard Zap',
  synthType: 'SpaceLaser',
  spaceLaser: {
    ...DEFAULT_SPACE_LASER,
    laser: { startFreq: 4000, endFreq: 150, sweepTime: 150, sweepCurve: 'exponential' },
    fm: { amount: 30, ratio: 2.0 },
    noise: { amount: 5, type: 'white' },
    filter: { type: 'bandpass', cutoff: 2000, resonance: 30 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// Cosmic Burst
export const SPACE_LASER_COSMIC: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Cosmic Burst',
  synthType: 'SpaceLaser',
  spaceLaser: {
    ...DEFAULT_SPACE_LASER,
    laser: { startFreq: 8000, endFreq: 400, sweepTime: 300, sweepCurve: 'exponential' },
    fm: { amount: 60, ratio: 4.5 },
    noise: { amount: 20, type: 'pink' },
    filter: { type: 'highpass', cutoff: 1000, resonance: 50 },
    delay: { enabled: true, time: 0.4, feedback: 0.7, wet: 0.5 },
    reverb: { enabled: true, decay: 4.0, wet: 0.4 },
  },
  effects: [],
  volume: -12,
  pan: 0,
};

// Anime Pew
export const SPACE_LASER_ANIME: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Anime Pew',
  synthType: 'SpaceLaser',
  spaceLaser: {
    ...DEFAULT_SPACE_LASER,
    laser: { startFreq: 6000, endFreq: 2000, sweepTime: 80, sweepCurve: 'exponential' },
    fm: { amount: 80, ratio: 8.0 },
    noise: { amount: 0, type: 'white' },
    filter: { type: 'bandpass', cutoff: 4000, resonance: 60 },
    delay: { enabled: true, time: 0.1, feedback: 0.3, wet: 0.3 },
    reverb: { enabled: false, decay: 1.0, wet: 0 },
  },
  effects: [],
  volume: -8,
  pan: 0,
};

// Dub Blaster
export const SPACE_LASER_DUB: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Dub Blaster',
  synthType: 'SpaceLaser',
  spaceLaser: {
    ...DEFAULT_SPACE_LASER,
    laser: { startFreq: 1500, endFreq: 40, sweepTime: 500, sweepCurve: 'linear' },
    fm: { amount: 20, ratio: 1.5 },
    noise: { amount: 40, type: 'brown' },
    filter: { type: 'lowpass', cutoff: 800, resonance: 40 },
    delay: { enabled: true, time: 0.33, feedback: 0.6, wet: 0.6 },
    reverb: { enabled: true, decay: 2.5, wet: 0.3 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

export const SPACE_LASER_PRESETS = [
  SPACE_LASER_STANDARD,
  SPACE_LASER_COSMIC,
  SPACE_LASER_ANIME,
  SPACE_LASER_DUB,
];
