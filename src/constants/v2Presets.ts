import type { InstrumentPreset } from '@typedefs/instrument';
import { DEFAULT_V2 } from '@typedefs/instrument';

// Real V2 patches from Farbrausch V2M demos. All params preserved.

// sin +fm low@99
export const V2_PZERO_FM_TONE: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero FM Tone',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { panning: 1, maxPoly: 16, reverb: 4 },
    osc1: { mode: 3, transpose: 0, detune: 0, color: 0, level: 0 },
    osc2: { mode: 5, ringMod: false, transpose: 0, detune: 9, color: 0, level: 122 },
    filter1: { mode: 1, cutoff: 99, resonance: 0 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 13, decay: 104, sustain: 0, release: 44 },
    envelope2: { attack: 4, decay: 93, sustain: 0, release: 64, amplify: 0 },
    channelDistortion: { mode: 1, inGain: 27, param1: 125, param2: 64 },
    lfo1: { rate: 74, depth: 75 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 2, polarity: 0, amplify: 122 },
    chorusFlanger: { amount: 86, feedback: 64, delayL: 32, delayR: 32, modRate: 30, modDepth: 56, modPhase: 97 },
    modMatrix: [
      { source: 0, amount: 104, dest: 37 },
      { source: 10, amount: 76, dest: 37 },
      { source: 7, amount: 127, dest: 59 },
      { source: 0, amount: 127, dest: 43 },
      { source: 9, amount: 82, dest: 7 },
      { source: 9, amount: 73, dest: 19 },
    ],
  },
  effects: [],
  volume: -8,
  pan: 0,
};

// saw +saw low@84 dist:lpf
export const V2_PZERO_CHORUS_SAW: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Chorus Saw',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { maxPoly: 2, boost: 54, delay: 11, fxRoute: 1 },
    osc1: { mode: 1, transpose: 0, detune: 0, color: 0, level: 106 },
    osc2: { mode: 1, ringMod: false, transpose: 24, detune: 0, color: 0, level: 20 },
    filter1: { mode: 1, cutoff: 84, resonance: 61 },
    filter2: { mode: 3, cutoff: 62, resonance: 93 },
    routing: { mode: 2, balance: 26 },
    envelope: { attack: 6, decay: 40, sustain: 127, release: 19, sustainTime: 63 },
    envelope2: { attack: 0, decay: 34, sustain: 0, release: 8, sustainTime: 65, amplify: 116 },
    voiceDistortion: { mode: 5, inGain: 64, param1: 32, param2: 57 },
    lfo2: { mode: 3, keySync: false, envMode: false, rate: 27, phase: 0, polarity: 2, amplify: 127 },
    chorusFlanger: { amount: 63, feedback: 28, delayL: 32, delayR: 32, modRate: 53, modDepth: 60, modPhase: 100 },
    modMatrix: [
      { source: 0, amount: 107, dest: 37 },
      { source: 10, amount: 65, dest: 1 },
      { source: 7, amount: 104, dest: 59 },
      { source: 9, amount: 125, dest: 21 },
      { source: 1, amount: 105, dest: 30 },
      { source: 11, amount: 77, dest: 24 },
      { source: 9, amount: 74, dest: 30 },
    ],
  },
  effects: [],
  volume: -4,
  pan: 0,
};

// saw +saw +sin low@65
export const V2_PZERO_SAW_PAD: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Saw Pad',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { maxPoly: 12, reverb: 95, delay: 88 },
    osc1: { mode: 1, transpose: 0, detune: 0, color: 32, level: 126 },
    osc2: { mode: 1, ringMod: false, transpose: 0, detune: -14, color: 110, level: 54 },
    osc3: { mode: 3, ringMod: true, transpose: 12, detune: 0, color: 63, level: 47 },
    filter1: { mode: 1, cutoff: 65, resonance: 0 },
    filter2: { mode: 3, cutoff: 107, resonance: 92 },
    routing: { mode: 2, balance: 7 },
    envelope: { attack: 87, decay: 29, sustain: 127, release: 88 },
    envelope2: { attack: 27, decay: 21, sustain: 82, release: 42 },
    channelDistortion: { mode: 7, inGain: 78, param1: 71, param2: 17 },
    lfo1: { rate: 0, depth: 98 },
    lfo2: { mode: 3, keySync: false, envMode: false, rate: 14, phase: 61, polarity: 2, amplify: 49 },
    chorusFlanger: { amount: 106, feedback: 91, delayL: 80, delayR: 47, modRate: 67, modDepth: 7, modPhase: 64 },
    compressor: { mode: 1, stereoLink: true, autoGain: true, lookahead: 2, threshold: 81, ratio: 126, attack: 28, release: 76, outGain: 63 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 10, amount: 91, dest: 6 },
      { source: 7, amount: 84, dest: 59 },
      { source: 11, amount: 112, dest: 0 },
      { source: 1, amount: 73, dest: 21 },
      { source: 11, amount: 25, dest: 24 },
      { source: 1, amount: 87, dest: 57 },
    ],
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// sin +pulse low@80
export const V2_PZERO_PULSE_SYNTH: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Pulse Synth',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { transpose: 24, maxPoly: 9, reverb: 46, delay: 89 },
    osc1: { mode: 3, transpose: 0, detune: 0, color: 0, level: 116 },
    osc2: { mode: 2, ringMod: false, transpose: 12, detune: -14, color: 107, level: 23 },
    filter1: { mode: 1, cutoff: 80, resonance: 14 },
    filter2: { mode: 3, cutoff: 59, resonance: 0 },
    envelope: { attack: 0, decay: 60, sustain: 63, release: 74, sustainTime: 59 },
    envelope2: { attack: 0, decay: 56, sustain: 36, release: 64, sustainTime: 26 },
    channelDistortion: { mode: 7, inGain: 3, param1: 82, param2: 0 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 0, polarity: 0, amplify: 126 },
    chorusFlanger: { amount: 88, feedback: 112, delayL: 34, delayR: 31, modRate: 20, modDepth: 19, modPhase: 64 },
    modMatrix: [
      { source: 0, amount: 102, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 8, amount: 127, dest: 21 },
      { source: 7, amount: 84, dest: 59 },
    ],
  },
  effects: [],
  volume: -8,
  pan: 0,
};

