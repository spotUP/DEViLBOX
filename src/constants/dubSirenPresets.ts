import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_DUB_SIREN } from '@typedefs/instrument';

// Classic Dub Siren
export const DUB_SIREN_CLASSIC: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Classic Siren',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sine', frequency: 440 },
    lfo: { enabled: true, type: 'triangle', rate: 2, depth: 200 },
    delay: { enabled: true, time: 0.3, feedback: 0.4, wet: 0.3 },
    filter: { enabled: false, type: 'lowpass', frequency: 2000, rolloff: -24 },
    reverb: { enabled: false, decay: 1.5, wet: 0.2 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// Fast Alert Siren
export const DUB_SIREN_ALERT: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Code Red',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'square', frequency: 600 },
    lfo: { enabled: true, type: 'square', rate: 8, depth: 100 },
    delay: { enabled: false, time: 0.1, feedback: 0, wet: 0 },
    filter: { enabled: false, type: 'lowpass', frequency: 2000, rolloff: -24 },
    reverb: { enabled: true, decay: 2.0, wet: 0.4 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// Space Echo Siren
export const DUB_SIREN_SPACE: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Space Echo',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 220 },
    lfo: { enabled: true, type: 'sine', rate: 0.5, depth: 50 },
    delay: { enabled: true, time: 0.4, feedback: 0.7, wet: 0.5 },
    filter: { enabled: true, type: 'highpass', frequency: 300, rolloff: -12 },
    reverb: { enabled: true, decay: 4.0, wet: 0.6 },
  },
  effects: [],
  volume: -12,
  pan: 0,
};

// Air Horn Style
export const DUB_SIREN_HORN: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'Air Horn',
  synthType: 'DubSiren',
  dubSiren: {
    ...DEFAULT_DUB_SIREN,
    oscillator: { type: 'sawtooth', frequency: 150 },
    lfo: { enabled: true, type: 'sawtooth', rate: 15, depth: 20 },
    delay: { enabled: true, time: 0.15, feedback: 0.2, wet: 0.2 },
    filter: { enabled: true, type: 'lowpass', frequency: 1200, rolloff: -12 },
    reverb: { enabled: false, decay: 1, wet: 0 },
  },
  effects: [],
  volume: -8,
  pan: 0,
};

export const DUB_SIREN_PRESETS = [
  DUB_SIREN_CLASSIC,
  DUB_SIREN_ALERT,
  DUB_SIREN_SPACE,
  DUB_SIREN_HORN,
];
