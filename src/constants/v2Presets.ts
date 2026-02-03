import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_V2 } from '@typedefs/instrument';

// Modes: 0:Off, 1:Saw/Tri, 2:Pulse, 3:Sin, 4:Noise, 5:XX, 6:AuxA, 7:AuxB
// Filters: 0:Off, 1:Low, 2:Band, 3:High, 4:Notch, 5:All, 6:MoogL, 7:MoogH

// Classic Trance Lead
export const V2_PRESET_TRANCE: Omit<InstrumentConfig, 'id'> = {
  type: 'synth',
  name: 'V2 Trance Lead',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    osc1: { mode: 1, detune: 0, transpose: 0, color: 64, level: 100 },
    osc2: { mode: 1, ringMod: false, detune: 15, transpose: 0, color: 64, level: 80 },
    filter1: { mode: 1, cutoff: 80, resonance: 40 },
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
    osc1: { mode: 1, detune: 5, transpose: 0, color: 64, level: 60 },
    osc2: { mode: 3, ringMod: false, detune: 0, transpose: 12, color: 64, level: 40 },
    filter1: { mode: 1, cutoff: 40, resonance: 20 },
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
    osc1: { mode: 1, detune: 0, transpose: -12, color: 64, level: 100 },
    osc2: { mode: 2, ringMod: false, detune: 0, transpose: -12, color: 64, level: 60 },
    filter1: { mode: 1, cutoff: 30, resonance: 60 },
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
    osc1: { mode: 3, detune: 0, transpose: -24, color: 64, level: 120 },
    filter1: { mode: 1, cutoff: 20, resonance: 40 },
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
    osc1: { mode: 4, detune: 0, transpose: 0, color: 64, level: 100 },
    filter1: { mode: 2, cutoff: 60, resonance: 20 },
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
    osc1: { mode: 4, detune: 0, transpose: 0, color: 64, level: 80 },
    filter1: { mode: 3, cutoff: 100, resonance: 10 },
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
    osc1: { mode: 1, detune: 0, transpose: 12, color: 64, level: 100 },
    filter1: { mode: 1, cutoff: 120, resonance: 80 },
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