// saw +sin +saw low@113 dist:lpf
export const V2_PZERO_DIST_LEAD: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Dist Lead',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { transpose: 12, maxPoly: 3, reverb: 7, delay: 127 },
    osc1: { mode: 1, transpose: 0, detune: -6, color: 0, level: 126 },
    osc2: { mode: 3, ringMod: false, transpose: 0, detune: -8, color: 0, level: 126 },
    osc3: { mode: 1, ringMod: false, transpose: 0, detune: 4, color: 0, level: 126 },
    filter1: { mode: 1, cutoff: 113, resonance: 92 },
    filter2: { mode: 2, cutoff: 70, resonance: 65 },
    routing: { mode: 2, balance: 64 },
    envelope: { attack: 26, decay: 66, sustain: 19, release: 70, sustainTime: 63 },
    envelope2: { attack: 11, decay: 64, sustain: 64, release: 64 },
    voiceDistortion: { mode: 5, inGain: 32, param1: 126, param2: 34 },
    channelDistortion: { mode: 3, inGain: 32, param1: 2, param2: 0 },
    lfo1: { rate: 12, depth: 102 },
    lfo2: { mode: 3, keySync: true, envMode: false, rate: 51, phase: 67, polarity: 0, amplify: 7 },
    chorusFlanger: { amount: 95, feedback: 88, delayL: 78, delayR: 112, modRate: 46, modDepth: 6, modPhase: 43 },
    compressor: { mode: 1, stereoLink: false, autoGain: false, lookahead: 1, threshold: 76, ratio: 44, attack: 24, release: 53, outGain: 61 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 20, dest: 21 },
      { source: 10, amount: 52, dest: 72 },
      { source: 7, amount: 90, dest: 59 },
      { source: 1, amount: 34, dest: 36 },
      { source: 11, amount: 67, dest: 10 },
      { source: 10, amount: 49, dest: 24 },
    ],
  },
  effects: [],
  volume: -14,
  pan: 0,
};

// saw +sin +noise low@21
export const V2_PZERO_KICK: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Kick',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { boost: 127, keySync: 1 },
    osc1: { mode: 1, transpose: 0, detune: 0, color: 22, level: 88 },
    osc2: { mode: 3, ringMod: false, transpose: 10, detune: -1, color: 38, level: 127 },
    osc3: { mode: 4, ringMod: false, transpose: 30, detune: -25, color: 67, level: 25 },
    filter1: { mode: 1, cutoff: 21, resonance: 101 },
    envelope: { attack: 6, decay: 37, sustain: 0, release: 9 },
    envelope2: { attack: 0, decay: 23, sustain: 0, release: 0, amplify: 50 },
    lfo1: { rate: 90, depth: 107 },
    compressor: { mode: 1, stereoLink: false, autoGain: false, lookahead: 0, threshold: 41, ratio: 77, attack: 11, release: 13, outGain: 110 },
    modMatrix: [
      { source: 0, amount: 78, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 9, amount: 127, dest: 4 },
      { source: 7, amount: 92, dest: 59 },
      { source: 10, amount: 127, dest: 19 },
      { source: 9, amount: 127, dest: 21 },
      { source: 9, amount: 72, dest: 10 },
    ],
  },
  effects: [],
  volume: -14,
  pan: 0,
};

