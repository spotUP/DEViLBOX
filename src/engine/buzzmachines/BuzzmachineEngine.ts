/**
 * BuzzmachineEngine - Singleton manager for buzzmachine WASM modules
 *
 * Handles loading WASM buzzmachines (Arguru Distortion, Elak SVF, etc.)
 * and routing audio through AudioWorklet.
 *
 * Similar architecture to FurnaceChipEngine.ts
 */

import { getNativeContext } from '@utils/audio-context';

export const BuzzmachineType = {
  // Distortion/Saturation
  ARGURU_DISTORTION: 'ArguruDistortion',
  ELAK_DIST2: 'ElakDist2',
  JESKOLA_DISTORTION: 'JeskolaDistortion',
  GEONIK_OVERDRIVE: 'GeonikOverdrive',
  GRAUE_SOFTSAT: 'GraueSoftSat',
  WHITENOISE_STEREODIST: 'WhiteNoiseStereoDist',

  // Filters
  ELAK_SVF: 'ElakSVF',
  CYANPHASE_NOTCH: 'CyanPhaseNotch',
  Q_ZFILTER: 'QZfilter',
  FSM_PHILTA: 'FSMPhilta',

  // Delay/Reverb
  JESKOLA_DELAY: 'JeskolaDelay',
  JESKOLA_CROSSDELAY: 'JeskolaCrossDelay',
  JESKOLA_FREEVERB: 'JeskolaFreeverb',
  FSM_PANZERDELAY: 'FSMPanzerDelay',

  // Chorus/Modulation
  FSM_CHORUS: 'FSMChorus',
  FSM_CHORUS2: 'FSMChorus2',
  WHITENOISE_WHITECHORUS: 'WhiteNoiseWhiteChorus',
  BIGYO_FREQUENCYSHIFTER: 'BigyoFrequencyShifter',

  // Dynamics
  GEONIK_COMPRESSOR: 'GeonikCompressor',
  LD_SLIMIT: 'LdSLimit',
  OOMEK_EXCITER: 'OomekExciter',
  OOMEK_MASTERIZER: 'OomekMasterizer',
  DEDACODE_STEREOGAIN: 'DedaCodeStereoGain',

  // Generators
  FSM_KICK: 'FSMKick',
  FSM_KICKXP: 'FSMKickXP',
  JESKOLA_TRILOK: 'JeskolaTrilok',
  JESKOLA_NOISE: 'JeskolaNoise',
  OOMEK_AGGRESSOR: 'OomekAggressor',
  OOMEK_AGGRESSOR_DF: 'OomekAggressorDF', // Devil Fish enhanced 303
  MADBRAIN_4FM2F: 'MadBrain4FM2F',
  MADBRAIN_DYNAMITE6: 'MadBrainDynamite6',
  MAKK_M3: 'MakkM3',
  MAKK_M4: 'MakkM4',
  CYANPHASE_DTMF: 'CyanPhaseDTMF',
  ELENZIL_FREQUENCYBOMB: 'ElenzilFrequencyBomb',
} as const;

export type BuzzmachineType = typeof BuzzmachineType[keyof typeof BuzzmachineType];

export interface BuzzmachineParameter {
  index: number;
  name: string;
  description: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  type: 'byte' | 'word'; // pt_byte or pt_word
}

export interface BuzzmachineInfo {
  name: string;
  shortName: string;
  author: string;
  type: 'effect' | 'generator' | 'master';
  parameters: BuzzmachineParameter[];
}

