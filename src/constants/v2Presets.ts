import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_V2 } from '@typedefs/instrument';

// Classic Trance Lead
export const V2_PRESET_TRANCE: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'V2 Trance Lead',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    osc1: { type: 'sawtooth', detune: 0, transpose: 0, level: 100 },
    osc2: { type: 'sawtooth', detune: 15, transpose: 0, level: 80 },
    filter: { type: 'lowpass', cutoff: 80, resonance: 40, envMod: 60 },
    envelope: { attack: 5, decay: 60, sustain: 40, release: 40 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// Soft Intro Pad
export const V2_PRESET_PAD: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'V2 Silk Pad',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    osc1: { type: 'sawtooth', detune: 5, transpose: 0, level: 60 },
    osc2: { type: 'sine', detune: 0, transpose: 12, level: 40 },
    filter: { type: 'lowpass', cutoff: 40, resonance: 20, envMod: 30 },
    envelope: { attack: 80, decay: 100, sustain: 100, release: 100 },
  },
  effects: [],
  volume: -12,
  pan: 0,
};

// 4k Intro Bass
export const V2_PRESET_BASS: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'V2 4k Bass',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    osc1: { type: 'sawtooth', detune: 0, transpose: -12, level: 100 },
    osc2: { type: 'square', detune: 0, transpose: -12, level: 60 },
    filter: { type: 'lowpass', cutoff: 30, resonance: 60, envMod: 80 },
    envelope: { attack: 0, decay: 40, sustain: 0, release: 10 },
  },
  effects: [],
  volume: -8,
  pan: 0,
};

// 4k Intro Kick
export const V2_PRESET_KICK: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'V2 4k Kick',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    osc1: { type: 'sine', detune: 0, transpose: -24, level: 120 },
    filter: { type: 'lowpass', cutoff: 20, resonance: 40, envMod: 100 },
    envelope: { attack: 0, decay: 30, sustain: 0, release: 10 },
  },
  effects: [],
  volume: -6,
  pan: 0,
};

// Noise Snare
export const V2_PRESET_SNARE: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'V2 Noise Snare',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    osc1: { type: 'noise', detune: 0, transpose: 0, level: 100 },
    filter: { type: 'bandpass', cutoff: 60, resonance: 20, envMod: 0 },
    envelope: { attack: 0, decay: 45, sustain: 0, release: 20 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// Metallic Hat
export const V2_PRESET_HAT: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'V2 Metal Hat',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    osc1: { type: 'noise', detune: 0, transpose: 0, level: 80 },
    filter: { type: 'highpass', cutoff: 100, resonance: 10, envMod: 0 },
    envelope: { attack: 0, decay: 15, sustain: 0, release: 10 },
  },
  effects: [],
  volume: -14,
  pan: 0,
};

// Demoscene Zap
export const V2_PRESET_ZAP: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'V2 Retro Zap',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    osc1: { type: 'sawtooth', detune: 0, transpose: 12, level: 100 },
    filter: { type: 'lowpass', cutoff: 120, resonance: 80, envMod: 120 },
    envelope: { attack: 0, decay: 25, sustain: 0, release: 10 },
  },
  effects: [],
  volume: -10,
  pan: 0,
};

export const V2_PRESETS = [
  V2_PRESET_TRANCE,
  V2_PRESET_PAD,
  V2_PRESET_BASS,
  V2_PRESET_KICK,
  V2_PRESET_SNARE,
  V2_PRESET_HAT,
  V2_PRESET_ZAP,
];