// sin +noise +noise low@30 dist:bitcrush
export const V2_PZERO_DIST_BASS: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Dist Bass',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { transpose: 9, reverb: 4, delay: 15, fxRoute: 1 },
    osc1: { mode: 3, transpose: 40, detune: 0, color: 0, level: 77 },
    osc2: { mode: 4, ringMod: true, transpose: 2, detune: 0, color: 41, level: 127 },
    osc3: { mode: 4, ringMod: false, transpose: 17, detune: 0, color: 93, level: 127 },
    filter1: { mode: 1, cutoff: 30, resonance: 61 },
    filter2: { mode: 3, cutoff: 83, resonance: 92 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 0, decay: 0, sustain: 127, release: 0, sustainTime: 10 },
    envelope2: { attack: 0, decay: 60, sustain: 0, release: 0, amplify: 126 },
    voiceDistortion: { mode: 3, inGain: 41, param1: 75, param2: 11 },
    channelDistortion: { mode: 4, inGain: 32, param1: 105, param2: 0 },
    lfo1: { rate: 84, depth: 43 },
    lfo2: { mode: 0, keySync: false, envMode: false, rate: 72, phase: 0, polarity: 2, amplify: 124 },
    chorusFlanger: { amount: 33, feedback: 63, delayL: 5, delayR: 7, modRate: 54, modDepth: 78, modPhase: 90 },
    compressor: { mode: 1, stereoLink: false, autoGain: true, lookahead: 0, threshold: 55, ratio: 68, attack: 11, release: 23, outGain: 40 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 7, amount: 119, dest: 59 },
      { source: 10, amount: 127, dest: 1 },
      { source: 9, amount: 95, dest: 21 },
      { source: 11, amount: 71, dest: 21 },
      { source: 11, amount: 53, dest: 65 },
    ],
  },
  effects: [],
  volume: -12,
  pan: 0,
};

// pulse +pulse +noise high@126
export const V2_PZERO_HIHAT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Hihat',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { reverb: 5, delay: 35 },
    osc1: { mode: 2, transpose: 0, detune: 0, color: 64, level: 126 },
    osc2: { mode: 2, ringMod: false, transpose: 8, detune: 0, color: 64, level: 126 },
    osc3: { mode: 4, ringMod: false, transpose: 0, detune: 0, color: 32, level: 126 },
    filter1: { mode: 3, cutoff: 126, resonance: 91 },
    filter2: { mode: 2, cutoff: 108, resonance: 94 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 0, decay: 0, sustain: 0, release: 9, amplify: 60 },
    envelope2: { attack: 0, decay: 64, sustain: 64, release: 64 },
    channelDistortion: { mode: 7, inGain: 80, param1: 116, param2: 24 },
    modMatrix: [
      { source: 0, amount: 86, dest: 33 },
      { source: 1, amount: 127, dest: 50 },
      { source: 10, amount: 65, dest: 4 },
      { source: 7, amount: 127, dest: 59 },
      { source: 1, amount: 127, dest: 65 },
    ],
  },
  effects: [],
  volume: -14,
  pan: 0,
};

// noise +fm low@77 dist:overdrive
export const V2_PZERO_FM_DIST: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero FM Dist',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { boost: 92, reverb: 30, delay: 51, keySync: 1 },
    osc1: { mode: 4, transpose: 19, detune: 0, color: 51, level: 127 },
    osc2: { mode: 5, ringMod: false, transpose: -12, detune: 0, color: 116, level: 26 },
    filter1: { mode: 1, cutoff: 77, resonance: 24 },
    filter2: { mode: 1, cutoff: 62, resonance: 34 },
    routing: { mode: 2, balance: 64 },
    envelope: { attack: 0, decay: 96, sustain: 60, release: 108, amplify: 64 },
    envelope2: { attack: 0, decay: 64, sustain: 64, release: 71 },
    voiceDistortion: { mode: 1, inGain: 117, param1: 78, param2: 64 },
    channelDistortion: { mode: 1, inGain: 96, param1: 80, param2: 71 },
    lfo1: { rate: 10, depth: 0 },
    lfo2: { mode: 0, keySync: true, envMode: true, rate: 34, phase: 0, polarity: 1, amplify: 126 },
    modMatrix: [
      { source: 0, amount: 121, dest: 37 },
      { source: 11, amount: 116, dest: 10 },
      { source: 7, amount: 73, dest: 59 },
      { source: 11, amount: 104, dest: 21 },
      { source: 11, amount: 64, dest: 24 },
    ],
  },
  effects: [],
  volume: -12,
  pan: 0,
};