// Machine metadata (parsed from compiled WASM)
export const BUZZMACHINE_INFO: Record<BuzzmachineType, BuzzmachineInfo> = {
  [BuzzmachineType.ARGURU_DISTORTION]: {
    name: 'Arguru Distortion',
    shortName: 'Distortion',
    author: 'Arguru',
    type: 'effect',
    parameters: [
      {
        index: 0,
        name: 'Input Gain',
        description: 'Input Gain',
        minValue: 0x0001,
        maxValue: 0x0800,
        defaultValue: 0x0100,
        type: 'word',
      },
      {
        index: 1,
        name: 'Threshold (-)',
        description: 'Threshold level (negative)',
        minValue: 0x0001,
        maxValue: 0x8000,
        defaultValue: 0x200,
        type: 'word',
      },
      {
        index: 2,
        name: 'Threshold (+)',
        description: 'Threshold level (positive)',
        minValue: 0x0001,
        maxValue: 0x8000,
        defaultValue: 0x200,
        type: 'word',
      },
      {
        index: 3,
        name: 'Output Gain',
        description: 'Output Gain',
        minValue: 0x0001,
        maxValue: 0x0800,
        defaultValue: 0x0400,
        type: 'word',
      },
      {
        index: 4,
        name: 'Phase Inversor',
        description: 'Stereo phase inversor',
        minValue: 0x00,
        maxValue: 0x01,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 5,
        name: 'Mode',
        description: 'Operational mode (0=Clip, 1=Saturate)',
        minValue: 0x00,
        maxValue: 0x01,
        defaultValue: 0x00,
        type: 'byte',
      },
    ],
  },
  [BuzzmachineType.ELAK_SVF]: {
    name: 'Elak SVF Filter',
    shortName: 'SVF',
    author: 'Elak',
    type: 'effect',
    parameters: [
      {
        index: 0,
        name: 'Cutoff',
        description: 'Cut-off frequency',
        minValue: 0,
        maxValue: 1000,
        defaultValue: 0x200,
        type: 'word',
      },
      {
        index: 1,
        name: 'Resonance',
        description: 'Resonance',
        minValue: 0,
        maxValue: 0xFFFE,
        defaultValue: 0x200,
        type: 'word',
      },
    ],
  },
  [BuzzmachineType.FSM_KICK]: {
    name: 'FSM Kick',
    shortName: 'Kick',
    author: 'FSM',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.FSM_KICKXP]: {
    name: 'FSM KickXP',
    shortName: 'KickXP',
    author: 'FSM',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.JESKOLA_TRILOK]: {
    name: 'Jeskola Trilok',
    shortName: 'Trilok',
    author: 'Jeskola',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.JESKOLA_NOISE]: {
    name: 'Jeskola Noise',
    shortName: 'Noise',
    author: 'Jeskola',
    type: 'generator',
    parameters: [],
  },
  [BuzzmachineType.OOMEK_AGGRESSOR]: {
    name: 'Oomek Aggressor',
    shortName: 'Aggressor',
    author: 'Oomek',
    type: 'generator',
    parameters: [
      // Global parameters (TB-303 style controls)
      {
        index: 0,
        name: 'Osc Type',
        description: 'Oscillator type (0 = Saw, 1 = Square)',
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        type: 'byte',
      },
      {
        index: 1,
        name: 'Cutoff',
        description: 'Filter cutoff frequency',
        minValue: 0x00,
        maxValue: 0xF0,
        defaultValue: 0x78,
        type: 'byte',
      },
      {
        index: 2,
        name: 'Resonance',
        description: 'Filter resonance',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 3,
        name: 'Env Mod',
        description: 'Envelope modulation depth',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 4,
        name: 'Decay',
        description: 'Envelope decay time',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 5,
        name: 'Accent Level',
        description: 'Accent level boost',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 6,
        name: 'Finetune',
        description: 'Fine tuning in cents (-100 to +100)',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x64, // 100 = center (0 cents)
        type: 'byte',
      },
      {
        index: 7,
        name: 'Volume',
        description: 'Output volume',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x64, // 100%
        type: 'byte',
      },
    ],
  },
  [BuzzmachineType.OOMEK_AGGRESSOR_DF]: {
    name: 'Oomek Aggressor Devil Fish',
    shortName: 'AggressorDF',
    author: 'Oomek + Devil Fish Mods',
    type: 'generator',
    parameters: [
      // Original global parameters (0-7)
      {
        index: 0,
        name: 'Osc Type',
        description: 'Oscillator type (0 = Saw, 1 = Square)',
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        type: 'byte',
      },
      {
        index: 1,
        name: 'Cutoff',
        description: 'Filter cutoff frequency',
        minValue: 0x00,
        maxValue: 0xF0,
        defaultValue: 0x78,
        type: 'byte',
      },
      {
        index: 2,
        name: 'Resonance',
        description: 'Filter resonance',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 3,
        name: 'Env Mod',
        description: 'Envelope modulation depth',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 4,
        name: 'Decay',
        description: 'Normal envelope decay time',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 5,
        name: 'Accent Level',
        description: 'Accent level boost',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 6,
        name: 'Finetune',
        description: 'Fine tuning in cents (-100 to +100)',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x64, // 100 = center (0 cents)
        type: 'byte',
      },
      {
        index: 7,
        name: 'Volume',
        description: 'Output volume',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x64, // 100%
        type: 'byte',
      },
      // Devil Fish parameters (8-16)
      {
        index: 8,
        name: 'Accent Decay',
        description: 'Accent envelope decay time (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x40,
        type: 'byte',
      },
      {
        index: 9,
        name: 'VEG Decay',
        description: 'Volume envelope decay (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x80,
        defaultValue: 0x60,
        type: 'byte',
      },
      {
        index: 10,
        name: 'VEG Sustain',
        description: 'Volume envelope sustain 0-100% (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x64,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 11,
        name: 'Soft Attack',
        description: 'Soft attack time 0.3-30ms (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x64,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 12,
        name: 'Filter Tracking',
        description: 'Filter tracking 0-200% (Devil Fish)',
        minValue: 0x00,
        maxValue: 0xC8,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 13,
        name: 'High Resonance',
        description: 'High resonance mode - self oscillation (Devil Fish)',
        minValue: 0,
        maxValue: 1,
        defaultValue: 0,
        type: 'byte',
      },
      {
        index: 14,
        name: 'Slide Time',
        description: 'Slide/glide time 10-500ms (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x64,
        defaultValue: 0x1E, // ~60ms (original 303)
        type: 'byte',
      },
      {
        index: 15,
        name: 'Muffler',
        description: 'Output soft clipping 0=off, 1=soft, 2=hard (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x02,
        defaultValue: 0x00,
        type: 'byte',
      },
      {
        index: 16,
        name: 'Sweep Speed',
        description: 'Accent sweep speed 0=fast, 1=normal, 2=slow (Devil Fish)',
        minValue: 0x00,
        maxValue: 0x02,
        defaultValue: 0x01,
        type: 'byte',
      },
    ],
  },
  [BuzzmachineType.MADBRAIN_4FM2F]: {
    name: 'MadBrain 4FM2F',
    shortName: '4FM2F',
    author: 'MadBrain',
    type: 'generator',
    parameters: [
      { index: 0, name: 'Routing', description: 'FM algorithm (1-15)', minValue: 1, maxValue: 15, defaultValue: 1, type: 'byte' },
      { index: 1, name: 'Osc4 Wave', description: 'Oscillator 4 waveform', minValue: 1, maxValue: 16, defaultValue: 1, type: 'byte' },
      { index: 2, name: 'Osc4 Freq', description: 'Oscillator 4 frequency ratio', minValue: 0, maxValue: 32, defaultValue: 1, type: 'byte' },
      { index: 3, name: 'Osc4 Fine', description: 'Oscillator 4 fine tune', minValue: 0, maxValue: 0xFE, defaultValue: 0, type: 'byte' },
      { index: 4, name: 'Osc4 Vol', description: 'Oscillator 4 volume', minValue: 0, maxValue: 64, defaultValue: 32, type: 'byte' },
      { index: 5, name: 'Osc4 A', description: 'Oscillator 4 attack', minValue: 0, maxValue: 32, defaultValue: 32, type: 'byte' },
      { index: 6, name: 'Osc4 D', description: 'Oscillator 4 decay', minValue: 0, maxValue: 32, defaultValue: 8, type: 'byte' },
      { index: 7, name: 'Osc4 S', description: 'Oscillator 4 sustain', minValue: 0, maxValue: 63, defaultValue: 31, type: 'byte' },
      { index: 8, name: 'Osc4 R', description: 'Oscillator 4 release', minValue: 0, maxValue: 32, defaultValue: 16, type: 'byte' },
      { index: 9, name: 'Osc3 Wave', description: 'Oscillator 3 waveform', minValue: 1, maxValue: 16, defaultValue: 1, type: 'byte' },
      { index: 10, name: 'Osc3 Freq', description: 'Oscillator 3 frequency ratio', minValue: 0, maxValue: 32, defaultValue: 1, type: 'byte' },
      { index: 11, name: 'Osc3 Fine', description: 'Oscillator 3 fine tune', minValue: 0, maxValue: 0xFE, defaultValue: 0, type: 'byte' },
      { index: 12, name: 'Osc3 Vol', description: 'Oscillator 3 volume', minValue: 0, maxValue: 64, defaultValue: 32, type: 'byte' },
      { index: 13, name: 'Osc3 A', description: 'Oscillator 3 attack', minValue: 0, maxValue: 32, defaultValue: 32, type: 'byte' },
      { index: 14, name: 'Osc3 D', description: 'Oscillator 3 decay', minValue: 0, maxValue: 32, defaultValue: 8, type: 'byte' },
      { index: 15, name: 'Osc3 S', description: 'Oscillator 3 sustain', minValue: 0, maxValue: 63, defaultValue: 31, type: 'byte' },
      { index: 16, name: 'Osc3 R', description: 'Oscillator 3 release', minValue: 0, maxValue: 32, defaultValue: 16, type: 'byte' },
      { index: 17, name: 'Osc2 Wave', description: 'Oscillator 2 waveform', minValue: 1, maxValue: 16, defaultValue: 1, type: 'byte' },
      { index: 18, name: 'Osc2 Freq', description: 'Oscillator 2 frequency ratio', minValue: 0, maxValue: 32, defaultValue: 1, type: 'byte' },
      { index: 19, name: 'Osc2 Fine', description: 'Oscillator 2 fine tune', minValue: 0, maxValue: 0xFE, defaultValue: 0, type: 'byte' },
      { index: 20, name: 'Osc2 Vol', description: 'Oscillator 2 volume', minValue: 0, maxValue: 64, defaultValue: 32, type: 'byte' },
      { index: 21, name: 'Osc2 A', description: 'Oscillator 2 attack', minValue: 0, maxValue: 32, defaultValue: 32, type: 'byte' },
      { index: 22, name: 'Osc2 D', description: 'Oscillator 2 decay', minValue: 0, maxValue: 32, defaultValue: 8, type: 'byte' },
      { index: 23, name: 'Osc2 S', description: 'Oscillator 2 sustain', minValue: 0, maxValue: 63, defaultValue: 31, type: 'byte' },
      { index: 24, name: 'Osc2 R', description: 'Oscillator 2 release', minValue: 0, maxValue: 32, defaultValue: 16, type: 'byte' },
      { index: 25, name: 'Osc1 Wave', description: 'Oscillator 1 waveform', minValue: 1, maxValue: 16, defaultValue: 1, type: 'byte' },
      { index: 26, name: 'Osc1 Freq', description: 'Oscillator 1 frequency ratio', minValue: 0, maxValue: 32, defaultValue: 1, type: 'byte' },
      { index: 27, name: 'Osc1 Fine', description: 'Oscillator 1 fine tune', minValue: 0, maxValue: 0xFE, defaultValue: 0, type: 'byte' },
      { index: 28, name: 'Osc1 Vol', description: 'Oscillator 1 volume', minValue: 0, maxValue: 64, defaultValue: 56, type: 'byte' },
      { index: 29, name: 'Osc1 A', description: 'Oscillator 1 attack', minValue: 0, maxValue: 32, defaultValue: 32, type: 'byte' },
      { index: 30, name: 'Osc1 D', description: 'Oscillator 1 decay', minValue: 0, maxValue: 32, defaultValue: 8, type: 'byte' },
      { index: 31, name: 'Osc1 S', description: 'Oscillator 1 sustain', minValue: 0, maxValue: 63, defaultValue: 31, type: 'byte' },
      { index: 32, name: 'Osc1 R', description: 'Oscillator 1 release', minValue: 0, maxValue: 32, defaultValue: 16, type: 'byte' },
      { index: 33, name: 'LPF Cutoff', description: 'Lowpass filter cutoff', minValue: 0, maxValue: 0x80, defaultValue: 0x6C, type: 'byte' },
      { index: 34, name: 'LPF Reso', description: 'Lowpass filter resonance', minValue: 0, maxValue: 0x80, defaultValue: 0, type: 'byte' },
      { index: 35, name: 'LPF KF', description: 'Lowpass key follow', minValue: 0, maxValue: 0x80, defaultValue: 0, type: 'byte' },
      { index: 36, name: 'LPF Env', description: 'Lowpass envelope depth', minValue: 0, maxValue: 0x80, defaultValue: 0, type: 'byte' },
      { index: 37, name: 'LPF A', description: 'Lowpass filter attack', minValue: 0, maxValue: 32, defaultValue: 32, type: 'byte' },
      { index: 38, name: 'LPF D', description: 'Lowpass filter decay', minValue: 0, maxValue: 32, defaultValue: 8, type: 'byte' },
      { index: 39, name: 'LPF S', description: 'Lowpass filter sustain', minValue: 0, maxValue: 63, defaultValue: 31, type: 'byte' },
      { index: 40, name: 'LPF R', description: 'Lowpass filter release', minValue: 0, maxValue: 32, defaultValue: 16, type: 'byte' },
    ],
  },
  [BuzzmachineType.MADBRAIN_DYNAMITE6]: {
    name: 'MadBrain Dynamite6',
    shortName: 'Dynamite6',
    author: 'MadBrain',
    type: 'generator',
    parameters: [
      { index: 0, name: 'Coarse Tune', description: 'Coarse tuning', minValue: 1, maxValue: 0xFF, defaultValue: 0x80, type: 'byte' },
      { index: 1, name: 'Fine Tune', description: 'Fine tuning', minValue: 1, maxValue: 0xFF, defaultValue: 0x80, type: 'byte' },
      { index: 2, name: 'Amplification', description: 'Output amplification', minValue: 1, maxValue: 0xFF, defaultValue: 0x20, type: 'byte' },
      { index: 3, name: 'Env Attack', description: 'Envelope attack', minValue: 0, maxValue: 0xFE, defaultValue: 4, type: 'byte' },
      { index: 4, name: 'Env Decay', description: 'Envelope decay', minValue: 1, maxValue: 0xFF, defaultValue: 0xFF, type: 'byte' },
      { index: 5, name: 'Routing', description: 'Pipe routing (0-10)', minValue: 0, maxValue: 10, defaultValue: 0, type: 'byte' },
      { index: 6, name: 'Release', description: 'Release time', minValue: 1, maxValue: 0xFFFF, defaultValue: 0xF000, type: 'word' },
      { index: 7, name: 'Pipe1 Len', description: 'Pipe 1 length', minValue: 1, maxValue: 0x3FF, defaultValue: 0xFE, type: 'word' },
      { index: 8, name: 'Pipe1 FBack', description: 'Pipe 1 feedback', minValue: 1, maxValue: 0xFFFF, defaultValue: 0xF000, type: 'word' },
      { index: 9, name: 'Pipe1 Filter', description: 'Pipe 1 filter', minValue: 1, maxValue: 0xFFFF, defaultValue: 0x4000, type: 'word' },
      { index: 10, name: 'Pipe2 Len', description: 'Pipe 2 length', minValue: 1, maxValue: 0x3FF, defaultValue: 0xFF, type: 'word' },
      { index: 11, name: 'Pipe2 FBack', description: 'Pipe 2 feedback', minValue: 1, maxValue: 0xFFFF, defaultValue: 0xF000, type: 'word' },
      { index: 12, name: 'Pipe2 Filter', description: 'Pipe 2 filter', minValue: 1, maxValue: 0xFFFF, defaultValue: 0x4000, type: 'word' },
      { index: 13, name: 'Pipe3 Len', description: 'Pipe 3 length', minValue: 1, maxValue: 0x3FF, defaultValue: 0x100, type: 'word' },
      { index: 14, name: 'Pipe3 FBack', description: 'Pipe 3 feedback', minValue: 1, maxValue: 0xFFFF, defaultValue: 0xF000, type: 'word' },
      { index: 15, name: 'Pipe3 Filter', description: 'Pipe 3 filter', minValue: 1, maxValue: 0xFFFF, defaultValue: 0x4000, type: 'word' },
      { index: 16, name: 'Pipe4 Len', description: 'Pipe 4 length', minValue: 1, maxValue: 0x3FF, defaultValue: 0x101, type: 'word' },
      { index: 17, name: 'Pipe4 FBack', description: 'Pipe 4 feedback', minValue: 1, maxValue: 0xFFFF, defaultValue: 0xF000, type: 'word' },
      { index: 18, name: 'Pipe4 Filter', description: 'Pipe 4 filter', minValue: 1, maxValue: 0xFFFF, defaultValue: 0x4000, type: 'word' },
      { index: 19, name: 'Pipe5 Len', description: 'Pipe 5 length', minValue: 1, maxValue: 0x3FF, defaultValue: 0x102, type: 'word' },
      { index: 20, name: 'Pipe5 FBack', description: 'Pipe 5 feedback', minValue: 1, maxValue: 0xFFFF, defaultValue: 0xF000, type: 'word' },
      { index: 21, name: 'Pipe5 Filter', description: 'Pipe 5 filter', minValue: 1, maxValue: 0xFFFF, defaultValue: 0x4000, type: 'word' },
      { index: 22, name: 'Pipe6 Len', description: 'Pipe 6 length', minValue: 1, maxValue: 0x3FF, defaultValue: 0x100, type: 'word' },
      { index: 23, name: 'Pipe6 FBack', description: 'Pipe 6 feedback', minValue: 1, maxValue: 0xFFFF, defaultValue: 0xF000, type: 'word' },
      { index: 24, name: 'Pipe6 Filter', description: 'Pipe 6 filter', minValue: 1, maxValue: 0xFFFF, defaultValue: 0x4000, type: 'word' },
    ],
  },
  [BuzzmachineType.MAKK_M3]: {
    name: 'Makk M3',
    shortName: 'M3',
    author: 'Makk',
    type: 'generator',
    parameters: [
      { index: 0, name: 'Osc1 Wave', description: 'Oscillator 1 waveform (0-5)', minValue: 0, maxValue: 5, defaultValue: 0, type: 'byte' },
      { index: 1, name: 'PulseWidth1', description: 'Osc 1 pulse width', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 2, name: 'Osc2 Wave', description: 'Oscillator 2 waveform (0-5)', minValue: 0, maxValue: 5, defaultValue: 0, type: 'byte' },
      { index: 3, name: 'PulseWidth2', description: 'Osc 2 pulse width', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 4, name: 'Semi Detune', description: 'Semitone detune', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 5, name: 'Fine Detune', description: 'Fine detune', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 6, name: 'Sync', description: 'Oscillator sync', minValue: 0, maxValue: 1, defaultValue: 0, type: 'byte' },
      { index: 7, name: 'Mix Type', description: 'Oscillator mix type (0-8)', minValue: 0, maxValue: 8, defaultValue: 0, type: 'byte' },
      { index: 8, name: 'Mix', description: 'Oscillator mix amount', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 9, name: 'SubOsc Wave', description: 'Sub oscillator waveform (0-4)', minValue: 0, maxValue: 4, defaultValue: 0, type: 'byte' },
      { index: 10, name: 'SubOsc Vol', description: 'Sub oscillator volume', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 11, name: 'Pitch Attack', description: 'Pitch envelope attack', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 12, name: 'Pitch Decay', description: 'Pitch envelope decay', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 13, name: 'Pitch EnvMod', description: 'Pitch envelope modulation', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 14, name: 'Glide', description: 'Portamento speed', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 15, name: 'Volume', description: 'Output volume', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 16, name: 'Amp Attack', description: 'Amp envelope attack', minValue: 0, maxValue: 127, defaultValue: 10, type: 'byte' },
      { index: 17, name: 'Amp Sustain', description: 'Amp envelope sustain', minValue: 0, maxValue: 127, defaultValue: 50, type: 'byte' },
      { index: 18, name: 'Amp Release', description: 'Amp envelope release', minValue: 0, maxValue: 127, defaultValue: 30, type: 'byte' },
      { index: 19, name: 'Filter Type', description: 'Filter type (0-3)', minValue: 0, maxValue: 3, defaultValue: 0, type: 'byte' },
      { index: 20, name: 'Cutoff', description: 'Filter cutoff frequency', minValue: 0, maxValue: 127, defaultValue: 127, type: 'byte' },
      { index: 21, name: 'Resonance', description: 'Filter resonance/bandwidth', minValue: 0, maxValue: 127, defaultValue: 32, type: 'byte' },
      { index: 22, name: 'Filter Attack', description: 'Filter envelope attack', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 23, name: 'Filter Sustain', description: 'Filter envelope sustain', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 24, name: 'Filter Release', description: 'Filter envelope release', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 25, name: 'Filter EnvMod', description: 'Filter envelope modulation', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 26, name: 'LFO1 Dest', description: 'LFO 1 destination (0-15)', minValue: 0, maxValue: 15, defaultValue: 0, type: 'byte' },
      { index: 27, name: 'LFO1 Wave', description: 'LFO 1 waveform (0-4)', minValue: 0, maxValue: 4, defaultValue: 0, type: 'byte' },
      { index: 28, name: 'LFO1 Freq', description: 'LFO 1 frequency', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 29, name: 'LFO1 Amount', description: 'LFO 1 amount', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 30, name: 'LFO2 Dest', description: 'LFO 2 destination (0-15)', minValue: 0, maxValue: 15, defaultValue: 0, type: 'byte' },
      { index: 31, name: 'LFO2 Wave', description: 'LFO 2 waveform (0-4)', minValue: 0, maxValue: 4, defaultValue: 0, type: 'byte' },
      { index: 32, name: 'LFO2 Freq', description: 'LFO 2 frequency', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 33, name: 'LFO2 Amount', description: 'LFO 2 amount', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
    ],
  },
  [BuzzmachineType.MAKK_M4]: {
    name: 'Makk M4',
    shortName: 'M4',
    author: 'Makk',
    type: 'generator',
    parameters: [
      { index: 0, name: 'Osc1 Wave', description: 'Oscillator 1 waveform', minValue: 0, maxValue: 47, defaultValue: 0, type: 'byte' },
      { index: 1, name: 'Osc1 PW', description: 'Osc 1 pulse width', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 2, name: 'Osc2 Wave', description: 'Oscillator 2 waveform', minValue: 0, maxValue: 47, defaultValue: 0, type: 'byte' },
      { index: 3, name: 'Osc2 PW', description: 'Osc 2 pulse width', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 4, name: 'Semi Detune', description: 'Semitone detune', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 5, name: 'Fine Detune', description: 'Fine detune', minValue: 0, maxValue: 127, defaultValue: 0x50, type: 'byte' },
      { index: 6, name: 'Sync', description: 'Oscillator sync', minValue: 0, maxValue: 1, defaultValue: 0, type: 'byte' },
      { index: 7, name: 'Mix Type', description: 'Oscillator mix type (0-7)', minValue: 0, maxValue: 7, defaultValue: 0, type: 'byte' },
      { index: 8, name: 'Mix', description: 'Oscillator mix amount', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 9, name: 'SubOsc Wave', description: 'Sub oscillator waveform', minValue: 0, maxValue: 46, defaultValue: 0, type: 'byte' },
      { index: 10, name: 'SubOsc Vol', description: 'Sub oscillator volume', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 11, name: 'Pitch Attack', description: 'Pitch envelope attack', minValue: 0, maxValue: 127, defaultValue: 7, type: 'byte' },
      { index: 12, name: 'Pitch Decay', description: 'Pitch envelope decay', minValue: 0, maxValue: 127, defaultValue: 0x0B, type: 'byte' },
      { index: 13, name: 'Pitch EnvMod', description: 'Pitch envelope modulation', minValue: 0, maxValue: 127, defaultValue: 96, type: 'byte' },
      { index: 14, name: 'Glide', description: 'Portamento speed', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 15, name: 'Amp Attack', description: 'Amp envelope attack', minValue: 0, maxValue: 127, defaultValue: 5, type: 'byte' },
      { index: 16, name: 'Amp Sustain', description: 'Amp envelope sustain', minValue: 0, maxValue: 127, defaultValue: 0x10, type: 'byte' },
      { index: 17, name: 'Amp Release', description: 'Amp envelope release', minValue: 0, maxValue: 127, defaultValue: 0x20, type: 'byte' },
      { index: 18, name: 'Filter Type', description: 'Filter type (0-5)', minValue: 0, maxValue: 5, defaultValue: 2, type: 'byte' },
      { index: 19, name: 'Cutoff', description: 'Filter cutoff frequency', minValue: 0, maxValue: 127, defaultValue: 32, type: 'byte' },
      { index: 20, name: 'Resonance', description: 'Filter resonance/bandwidth', minValue: 0, maxValue: 127, defaultValue: 32, type: 'byte' },
      { index: 21, name: 'Filter Attack', description: 'Filter envelope attack', minValue: 0, maxValue: 127, defaultValue: 7, type: 'byte' },
      { index: 22, name: 'Filter Sustain', description: 'Filter envelope sustain', minValue: 0, maxValue: 127, defaultValue: 0x0E, type: 'byte' },
      { index: 23, name: 'Filter Release', description: 'Filter envelope release', minValue: 0, maxValue: 127, defaultValue: 0x0F, type: 'byte' },
      { index: 24, name: 'Filter EnvMod', description: 'Filter envelope modulation', minValue: 0, maxValue: 127, defaultValue: 96, type: 'byte' },
      { index: 25, name: 'LFO1 Dest', description: 'LFO 1 destination (0-15)', minValue: 0, maxValue: 15, defaultValue: 0, type: 'byte' },
      { index: 26, name: 'LFO1 Wave', description: 'LFO 1 waveform (0-4)', minValue: 0, maxValue: 4, defaultValue: 0, type: 'byte' },
      { index: 27, name: 'LFO1 Freq', description: 'LFO 1 frequency', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 28, name: 'LFO1 Amount', description: 'LFO 1 amount', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 29, name: 'LFO1 Ph Diff', description: 'LFO 1 phase difference', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
      { index: 30, name: 'LFO2 Dest', description: 'LFO 2 destination (0-15)', minValue: 0, maxValue: 15, defaultValue: 0, type: 'byte' },
      { index: 31, name: 'LFO2 Wave', description: 'LFO 2 waveform (0-4)', minValue: 0, maxValue: 4, defaultValue: 0, type: 'byte' },
      { index: 32, name: 'LFO2 Freq', description: 'LFO 2 frequency', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 33, name: 'LFO2 Amount', description: 'LFO 2 amount', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 34, name: 'LFO2 Ph Diff', description: 'LFO 2 phase difference', minValue: 0, maxValue: 127, defaultValue: 0x40, type: 'byte' },
    ],
  },
  // New distortion/saturation effects
  [BuzzmachineType.ELAK_DIST2]: {
    name: 'Elak Dist2',
    shortName: 'Dist2',
    author: 'Elak',
    type: 'effect',
    parameters: [
      { index: 0, name: 'ScatterInt', description: 'Scatter interval', minValue: 0, maxValue: 254, defaultValue: 1, type: 'byte' },
      { index: 1, name: 'ScatterAmount', description: 'Scatter amount', minValue: 1, maxValue: 65534, defaultValue: 1, type: 'word' },
      { index: 2, name: 'KindOf', description: 'Distortion type (1-3)', minValue: 1, maxValue: 3, defaultValue: 1, type: 'byte' },
    ],
  },
  [BuzzmachineType.JESKOLA_DISTORTION]: {
    name: 'Jeskola Distortion',
    shortName: 'JDist',
    author: 'Jeskola',
    type: 'effect',
    parameters: [
      { index: 0, name: '+Threshold', description: 'Positive threshold', minValue: 0, maxValue: 65534, defaultValue: 512, type: 'word' },
      { index: 1, name: '+Clamp', description: 'Positive clamp', minValue: 0, maxValue: 65534, defaultValue: 4096, type: 'word' },
      { index: 2, name: '-Threshold', description: 'Negative threshold', minValue: 0, maxValue: 65534, defaultValue: 512, type: 'word' },
      { index: 3, name: '-Clamp', description: 'Negative clamp', minValue: 0, maxValue: 65534, defaultValue: 4096, type: 'word' },
      { index: 4, name: 'Amount', description: 'Distortion amount', minValue: 0, maxValue: 127, defaultValue: 127, type: 'byte' },
    ],
  },
  [BuzzmachineType.GEONIK_OVERDRIVE]: {
    name: 'Geonik Overdrive',
    shortName: 'Overdrive',
    author: 'Geonik',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Drive', description: 'Drive amount', minValue: 48, maxValue: 96, defaultValue: 81, type: 'byte' },
      { index: 1, name: 'Asymmetry', description: 'Asymmetry', minValue: 0, maxValue: 128, defaultValue: 44, type: 'byte' },
      { index: 2, name: 'CutOff', description: 'Filter cutoff', minValue: 0, maxValue: 128, defaultValue: 108, type: 'byte' },
      { index: 3, name: 'Emphasis', description: 'Filter emphasis', minValue: 0, maxValue: 128, defaultValue: 95, type: 'byte' },
    ],
  },
  [BuzzmachineType.GRAUE_SOFTSAT]: {
    name: 'Graue SoftSat',
    shortName: 'SoftSat',
    author: 'Graue',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Threshold', description: 'Saturation threshold', minValue: 16, maxValue: 32768, defaultValue: 32768, type: 'word' },
      { index: 1, name: 'Hardness', description: 'Saturation hardness', minValue: 1, maxValue: 2048, defaultValue: 1024, type: 'word' },
    ],
  },
  [BuzzmachineType.WHITENOISE_STEREODIST]: {
    name: 'WhiteNoise StereoDist',
    shortName: 'StereoDist',
    author: 'WhiteNoise',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Drive', description: 'Drive amount', minValue: 0, maxValue: 96, defaultValue: 32, type: 'byte' },
      { index: 1, name: 'Top', description: 'Top clip level', minValue: 0, maxValue: 248, defaultValue: 254, type: 'byte' },
      { index: 2, name: 'Bottom', description: 'Bottom clip level', minValue: 0, maxValue: 248, defaultValue: 254, type: 'byte' },
      { index: 3, name: 'Top Mode', description: 'Top clipping mode (0-5)', minValue: 0, maxValue: 5, defaultValue: 0, type: 'byte' },
      { index: 4, name: 'Bottom Mode', description: 'Bottom clipping mode (0-5)', minValue: 0, maxValue: 5, defaultValue: 0, type: 'byte' },
      { index: 5, name: 'Lowpass', description: 'Lowpass filter', minValue: 0, maxValue: 1000, defaultValue: 1000, type: 'word' },
      { index: 6, name: 'Hipass', description: 'Highpass filter', minValue: 0, maxValue: 1000, defaultValue: 0, type: 'word' },
      { index: 7, name: 'Dry', description: 'Dry output level', minValue: 0, maxValue: 96, defaultValue: 48, type: 'byte' },
      { index: 8, name: 'Wet', description: 'Wet output level', minValue: 0, maxValue: 96, defaultValue: 48, type: 'byte' },
    ],
  },
  // Filters
  [BuzzmachineType.CYANPHASE_NOTCH]: {
    name: 'CyanPhase Notch',
    shortName: 'Notch',
    author: 'CyanPhase',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Fixed1 Freq', description: 'Fixed notch 1 frequency', minValue: 5, maxValue: 21500, defaultValue: 2000, type: 'word' },
      { index: 1, name: 'Fixed1 BW', description: 'Fixed notch 1 bandwidth', minValue: 2, maxValue: 2500, defaultValue: 100, type: 'word' },
      { index: 2, name: 'Fixed1 Inertia', description: 'Fixed notch 1 inertia', minValue: 1, maxValue: 65534, defaultValue: 2000, type: 'word' },
      { index: 3, name: 'Fixed2 Freq', description: 'Fixed notch 2 frequency', minValue: 5, maxValue: 21500, defaultValue: 2000, type: 'word' },
      { index: 4, name: 'Fixed2 BW', description: 'Fixed notch 2 bandwidth', minValue: 2, maxValue: 2500, defaultValue: 100, type: 'word' },
      { index: 5, name: 'Fixed2 Inertia', description: 'Fixed notch 2 inertia', minValue: 1, maxValue: 65534, defaultValue: 2000, type: 'word' },
      { index: 6, name: 'LFO Freq1', description: 'LFO start frequency', minValue: 5, maxValue: 21500, defaultValue: 2000, type: 'word' },
      { index: 7, name: 'LFO Freq2', description: 'LFO end frequency', minValue: 5, maxValue: 21500, defaultValue: 2000, type: 'word' },
      { index: 8, name: 'LFO Rate', description: 'LFO rate', minValue: 1, maxValue: 65534, defaultValue: 2000, type: 'word' },
      { index: 9, name: 'LFO BW1', description: 'LFO start bandwidth', minValue: 2, maxValue: 2500, defaultValue: 100, type: 'word' },
      { index: 10, name: 'LFO BW2', description: 'LFO end bandwidth', minValue: 2, maxValue: 2500, defaultValue: 100, type: 'word' },
    ],
  },
  [BuzzmachineType.Q_ZFILTER]: {
    name: 'Q Zfilter',
    shortName: 'Zfilter',
    author: 'Q',
    type: 'effect',
    parameters: [
      { index: 0, name: 'b0', description: 'Filter coefficient b0', minValue: 0, maxValue: 65534, defaultValue: 49152, type: 'word' },
      { index: 1, name: 'a1', description: 'Filter coefficient a1', minValue: 0, maxValue: 65534, defaultValue: 65534, type: 'word' },
      { index: 2, name: 'b1', description: 'Filter coefficient b1', minValue: 0, maxValue: 65534, defaultValue: 32767, type: 'word' },
      { index: 3, name: 'a2', description: 'Filter coefficient a2', minValue: 0, maxValue: 65534, defaultValue: 32767, type: 'word' },
      { index: 4, name: 'b2', description: 'Filter coefficient b2', minValue: 0, maxValue: 65534, defaultValue: 16384, type: 'word' },
    ],
  },
  [BuzzmachineType.FSM_PHILTA]: {
    name: 'FSM Philta',
    shortName: 'Philta',
    author: 'FSM',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Cutoff', description: 'Filter cutoff', minValue: 0, maxValue: 240, defaultValue: 120, type: 'byte' },
      { index: 1, name: 'Resonance', description: 'Filter resonance', minValue: 0, maxValue: 240, defaultValue: 120, type: 'byte' },
      { index: 2, name: 'Filter', description: 'Filter type (0-7)', minValue: 0, maxValue: 7, defaultValue: 6, type: 'byte' },
      { index: 3, name: 'LFO Rate', description: 'LFO rate', minValue: 0, maxValue: 254, defaultValue: 30, type: 'byte' },
      { index: 4, name: 'LFO Mod', description: 'LFO modulation depth', minValue: 0, maxValue: 240, defaultValue: 60, type: 'byte' },
      { index: 5, name: 'LFO Shape', description: 'LFO waveform shape (0-16)', minValue: 0, maxValue: 16, defaultValue: 0, type: 'byte' },
      { index: 6, name: 'Inertia', description: 'Parameter inertia', minValue: 0, maxValue: 60, defaultValue: 10, type: 'byte' },
    ],
  },
  // Delay/Reverb
  [BuzzmachineType.JESKOLA_DELAY]: {
    name: 'Jeskola Delay',
    shortName: 'JDelay',
    author: 'Jeskola',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Length', description: 'Delay length', minValue: 1, maxValue: 32768, defaultValue: 3, type: 'word' },
      { index: 1, name: 'Length Unit', description: 'Length unit (0-3)', minValue: 0, maxValue: 3, defaultValue: 0, type: 'byte' },
      { index: 2, name: 'Feedback', description: 'Feedback amount', minValue: 0, maxValue: 128, defaultValue: 96, type: 'byte' },
      { index: 3, name: 'Wet Out', description: 'Wet output level', minValue: 0, maxValue: 128, defaultValue: 48, type: 'byte' },
    ],
  },
  [BuzzmachineType.JESKOLA_CROSSDELAY]: {
    name: 'Jeskola CrossDelay',
    shortName: 'CrossDelay',
    author: 'Jeskola',
    type: 'effect',
    parameters: [
      { index: 0, name: 'L Length', description: 'Left delay length', minValue: 1, maxValue: 32768, defaultValue: 3, type: 'word' },
      { index: 1, name: 'R Length', description: 'Right delay length', minValue: 1, maxValue: 32768, defaultValue: 3, type: 'word' },
      { index: 2, name: 'Length Unit', description: 'Length unit (0-3)', minValue: 0, maxValue: 3, defaultValue: 0, type: 'byte' },
      { index: 3, name: 'Feedback', description: 'Feedback amount', minValue: 0, maxValue: 128, defaultValue: 96, type: 'byte' },
      { index: 4, name: 'Wet Out', description: 'Wet output level', minValue: 0, maxValue: 128, defaultValue: 48, type: 'byte' },
    ],
  },
  [BuzzmachineType.JESKOLA_FREEVERB]: {
    name: 'Jeskola Freeverb',
    shortName: 'Freeverb',
    author: 'Jeskola',
    type: 'effect',
    parameters: [
      { index: 0, name: 'RevTime', description: 'Reverb time', minValue: 0, maxValue: 127, defaultValue: 40, type: 'byte' },
      { index: 1, name: 'HiDamp', description: 'High frequency damping', minValue: 0, maxValue: 127, defaultValue: 50, type: 'byte' },
      { index: 2, name: 'PreDelay', description: 'Pre-delay', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 3, name: 'LowCut', description: 'Low cut frequency', minValue: 0, maxValue: 127, defaultValue: 0, type: 'byte' },
      { index: 4, name: 'HiCut', description: 'High cut frequency', minValue: 0, maxValue: 127, defaultValue: 127, type: 'byte' },
      { index: 5, name: 'RevOut', description: 'Reverb output level', minValue: 0, maxValue: 127, defaultValue: 80, type: 'byte' },
      { index: 6, name: 'DryOut', description: 'Dry output level', minValue: 0, maxValue: 127, defaultValue: 127, type: 'byte' },
    ],
  },
  [BuzzmachineType.FSM_PANZERDELAY]: {
    name: 'FSM PanzerDelay',
    shortName: 'PanzerDelay',
    author: 'FSM',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Dry Amp', description: 'Dry amplitude', minValue: 0, maxValue: 240, defaultValue: 240, type: 'byte' },
      { index: 1, name: 'Filter Type', description: 'Filter type (0-3)', minValue: 0, maxValue: 3, defaultValue: 0, type: 'byte' },
      { index: 2, name: 'Cutoff', description: 'Filter cutoff', minValue: 0, maxValue: 240, defaultValue: 120, type: 'byte' },
      { index: 3, name: 'Resonance', description: 'Filter resonance', minValue: 0, maxValue: 240, defaultValue: 120, type: 'byte' },
      { index: 4, name: 'L Delay Len', description: 'Left delay length', minValue: 1, maxValue: 20000, defaultValue: 3, type: 'word' },
      { index: 5, name: 'R Delay Len', description: 'Right delay length', minValue: 1, maxValue: 20000, defaultValue: 3, type: 'word' },
      { index: 6, name: 'Tap Amp', description: 'Tap amplitude', minValue: 0, maxValue: 240, defaultValue: 240, type: 'byte' },
      { index: 7, name: 'FB Amp', description: 'Feedback amplitude', minValue: 0, maxValue: 239, defaultValue: 150, type: 'byte' },
      { index: 8, name: 'FB PingPong', description: 'Feedback ping-pong', minValue: 0, maxValue: 1, defaultValue: 0, type: 'byte' },
    ],
  },
  // Chorus/Modulation
  [BuzzmachineType.FSM_CHORUS]: {
    name: 'FSM Chorus',
    shortName: 'Chorus',
    author: 'FSM',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Dry Out', description: 'Dry output level', minValue: 0, maxValue: 240, defaultValue: 240, type: 'byte' },
      { index: 1, name: 'Min Delay', description: 'Minimum delay', minValue: 1, maxValue: 100, defaultValue: 20, type: 'byte' },
      { index: 2, name: 'Modulation', description: 'Modulation depth', minValue: 1, maxValue: 100, defaultValue: 30, type: 'byte' },
      { index: 3, name: 'LFO Rate', description: 'LFO rate', minValue: 0, maxValue: 240, defaultValue: 150, type: 'byte' },
      { index: 4, name: 'Wet Out', description: 'Wet output level', minValue: 0, maxValue: 240, defaultValue: 240, type: 'byte' },
      { index: 5, name: 'Feedback', description: 'Feedback amount', minValue: 0, maxValue: 128, defaultValue: 64, type: 'byte' },
    ],
  },
  [BuzzmachineType.FSM_CHORUS2]: {
    name: 'FSM Chorus2',
    shortName: 'Chorus2',
    author: 'FSM',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Min Delay', description: 'Minimum delay', minValue: 0, maxValue: 240, defaultValue: 80, type: 'byte' },
      { index: 1, name: 'Mod Depth', description: 'Modulation depth', minValue: 0, maxValue: 240, defaultValue: 90, type: 'byte' },
      { index: 2, name: 'Mod Rate', description: 'Modulation rate', minValue: 0, maxValue: 240, defaultValue: 60, type: 'byte' },
      { index: 3, name: 'Fatness', description: 'Fatness (1-6)', minValue: 1, maxValue: 6, defaultValue: 3, type: 'byte' },
      { index: 4, name: 'Stereo', description: 'Stereo width', minValue: 0, maxValue: 240, defaultValue: 120, type: 'byte' },
    ],
  },
  [BuzzmachineType.WHITENOISE_WHITECHORUS]: {
    name: 'WhiteNoise WhiteChorus',
    shortName: 'WhiteChorus',
    author: 'WhiteNoise',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Voices', description: 'Number of voices (1-3)', minValue: 1, maxValue: 3, defaultValue: 1, type: 'byte' },
      { index: 1, name: 'LFO Shape', description: 'LFO waveform shape (0-1)', minValue: 0, maxValue: 1, defaultValue: 0, type: 'byte' },
      { index: 2, name: 'Min Delay', description: 'Minimum delay', minValue: 0, maxValue: 200, defaultValue: 1, type: 'byte' },
      { index: 3, name: 'Delay Mod', description: 'Delay modulation', minValue: 0, maxValue: 200, defaultValue: 5, type: 'byte' },
      { index: 4, name: 'Rate', description: 'LFO rate', minValue: 0, maxValue: 127, defaultValue: 10, type: 'byte' },
      { index: 5, name: 'Phase Diff', description: 'Phase difference', minValue: 1, maxValue: 23, defaultValue: 3, type: 'byte' },
      { index: 6, name: 'Stereo Phase', description: 'Stereo phase offset', minValue: 0, maxValue: 23, defaultValue: 6, type: 'byte' },
      { index: 7, name: 'Delay Spread', description: 'Delay spread', minValue: 0, maxValue: 10, defaultValue: 0, type: 'byte' },
      { index: 8, name: 'Feedback', description: 'Feedback amount', minValue: 1, maxValue: 199, defaultValue: 150, type: 'byte' },
      { index: 9, name: 'Mix', description: 'Dry/wet mix', minValue: 0, maxValue: 127, defaultValue: 64, type: 'byte' },
    ],
  },
  [BuzzmachineType.BIGYO_FREQUENCYSHIFTER]: {
    name: 'Bigyo FrequencyShifter',
    shortName: 'FreqShift',
    author: 'Bigyo',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Frequency', description: 'Shift frequency', minValue: 0, maxValue: 65534, defaultValue: 0, type: 'word' },
      { index: 1, name: 'Left Direction', description: 'Left channel direction (0-2)', minValue: 0, maxValue: 2, defaultValue: 0, type: 'byte' },
      { index: 2, name: 'Right Direction', description: 'Right channel direction (0-2)', minValue: 0, maxValue: 2, defaultValue: 0, type: 'byte' },
    ],
  },
  // Dynamics
  [BuzzmachineType.GEONIK_COMPRESSOR]: {
    name: 'Geonik Compressor',
    shortName: 'Compressor',
    author: 'Geonik',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Threshold', description: 'Compressor threshold', minValue: 0, maxValue: 128, defaultValue: 92, type: 'byte' },
      { index: 1, name: 'Ratio', description: 'Compression ratio', minValue: 0, maxValue: 240, defaultValue: 20, type: 'byte' },
      { index: 2, name: 'Attack', description: 'Attack time', minValue: 5, maxValue: 8000, defaultValue: 10, type: 'word' },
      { index: 3, name: 'Release', description: 'Release time', minValue: 30, maxValue: 8000, defaultValue: 2000, type: 'word' },
      { index: 4, name: 'Gain', description: 'Makeup gain', minValue: 0, maxValue: 128, defaultValue: 6, type: 'byte' },
    ],
  },
  [BuzzmachineType.LD_SLIMIT]: {
    name: 'Ld SLimit',
    shortName: 'SLimit',
    author: 'Ld',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Input Gain', description: 'Input gain', minValue: 0, maxValue: 128, defaultValue: 128, type: 'byte' },
      { index: 1, name: 'Threshold', description: 'Limiter threshold', minValue: 0, maxValue: 128, defaultValue: 128, type: 'byte' },
      { index: 2, name: 'Output', description: 'Output level', minValue: 0, maxValue: 128, defaultValue: 128, type: 'byte' },
      { index: 3, name: 'Release', description: 'Release time', minValue: 0, maxValue: 128, defaultValue: 32, type: 'byte' },
    ],
  },
  [BuzzmachineType.OOMEK_EXCITER]: {
    name: 'Oomek Exciter',
    shortName: 'Exciter',
    author: 'Oomek',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Drive', description: 'Exciter drive', minValue: 1, maxValue: 240, defaultValue: 60, type: 'byte' },
      { index: 1, name: 'Pre Cut', description: 'Pre-filter cutoff', minValue: 1, maxValue: 239, defaultValue: 128, type: 'byte' },
      { index: 2, name: 'Post Cut', description: 'Post-filter cutoff', minValue: 1, maxValue: 239, defaultValue: 60, type: 'byte' },
      { index: 3, name: 'Amount', description: 'Exciter amount', minValue: 0, maxValue: 240, defaultValue: 60, type: 'byte' },
    ],
  },
  [BuzzmachineType.OOMEK_MASTERIZER]: {
    name: 'Oomek Masterizer',
    shortName: 'Masterizer',
    author: 'Oomek',
    type: 'master',
    parameters: [
      { index: 0, name: 'Input Gain', description: 'Input gain', minValue: 0, maxValue: 240, defaultValue: 60, type: 'byte' },
      { index: 1, name: 'Threshold Lo', description: 'Low band threshold', minValue: 0, maxValue: 240, defaultValue: 120, type: 'byte' },
      { index: 2, name: 'Threshold Mid', description: 'Mid band threshold', minValue: 0, maxValue: 240, defaultValue: 120, type: 'byte' },
      { index: 3, name: 'Threshold Hi', description: 'High band threshold', minValue: 0, maxValue: 240, defaultValue: 120, type: 'byte' },
      { index: 4, name: 'Decay Lo', description: 'Low band decay', minValue: 10, maxValue: 240, defaultValue: 50, type: 'byte' },
      { index: 5, name: 'Decay Mid', description: 'Mid band decay', minValue: 10, maxValue: 240, defaultValue: 50, type: 'byte' },
      { index: 6, name: 'Decay Hi', description: 'High band decay', minValue: 10, maxValue: 240, defaultValue: 50, type: 'byte' },
      { index: 7, name: 'Lo|Mid Split', description: 'Low/mid crossover', minValue: 2, maxValue: 112, defaultValue: 17, type: 'byte' },
      { index: 8, name: 'Mid|Hi Split', description: 'Mid/high crossover', minValue: 0, maxValue: 240, defaultValue: 18, type: 'byte' },
      { index: 9, name: 'Knee', description: 'Compressor knee', minValue: 0, maxValue: 32, defaultValue: 16, type: 'byte' },
    ],
  },
  [BuzzmachineType.DEDACODE_STEREOGAIN]: {
    name: 'DedaCode StereoGain',
    shortName: 'StereoGain',
    author: 'DedaCode',
    type: 'effect',
    parameters: [
      { index: 0, name: 'Volume', description: 'Master volume (0-600%)', minValue: 0, maxValue: 600, defaultValue: 100, type: 'word' },
      { index: 1, name: 'Right', description: 'Right channel level', minValue: 0, maxValue: 100, defaultValue: 100, type: 'byte' },
      { index: 2, name: 'Left', description: 'Left channel level', minValue: 0, maxValue: 100, defaultValue: 100, type: 'byte' },
    ],
  },
  // Additional generators
  [BuzzmachineType.CYANPHASE_DTMF]: {
    name: 'CyanPhase DTMF',
    shortName: 'DTMF',
    author: 'CyanPhase',
    type: 'generator',
    parameters: [
      { index: 0, name: 'Dial Number', description: 'DTMF dial number (0-11)', minValue: 0, maxValue: 11, defaultValue: 0, type: 'byte' },
      { index: 1, name: 'Sustain', description: 'Tone sustain time', minValue: 0, maxValue: 0xFE, defaultValue: 40, type: 'byte' },
      { index: 2, name: 'Twist', description: 'Twist in dB', minValue: 0, maxValue: 40, defaultValue: 0, type: 'byte' },
      { index: 3, name: 'Volume', description: 'Output volume', minValue: 0, maxValue: 0xFE, defaultValue: 0xC0, type: 'byte' },
    ],
  },
  [BuzzmachineType.ELENZIL_FREQUENCYBOMB]: {
    name: 'Elenzil FrequencyBomb',
    shortName: 'FreqBomb',
    author: 'Elenzil',
    type: 'generator',
    parameters: [
      { index: 0, name: 'Freq x100', description: 'Target frequency (Hz x 100)', minValue: 1, maxValue: 65534, defaultValue: 5000, type: 'word' },
      { index: 1, name: 'LFO Period', description: 'LFO period (seconds / 100)', minValue: 1, maxValue: 65534, defaultValue: 1000, type: 'word' },
      { index: 2, name: 'LFO Amount', description: 'LFO amount (Hz x 1000)', minValue: 1, maxValue: 65534, defaultValue: 0, type: 'word' },
      { index: 3, name: 'Wave', description: 'Waveform (0=sine, 1=saw, 2=square, 3=triangle, 4=noise)', minValue: 0, maxValue: 4, defaultValue: 0, type: 'byte' },
    ],
  },
};