// noise low@121
export const V2_PZERO_NOISE: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Noise',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    osc1: { mode: 4, transpose: 53, detune: 0, color: 0, level: 126 },
    filter1: { mode: 1, cutoff: 121, resonance: 105 },
    filter2: { mode: 1, cutoff: 117, resonance: 94 },
    routing: { mode: 2, balance: 64 },
    envelope: { attack: 0, decay: 20, sustain: 20, release: 8, sustainTime: 35 },
    envelope2: { attack: 0, decay: 64, sustain: 64, release: 64 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 0, polarity: 0, amplify: 126 },
    modMatrix: [
      { source: 0, amount: 82, dest: 37 },
      { source: 7, amount: 83, dest: 59 },
    ],
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// saw +saw band@67 dist:hpf
export const V2_PZERO_CHORUS_PAD: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Chorus Pad',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { transpose: 12, maxPoly: 16, boost: 66, reverb: 21, delay: 31 },
    osc1: { mode: 1, transpose: 0, detune: -8, color: 1, level: 124 },
    osc3: { mode: 1, ringMod: false, transpose: 12, detune: 10, color: 6, level: 124 },
    filter1: { mode: 2, cutoff: 67, resonance: 0 },
    filter2: { mode: 1, cutoff: 55, resonance: 0 },
    routing: { mode: 2, balance: 29 },
    envelope: { attack: 70, decay: 0, sustain: 127, release: 105 },
    envelope2: { attack: 127, decay: 125, sustain: 125, release: 125, amplify: 125 },
    voiceDistortion: { mode: 7, inGain: 102, param1: 49, param2: 0 },
    channelDistortion: { mode: 6, inGain: 32, param1: 61, param2: 0 },
    lfo1: { rate: 10, depth: 125 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 25, phase: 2, polarity: 0, amplify: 0 },
    chorusFlanger: { amount: 106, feedback: 72, delayL: 32, delayR: 67, modRate: 45, modDepth: 26, modPhase: 64 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 10, amount: 92, dest: 21 },
      { source: 7, amount: 73, dest: 59 },
      { source: 10, amount: 81, dest: 10 },
      { source: 10, amount: 46, dest: 12 },
      { source: 11, amount: 92, dest: 27 },
      { source: 11, amount: 61, dest: 6 },
      { source: 9, amount: 127, dest: 57 },
      { source: 11, amount: 62, dest: 10 },
    ],
  },
  effects: [],
  volume: -12,
  pan: 0,
};

// noise low@32
export const V2_PZERO_NOISE_PAD: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'PZero Noise Pad',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { maxPoly: 4, reverb: 34, delay: 95 },
    osc1: { mode: 4, transpose: 10, detune: 0, color: 0, level: 126 },
    filter1: { mode: 1, cutoff: 32, resonance: 9 },
    envelope: { attack: 100, decay: 78, sustain: 126, release: 75 },
    envelope2: { attack: 100, decay: 0, sustain: 11, release: 4, sustainTime: 0, amplify: 65 },
    channelDistortion: { mode: 1, inGain: 50, param1: 19, param2: 72 },
    lfo1: { rate: 13, depth: 126 },
    lfo2: { mode: 1, keySync: false, envMode: false, rate: 1, phase: 0, polarity: 0, amplify: 126 },
    chorusFlanger: { amount: 98, feedback: 74, delayL: 67, delayR: 83, modRate: 14, modDepth: 114, modPhase: 76 },
    compressor: { mode: 2, stereoLink: true, autoGain: true, lookahead: 6, threshold: 33, ratio: 62, attack: 57, release: 62, outGain: 127 },
    modMatrix: [
      { source: 0, amount: 71, dest: 37 },
      { source: 7, amount: 127, dest: 59 },
      { source: 10, amount: 23, dest: 24 },
      { source: 11, amount: 114, dest: 21 },
      { source: 10, amount: 64, dest: 4 },
      { source: 11, amount: 96, dest: 6 },
      { source: 10, amount: 35, dest: 0 },
    ],
  },
  effects: [],
  volume: -3,
  pan: 0,
};

// sin +noise low@38
export const V2_ZEIT_NOISE_BASS: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Noise Bass',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { boost: 5, keySync: 1, fxRoute: 1 },
    osc1: { mode: 3, transpose: -3, detune: 0, color: 64, level: 127 },
    osc2: { mode: 4, ringMod: false, transpose: 33, detune: 3, color: 55, level: 2 },
    filter1: { mode: 1, cutoff: 38, resonance: 8 },
    filter2: { mode: 3, cutoff: 82, resonance: 0 },
    routing: { mode: 2, balance: 64 },
    envelope: { attack: 0, decay: 64, sustain: 0, release: 6 },
    envelope2: { attack: 0, decay: 32, sustain: 0, release: 0, sustainTime: 65, amplify: 55 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 65, polarity: 2, amplify: 74 },
    compressor: { mode: 1, stereoLink: false, autoGain: false, lookahead: 0, threshold: 90, ratio: 0, attack: 0, release: 0, outGain: 86 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 89, dest: 59 },
      { source: 9, amount: 127, dest: 4 },
    ],
  },
  effects: [],
  volume: -3,
  pan: 0,
};

// sin +noise +sin band@83
export const V2_ZEIT_RIM_SHOT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Rim Shot',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { reverb: 4, keySync: 1, fxRoute: 1 },
    osc1: { mode: 3, transpose: 16, detune: 0, color: 65, level: 17 },
    osc2: { mode: 4, ringMod: false, transpose: 15, detune: 0, color: 105, level: 127 },
    osc3: { mode: 3, ringMod: false, transpose: 24, detune: 0, color: 104, level: 67 },
    filter1: { mode: 2, cutoff: 83, resonance: 0 },
    filter2: { mode: 3, cutoff: 64, resonance: 0 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 0, decay: 8, sustain: 9, release: 46, sustainTime: 44 },
    envelope2: { attack: 0, decay: 17, sustain: 123, release: 0, sustainTime: 59, amplify: 20 },
    channelDistortion: { mode: 7, inGain: 124, param1: 76, param2: 55 },
    lfo1: { rate: 39, depth: 127 },
    compressor: { mode: 1, stereoLink: false, autoGain: false, lookahead: 0, threshold: 38, ratio: 127, attack: 0, release: 0, outGain: 127 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 127, dest: 59 },
      { source: 9, amount: 118, dest: 4 },
      { source: 10, amount: 92, dest: 0 },
    ],
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// pulse +sin +sin low@37
export const V2_ZEIT_PULSE_SWEEP: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Pulse Sweep',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { keySync: 1 },
    osc1: { mode: 2, transpose: 24, detune: 0, color: 122, level: 127 },
    osc2: { mode: 3, ringMod: false, transpose: 43, detune: 0, color: 64, level: 63 },
    osc3: { mode: 3, ringMod: false, transpose: 24, detune: 0, color: 64, level: 127 },
    filter1: { mode: 1, cutoff: 37, resonance: 0 },
    filter2: { mode: 3, cutoff: 31, resonance: 70 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 0, decay: 48, sustain: 0, release: 3 },
    envelope2: { attack: 0, decay: 51, sustain: 0, release: 4, amplify: 103 },
    lfo1: { rate: 27, depth: 41 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 92, dest: 59 },
      { source: 9, amount: 117, dest: 21 },
      { source: 12, amount: 89, dest: 21 },
      { source: 10, amount: 64, dest: 18 },
    ],
  },
  effects: [],
  volume: -14,
  pan: 0,
};

// noise +sin low@114 dist:clip
export const V2_ZEIT_HIHAT: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Hihat',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { panning: 11, maxPoly: 4, fxRoute: 1 },
    osc1: { mode: 4, transpose: 1, detune: 0, color: 0, level: 127 },
    osc2: { mode: 3, ringMod: false, transpose: 43, detune: 0, color: 27, level: 0 },
    filter1: { mode: 1, cutoff: 114, resonance: 51 },
    filter2: { mode: 4, cutoff: 103, resonance: 114 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 19, decay: 37, sustain: 0, release: 30, sustainTime: 63 },
    envelope2: { attack: 0, decay: 64, sustain: 64, release: 64 },
    voiceDistortion: { mode: 2, inGain: 114, param1: 127, param2: 62 },
    channelDistortion: { mode: 7, inGain: 41, param1: 106, param2: 57 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 0, polarity: 0, amplify: 126 },
    compressor: { mode: 1, stereoLink: false, autoGain: false, lookahead: 0, threshold: 90, ratio: 0, attack: 0, release: 0, outGain: 74 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 74, dest: 59 },
    ],
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// noise high@114 dist:clip
export const V2_ZEIT_CYMBAL: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Cymbal',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { panning: -9, maxPoly: 4, reverb: 7 },
    osc1: { mode: 4, transpose: 1, detune: 0, color: 0, level: 127 },
    filter1: { mode: 3, cutoff: 114, resonance: 36 },
    filter2: { mode: 4, cutoff: 103, resonance: 38 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 13, decay: 24, sustain: 8, release: 30 },
    envelope2: { attack: 0, decay: 64, sustain: 64, release: 64 },
    voiceDistortion: { mode: 2, inGain: 114, param1: 127, param2: 62 },
    channelDistortion: { mode: 7, inGain: 41, param1: 97, param2: 105 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 0, polarity: 0, amplify: 126 },
    chorusFlanger: { amount: 118, feedback: 83, delayL: 3, delayR: 3, modRate: 27, modDepth: 21, modPhase: 74 },
    compressor: { mode: 1, stereoLink: false, autoGain: false, lookahead: 0, threshold: 90, ratio: 0, attack: 0, release: 0, outGain: 64 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 80, dest: 59 },
    ],
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// pulse +saw low@29
export const V2_ZEIT_SAW_BASS: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Saw Bass',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { panning: -32, maxPoly: 6, reverb: 29, delay: 95 },
    osc1: { mode: 2, transpose: 0, detune: 0, color: 11, level: 127 },
    osc2: { mode: 1, ringMod: false, transpose: -12, detune: 11, color: 64, level: 127 },
    filter1: { mode: 1, cutoff: 29, resonance: 22 },
    filter2: { mode: 2, cutoff: 64, resonance: 115 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 0, decay: 26, sustain: 95, release: 35 },
    envelope2: { attack: 0, decay: 64, sustain: 127, release: 80 },
    lfo1: { rate: 71, depth: 8 },
    lfo2: { mode: 1, keySync: false, envMode: false, rate: 25, phase: 2, polarity: 2, amplify: 51 },
    chorusFlanger: { amount: 113, feedback: 107, delayL: 32, delayR: 32, modRate: 0, modDepth: 28, modPhase: 123 },
    compressor: { mode: 1, stereoLink: false, autoGain: true, lookahead: 2, threshold: 34, ratio: 109, attack: 0, release: 7, outGain: 64 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 76, dest: 59 },
      { source: 12, amount: 101, dest: 0 },
      { source: 10, amount: 122, dest: 21 },
      { source: 12, amount: 125, dest: 21 },
      { source: 11, amount: 121, dest: 24 },
    ],
  },
  effects: [],
  volume: -6,
  pan: 0,
};