/**
 * Singleton engine for managing buzzmachine WASM modules
 */
export class BuzzmachineEngine {
  private static instance: BuzzmachineEngine | null = null;

  private isLoaded = false;
  private initPromise: Promise<void> | null = null;
  public workletNode: AudioWorkletNode | null = null;
  public nativeContext: AudioContext | null = null;

  private constructor() {}

  public static getInstance(): BuzzmachineEngine {
    if (!BuzzmachineEngine.instance) {
      BuzzmachineEngine.instance = new BuzzmachineEngine();
    }
    return BuzzmachineEngine.instance;
  }

  /**
   * Initialize the buzzmachine engine with an AudioContext
   */
  public async init(context: AudioContext): Promise<void> {
    if (this.isLoaded) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit(context);
    return this.initPromise;
  }

  private async doInit(context: AudioContext): Promise<void> {
    try {
      // Extract native context from Tone.js wrapper
      // Try direct property access first (matches Open303Synth pattern),
      // then fall back to BFS search via getNativeContext
      const ctx = context as unknown as Record<string, unknown>;
      const nativeCtx = (ctx.rawContext || ctx._context || getNativeContext(context)) as AudioContext;
      this.nativeContext = nativeCtx;

      // Check if we got a valid context with AudioWorklet
      if (!nativeCtx || !nativeCtx.audioWorklet) {
        this.initPromise = null; // Allow retry on later call
        throw new Error('AudioWorklet not available on this context');
      }

      // Ensure context is running - try to resume, then wait up to 2s
      if (nativeCtx.state !== 'running') {
        try { await nativeCtx.resume(); } catch { /* ignore */ }
        if ((nativeCtx.state as string) !== 'running') {
          const started = await Promise.race([
            new Promise<boolean>((resolve) => {
              const check = () => {
                if (nativeCtx.state === 'running') resolve(true);
                else setTimeout(check, 100);
              };
              setTimeout(check, 100);
            }),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))
          ]);
          if (!started) {
            this.initPromise = null; // Allow retry on later call
            throw new Error(`AudioContext not running (state: ${nativeCtx.state}) — user gesture required`);
          }
        }
      }