// saw +pulse low@22
export const V2_ZEIT_SWEEP_BASS: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Sweep Bass',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { panning: -63, maxPoly: 8, reverb: 65, delay: 119, keySync: 1 },
    osc1: { mode: 1, transpose: 24, detune: -9, color: 65, level: 118 },
    osc2: { mode: 2, ringMod: false, transpose: 24, detune: 0, color: 4, level: 124 },
    filter1: { mode: 1, cutoff: 22, resonance: 13 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 0, decay: 64, sustain: 0, release: 102 },
    envelope2: { attack: 0, decay: 106, sustain: 36, release: 95, amplify: 114 },
    lfo1: { rate: 112, depth: 0 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 0, polarity: 0, amplify: 124 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 72, dest: 59 },
      { source: 9, amount: 76, dest: 21 },
      { source: 10, amount: 119, dest: 1 },
      { source: 12, amount: 120, dest: 0 },
      { source: 12, amount: 106, dest: 21 },
    ],
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// saw high@102
export const V2_ZEIT_RESO_SAW: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Reso Saw',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { panning: -1, maxPoly: 2, reverb: 2, delay: 6 },
    osc1: { mode: 1, transpose: -12, detune: 2, color: 0, level: 125 },
    filter1: { mode: 3, cutoff: 102, resonance: 85 },
    filter2: { mode: 2, cutoff: 107, resonance: 47 },
    routing: { mode: 2, balance: 69 },
    envelope: { attack: 12, decay: 40, sustain: 0, release: 15 },
    envelope2: { attack: 21, decay: 49, sustain: 0, release: 0, amplify: 25 },
    channelDistortion: { mode: 5, inGain: 127, param1: 116, param2: 0 },
    lfo1: { rate: 119, depth: 0 },
    lfo2: { mode: 1, keySync: false, envMode: false, rate: 73, phase: 0, polarity: 1, amplify: 34 },
    chorusFlanger: { amount: 83, feedback: 36, delayL: 31, delayR: 31, modRate: 56, modDepth: 43, modPhase: 83 },
    compressor: { mode: 1, stereoLink: false, autoGain: true, lookahead: 0, threshold: 91, ratio: 0, attack: 0, release: 0, outGain: 82 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 7, amount: 64, dest: 59 },
      { source: 10, amount: 117, dest: 1 },
      { source: 11, amount: 96, dest: 21 },
      { source: 9, amount: 127, dest: 1 },
      { source: 11, amount: 98, dest: 24 },
      { source: 1, amount: 127, dest: 34 },
      { source: 2, amount: 127, dest: 65 },
      { source: 3, amount: 80, dest: 59 },
    ],
  },
  effects: [],
  volume: -8,
  pan: 0,
};

// saw +saw +saw low@108
export const V2_ZEIT_SAW_STAB: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Saw Stab',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { maxPoly: 4, reverb: 13, delay: 18, fxRoute: 1 },
    osc1: { mode: 1, transpose: 0, detune: 0, color: 15, level: 125 },
    osc2: { mode: 1, ringMod: false, transpose: 48, detune: 0, color: 32, level: 25 },
    osc3: { mode: 1, ringMod: false, transpose: 24, detune: 0, color: 32, level: 33 },
    filter1: { mode: 1, cutoff: 108, resonance: 0 },
    envelope: { attack: 0, decay: 31, sustain: 0, release: 0 },
    envelope2: { attack: 0, decay: 64, sustain: 64, release: 64 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 0, polarity: 0, amplify: 125 },
    chorusFlanger: { amount: 97, feedback: 106, delayL: 2, delayR: 4, modRate: 22, modDepth: 21, modPhase: 64 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 10, amount: 65, dest: 4 },
      { source: 7, amount: 88, dest: 59 },
    ],
  },
  effects: [],
  volume: -12,
  pan: 0,
};

// saw low@127
export const V2_ZEIT_CHORUS_PAD: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Chorus Pad',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { reverb: 9 },
    osc1: { mode: 1, transpose: 0, detune: 0, color: 0, level: 127 },
    filter1: { mode: 1, cutoff: 127, resonance: 0 },
    envelope: { attack: 109, decay: 15, sustain: 0, release: 0 },
    envelope2: { attack: 118, decay: 12, sustain: 127, release: 0 },
    lfo1: { rate: 127, depth: 8 },
    chorusFlanger: { amount: 98, feedback: 80, delayL: 1, delayR: 5, modRate: 13, modDepth: 119, modPhase: 121 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 89, dest: 59 },
      { source: 9, amount: 127, dest: 1 },
      { source: 10, amount: 127, dest: 1 },
      { source: 10, amount: 127, dest: 0 },
    ],
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// noise +noise +noise low@6 dist:bitcrush
export const V2_ZEIT_DIST_BASS: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Dist Bass',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { panning: 40, transpose: 62, maxPoly: 4, reverb: 30, delay: 10, keySync: 1, fxRoute: 1 },
    osc1: { mode: 4, transpose: 62, detune: 62, color: 6, level: 126 },
    osc2: { mode: 4, ringMod: false, transpose: 62, detune: 50, color: 51, level: 126 },
    osc3: { mode: 4, ringMod: false, transpose: 62, detune: 26, color: 91, level: 126 },
    filter1: { mode: 1, cutoff: 6, resonance: 21 },
    filter2: { mode: 1, cutoff: 126, resonance: 0 },
    routing: { mode: 1, balance: 64 },
    envelope: { attack: 0, decay: 55, sustain: 0, release: 0 },
    envelope2: { attack: 0, decay: 54, sustain: 0, release: 0, amplify: 115 },
    voiceDistortion: { mode: 3, inGain: 32, param1: 12, param2: 84 },
    channelDistortion: { mode: 5, inGain: 117, param1: 76, param2: 56 },
    lfo2: { mode: 1, keySync: true, envMode: true, rate: 0, phase: 0, polarity: 0, amplify: 126 },
    chorusFlanger: { amount: 100, feedback: 106, delayL: 99, delayR: 101, modRate: 127, modDepth: 121, modPhase: 60 },
    compressor: { mode: 1, stereoLink: true, autoGain: false, lookahead: 2, threshold: 9, ratio: 7, attack: 11, release: 64, outGain: 98 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 9, amount: 127, dest: 21 },
      { source: 7, amount: 75, dest: 59 },
      { source: 9, amount: 120, dest: 6 },
      { source: 8, amount: 127, dest: 87 },
      { source: 1, amount: 0, dest: 76 },
      { source: 9, amount: 127, dest: 70 },
    ],
  },
  effects: [],
  volume: -12,
  pan: 0,
};