      // Register AudioWorklet module (use BASE_URL for GitHub Pages compatibility)
      const baseUrl = import.meta.env.BASE_URL || '/';
      const cacheBuster = `?v=${Date.now()}`;
      await nativeCtx.audioWorklet.addModule(`${baseUrl}Buzzmachine.worklet.js${cacheBuster}`);
      console.log('[BuzzmachineEngine] AudioWorklet registered');

      this.isLoaded = true;
    } catch (err) {
      console.error('[BuzzmachineEngine] Init failed:', err);
      this.initPromise = null; // Allow retry on failure
      throw err;
    }
  }

  /**
   * Check if engine is initialized
   */
  public isInitialized(): boolean {
    return this.isLoaded;
  }

  /**
   * Create an AudioWorkletNode for a specific buzzmachine type
   */
  public async createMachineNode(
    context: AudioContext,
    machineType: BuzzmachineType
  ): Promise<AudioWorkletNode> {
    if (!this.isLoaded) {
      await this.init(context);
    }

    // Use native AudioWorkletNode directly (addModule was called on the native context)
    const ctx = context as unknown as Record<string, unknown>;
    const nativeCtx = (ctx.rawContext || ctx._context || getNativeContext(context)) as AudioContext;
    const workletNode = new AudioWorkletNode(nativeCtx, 'buzzmachine-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // Load WASM module into worklet
    await this.loadMachineWasm(workletNode, machineType);

    return workletNode;
  }

  /**
   * Load WASM module for a specific machine type
   */
  private async loadMachineWasm(
    workletNode: AudioWorkletNode,
    machineType: BuzzmachineType
  ): Promise<void> {
    const machineFile = this.getMachineFilename(machineType);

    // Fetch JS and WASM files (use BASE_URL for GitHub Pages compatibility)
    const baseUrl = import.meta.env.BASE_URL || '/';
    const [jsResponse, wasmResponse] = await Promise.all([
      fetch(`${baseUrl}buzzmachines/${machineFile}.js`),
      fetch(`${baseUrl}buzzmachines/${machineFile}.wasm`),
    ]);

    if (!jsResponse.ok || !wasmResponse.ok) {
      throw new Error(`Failed to load buzzmachine: ${machineType}`);
    }

    const jsCode = await jsResponse.text();
    const wasmBinary = await wasmResponse.arrayBuffer();

    // Send to worklet
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Buzzmachine init timeout'));
      }, 15000);

      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'initialized') {
          clearTimeout(timeout);
          console.log(`[BuzzmachineEngine] ${machineType} initialized`);
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(event.data.error));
        }
      };

      workletNode.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode,
        machineType,
      });
    });
  }

  /**
   * Get filename for a machine type
   */
  private getMachineFilename(machineType: BuzzmachineType): string {
    const filenameMap: Record<BuzzmachineType, string> = {
      // Distortion/Saturation
      [BuzzmachineType.ARGURU_DISTORTION]: 'Arguru_Distortion',
      [BuzzmachineType.ELAK_DIST2]: 'Elak_Dist2',
      [BuzzmachineType.JESKOLA_DISTORTION]: 'Jeskola_Distortion',
      [BuzzmachineType.GEONIK_OVERDRIVE]: 'Geonik_Overdrive',
      [BuzzmachineType.GRAUE_SOFTSAT]: 'Graue_SoftSat',
      [BuzzmachineType.WHITENOISE_STEREODIST]: 'WhiteNoise_StereoDist',
      // Filters
      [BuzzmachineType.ELAK_SVF]: 'Elak_SVF',
      [BuzzmachineType.CYANPHASE_NOTCH]: 'CyanPhase_Notch',
      [BuzzmachineType.Q_ZFILTER]: 'Q_Zfilter',
      [BuzzmachineType.FSM_PHILTA]: 'FSM_Philta',
      // Delay/Reverb
      [BuzzmachineType.JESKOLA_DELAY]: 'Jeskola_Delay',
      [BuzzmachineType.JESKOLA_CROSSDELAY]: 'Jeskola_CrossDelay',
      [BuzzmachineType.JESKOLA_FREEVERB]: 'Jeskola_Freeverb',
      [BuzzmachineType.FSM_PANZERDELAY]: 'FSM_PanzerDelay',
      // Chorus/Modulation
      [BuzzmachineType.FSM_CHORUS]: 'FSM_Chorus',
      [BuzzmachineType.FSM_CHORUS2]: 'FSM_Chorus2',
      [BuzzmachineType.WHITENOISE_WHITECHORUS]: 'WhiteNoise_WhiteChorus',
      [BuzzmachineType.BIGYO_FREQUENCYSHIFTER]: 'Bigyo_FrequencyShifter',
      // Dynamics
      [BuzzmachineType.GEONIK_COMPRESSOR]: 'Geonik_Compressor',
      [BuzzmachineType.LD_SLIMIT]: 'Ld_SLimit',
      [BuzzmachineType.OOMEK_EXCITER]: 'Oomek_Exciter',
      [BuzzmachineType.OOMEK_MASTERIZER]: 'Oomek_Masterizer',
      [BuzzmachineType.DEDACODE_STEREOGAIN]: 'DedaCode_StereoGain',
      // Generators
      [BuzzmachineType.FSM_KICK]: 'FSM_Kick',
      [BuzzmachineType.FSM_KICKXP]: 'FSM_KickXP',
      [BuzzmachineType.JESKOLA_TRILOK]: 'Jeskola_Trilok',
      [BuzzmachineType.JESKOLA_NOISE]: 'Jeskola_Noise',
      [BuzzmachineType.OOMEK_AGGRESSOR]: 'Oomek_Aggressor',
      [BuzzmachineType.OOMEK_AGGRESSOR_DF]: 'Oomek_Aggressor_DF',
      [BuzzmachineType.MADBRAIN_4FM2F]: 'MadBrain_4FM2F',
      [BuzzmachineType.MADBRAIN_DYNAMITE6]: 'MadBrain_Dynamite6',
      [BuzzmachineType.MAKK_M3]: 'Makk_M3',
      [BuzzmachineType.MAKK_M4]: 'Makk_M4',
      [BuzzmachineType.CYANPHASE_DTMF]: 'CyanPhase_DTMF',
      [BuzzmachineType.ELENZIL_FREQUENCYBOMB]: 'Elenzil_FrequencyBomb',
    };

    const filename = filenameMap[machineType];
    if (!filename) {
      throw new Error(`Unknown machine type: ${machineType}`);
    }
    return filename;
  }

  /**
   * Set a parameter value on a machine
   */
  public setParameter(
    workletNode: AudioWorkletNode,
    paramIndex: number,
    value: number
  ): void {
    workletNode.port.postMessage({
      type: 'setParameter',
      paramIndex,
      paramValue: value,
    });
  }

  /**
   * Stop a machine (release all notes)
   */
  public stop(workletNode: AudioWorkletNode): void {
    workletNode.port.postMessage({
      type: 'stop',
    });
  }

  /**
   * Get machine info
   */
  public getMachineInfo(machineType: BuzzmachineType): BuzzmachineInfo {
    return BUZZMACHINE_INFO[machineType];
  }
}