// sin +sin +noise high@46 dist:clip
export const V2_ZEIT_DIST_BASS_2: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Dist Bass 2',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { panning: -13, reverb: 10 },
    osc1: { mode: 3, transpose: 0, detune: 6, color: 0, level: 126 },
    osc2: { mode: 3, ringMod: false, transpose: 12, detune: 1, color: 32, level: 73 },
    osc3: { mode: 4, ringMod: false, transpose: 48, detune: 0, color: 51, level: 126 },
    filter1: { mode: 3, cutoff: 46, resonance: 123 },
    filter2: { mode: 3, cutoff: 66, resonance: 89 },
    routing: { mode: 2, balance: 64 },
    envelope: { attack: 0, decay: 45, sustain: 0, release: 29 },
    envelope2: { attack: 0, decay: 64, sustain: 64, release: 64 },
    voiceDistortion: { mode: 2, inGain: 118, param1: 114, param2: 64 },
    channelDistortion: { mode: 5, inGain: 101, param1: 111, param2: 47 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 64, phase: 0, polarity: 0, amplify: 126 },
    chorusFlanger: { amount: 97, feedback: 19, delayL: 1, delayR: 2, modRate: 0, modDepth: 0, modPhase: 64 },
    compressor: { mode: 1, stereoLink: false, autoGain: false, lookahead: 2, threshold: 31, ratio: 116, attack: 127, release: 64, outGain: 80 },
    modMatrix: [
      { source: 0, amount: 91, dest: 37 },
      { source: 7, amount: 91, dest: 59 },
    ],
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// saw low@61
export const V2_ZEIT_RESO_SAW_2: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Reso Saw 2',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { maxPoly: 9 },
    osc1: { mode: 1, transpose: 0, detune: -45, color: 0, level: 126 },
    filter1: { mode: 1, cutoff: 61, resonance: 97 },
    filter2: { mode: 1, cutoff: 61, resonance: 97 },
    routing: { mode: 2, balance: 64 },
    envelope: { attack: 0, decay: 64, sustain: 0, release: 13 },
    envelope2: { attack: 24, decay: 64, sustain: 127, release: 0, amplify: 25 },
    channelDistortion: { mode: 2, inGain: 70, param1: 95, param2: 64 },
    lfo1: { rate: 2, depth: 64 },
    lfo2: { mode: 1, keySync: true, envMode: false, rate: 125, phase: 0, polarity: 2, amplify: 1 },
    chorusFlanger: { amount: 98, feedback: 82, delayL: 1, delayR: 2, modRate: 0, modDepth: 73, modPhase: 98 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 76, dest: 59 },
      { source: 11, amount: 127, dest: 1 },
      { source: 9, amount: 127, dest: 1 },
      { source: 2, amount: 96, dest: 21 },
      { source: 3, amount: 85, dest: 64 },
      { source: 3, amount: 82, dest: 65 },
    ],
  },
  effects: [],
  volume: -6,
  pan: 0,
};

// saw +pulse low@80
export const V2_ZEIT_CHORUS_LEAD: InstrumentPreset['config'] = {
  type: 'synth',
  name: 'Zeit Chorus Lead',
  synthType: 'V2',
  v2: {
    ...DEFAULT_V2,
    voice: { maxPoly: 4, reverb: 92 },
    osc1: { mode: 1, transpose: 0, detune: -6, color: 0, level: 120 },
    osc2: { mode: 2, ringMod: false, transpose: 12, detune: 8, color: 13, level: 119 },
    filter1: { mode: 1, cutoff: 80, resonance: 0 },
    envelope: { attack: 0, decay: 64, sustain: 127, release: 80 },
    envelope2: { attack: 0, decay: 64, sustain: 127, release: 80 },
    lfo1: { rate: 64, depth: 1 },
    chorusFlanger: { amount: 84, feedback: 96, delayL: 55, delayR: 57, modRate: 21, modDepth: 88, modPhase: 102 },
    modMatrix: [
      { source: 0, amount: 127, dest: 37 },
      { source: 1, amount: 127, dest: 50 },
      { source: 7, amount: 68, dest: 59 },
      { source: 10, amount: 106, dest: 1 },
    ],
  },
  effects: [],
  volume: -10,
  pan: 0,
};

// Drum preset exports for factoryPresets/drum.ts
export const V2_PRESET_KICK = V2_PZERO_KICK;
export const V2_PRESET_SNARE = V2_ZEIT_RIM_SHOT;
export const V2_PRESET_HAT = V2_PZERO_HIHAT;

// Ordered: leads/synths first, pads, bass, drums/percussion last
export const V2_PRESETS: InstrumentPreset['config'][] = [
  // Leads & Synths
  V2_ZEIT_CHORUS_LEAD,
  V2_PZERO_DIST_LEAD,
  V2_PZERO_CHORUS_SAW,
  V2_ZEIT_RESO_SAW,
  V2_ZEIT_RESO_SAW_2,
  V2_PZERO_PULSE_SYNTH,
  V2_PZERO_FM_TONE,
  V2_PZERO_FM_DIST,
  // Pads
  V2_PZERO_SAW_PAD,
  V2_PZERO_CHORUS_PAD,
  V2_ZEIT_CHORUS_PAD,
  V2_PZERO_NOISE_PAD,
  // Bass
  V2_ZEIT_SWEEP_BASS,
  V2_ZEIT_SAW_BASS,
  V2_PZERO_DIST_BASS,
  V2_ZEIT_DIST_BASS,
  V2_ZEIT_NOISE_BASS,
  V2_ZEIT_DIST_BASS_2,
  V2_ZEIT_PULSE_SWEEP,
  // Drums & Percussion
  V2_ZEIT_RIM_SHOT,
  V2_PZERO_KICK,
  V2_ZEIT_HIHAT,
  V2_PZERO_HIHAT,
  V2_ZEIT_CYMBAL,
  V2_ZEIT_SAW_STAB,
  V2_PZERO_NOISE,
  // Speech
  { name: 'V2 Speech', type: 'synth' as const, synthType: 'V2Speech' as const, volume: -6, pan: 0, effects: [], parameters: { text: 'Ready' } },
];
