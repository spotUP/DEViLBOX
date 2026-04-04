/**
 * MoniqueSynth.ts - Monique Monosynth WASM engine for DEViLBOX
 *
 * Features:
 * - Monophonic with glide/portamento
 * - 3 oscillators with FM synthesis, sync, wave selection
 * - 3 multimode filters with distortion and panning
 * - 4 ADSR envelopes (3 filter + 1 main)
 * - 3 LFOs with speed/wave/phase
 * - Reverb, chorus, delay effects
 * - ~100 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export const MoniqueParam = {
  // Oscillators (0-15)
  OSC1_WAVE: 0, OSC1_FM_POWER: 1, OSC1_OCTAVE: 2,
  OSC2_WAVE: 3, OSC2_FM_POWER: 4, OSC2_OCTAVE: 5,
  OSC3_WAVE: 6, OSC3_FM_POWER: 7, OSC3_OCTAVE: 8,
  FM_MULTI: 9, FM_SWING: 10, FM_PHASE: 11,
  MASTER_SHIFT: 12, OSC1_SYNC: 13, OSC2_SYNC: 14, OSC3_SYNC: 15,

  // Filter 1 (16-25)
  FILTER1_TYPE: 16, FILTER1_CUTOFF: 17, FILTER1_RESONANCE: 18,
  FILTER1_DISTORTION: 19, FILTER1_PAN: 20, FILTER1_OUTPUT: 21,
  FILTER1_MOD_MIX: 22, FILTER1_INPUT0: 23, FILTER1_INPUT1: 24, FILTER1_INPUT2: 25,

  // Filter 2 (26-35)
  FILTER2_TYPE: 26, FILTER2_CUTOFF: 27, FILTER2_RESONANCE: 28,
  FILTER2_DISTORTION: 29, FILTER2_PAN: 30, FILTER2_OUTPUT: 31,
  FILTER2_MOD_MIX: 32, FILTER2_INPUT0: 33, FILTER2_INPUT1: 34, FILTER2_INPUT2: 35,

  // Filter 3 (36-45)
  FILTER3_TYPE: 36, FILTER3_CUTOFF: 37, FILTER3_RESONANCE: 38,
  FILTER3_DISTORTION: 39, FILTER3_PAN: 40, FILTER3_OUTPUT: 41,
  FILTER3_MOD_MIX: 42, FILTER3_INPUT0: 43, FILTER3_INPUT1: 44, FILTER3_INPUT2: 45,

  // Envelope 1 - Filter 1 (46-52)
  ENV1_ATTACK: 46, ENV1_DECAY: 47, ENV1_SUSTAIN: 48,
  ENV1_RETRIGGER: 49, ENV1_RELEASE: 50, ENV1_SHAPE: 51, ENV1_VELOCITY: 52,

  // Envelope 2 - Filter 2 (53-59)
  ENV2_ATTACK: 53, ENV2_DECAY: 54, ENV2_SUSTAIN: 55,
  ENV2_RETRIGGER: 56, ENV2_RELEASE: 57, ENV2_SHAPE: 58, ENV2_VELOCITY: 59,

  // Envelope 3 - Filter 3 (60-66)
  ENV3_ATTACK: 60, ENV3_DECAY: 61, ENV3_SUSTAIN: 62,
  ENV3_RETRIGGER: 63, ENV3_RELEASE: 64, ENV3_SHAPE: 65, ENV3_VELOCITY: 66,

  // Envelope 4 - Main (67-73)
  ENV4_ATTACK: 67, ENV4_DECAY: 68, ENV4_SUSTAIN: 69,
  ENV4_RETRIGGER: 70, ENV4_RELEASE: 71, ENV4_SHAPE: 72, ENV4_VELOCITY: 73,

  // LFOs (74-82)
  LFO1_SPEED: 74, LFO1_WAVE: 75, LFO1_PHASE: 76,
  LFO2_SPEED: 77, LFO2_WAVE: 78, LFO2_PHASE: 79,
  LFO3_SPEED: 80, LFO3_WAVE: 81, LFO3_PHASE: 82,

  // Effects (83-90)
  REVERB_ROOM: 83, REVERB_MIX: 84, REVERB_WIDTH: 85,
  CHORUS_MOD: 86, CHORUS_PAN: 87,
  DELAY: 88, DELAY_PAN: 89,
  EQ_BYPASS: 90,

  // Master (91-99)
  VOLUME: 91, SHAPE: 92, DISTORTION: 93,
  GLIDE: 94, GLIDE_TIME: 95, OCTAVE_OFFSET: 96, NOTE_OFFSET: 97,
  SPEED: 98, EFFECT_BYPASS: 99,
} as const;

export const MONIQUE_PARAM_NAMES: Record<number, string> = {
  0: 'Osc1 Wave', 1: 'Osc1 FM', 2: 'Osc1 Octave',
  3: 'Osc2 Wave', 4: 'Osc2 FM', 5: 'Osc2 Octave',
  6: 'Osc3 Wave', 7: 'Osc3 FM', 8: 'Osc3 Octave',
  9: 'FM Multi', 10: 'FM Swing', 11: 'FM Phase',
  12: 'Master Shift', 13: 'Osc1 Sync', 14: 'Osc2 Sync', 15: 'Osc3 Sync',
  16: 'Flt1 Type', 17: 'Flt1 Cutoff', 18: 'Flt1 Reso',
  19: 'Flt1 Dist', 20: 'Flt1 Pan', 21: 'Flt1 Out',
  22: 'Flt1 ModMix', 23: 'Flt1 In0', 24: 'Flt1 In1', 25: 'Flt1 In2',
  26: 'Flt2 Type', 27: 'Flt2 Cutoff', 28: 'Flt2 Reso',
  29: 'Flt2 Dist', 30: 'Flt2 Pan', 31: 'Flt2 Out',
  32: 'Flt2 ModMix', 33: 'Flt2 In0', 34: 'Flt2 In1', 35: 'Flt2 In2',
  36: 'Flt3 Type', 37: 'Flt3 Cutoff', 38: 'Flt3 Reso',
  39: 'Flt3 Dist', 40: 'Flt3 Pan', 41: 'Flt3 Out',
  42: 'Flt3 ModMix', 43: 'Flt3 In0', 44: 'Flt3 In1', 45: 'Flt3 In2',
  46: 'Env1 Atk', 47: 'Env1 Dec', 48: 'Env1 Sus',
  49: 'Env1 Retrig', 50: 'Env1 Rel', 51: 'Env1 Shape', 52: 'Env1 Vel',
  53: 'Env2 Atk', 54: 'Env2 Dec', 55: 'Env2 Sus',
  56: 'Env2 Retrig', 57: 'Env2 Rel', 58: 'Env2 Shape', 59: 'Env2 Vel',
  60: 'Env3 Atk', 61: 'Env3 Dec', 62: 'Env3 Sus',
  63: 'Env3 Retrig', 64: 'Env3 Rel', 65: 'Env3 Shape', 66: 'Env3 Vel',
  67: 'Env4 Atk', 68: 'Env4 Dec', 69: 'Env4 Sus',
  70: 'Env4 Retrig', 71: 'Env4 Rel', 72: 'Env4 Shape', 73: 'Env4 Vel',
  74: 'LFO1 Speed', 75: 'LFO1 Wave', 76: 'LFO1 Phase',
  77: 'LFO2 Speed', 78: 'LFO2 Wave', 79: 'LFO2 Phase',
  80: 'LFO3 Speed', 81: 'LFO3 Wave', 82: 'LFO3 Phase',
  83: 'Reverb Room', 84: 'Reverb Mix', 85: 'Reverb Width',
  86: 'Chorus Mod', 87: 'Chorus Pan',
  88: 'Delay', 89: 'Delay Pan',
  90: 'EQ Bypass',
  91: 'Volume', 92: 'Shape', 93: 'Distortion',
  94: 'Glide', 95: 'Glide Time', 96: 'Octave Offset', 97: 'Note Offset',
  98: 'Speed', 99: 'Effect Bypass',
};

export interface MoniqueConfig {
  // Oscillators
  osc1Wave?: number;        // 0-3 (sine/saw/square/noise)
  osc1FmPower?: number;     // 0-1
  osc1Octave?: number;      // -36 to 36 semitones
  osc2Wave?: number;
  osc2FmPower?: number;
  osc2Octave?: number;
  osc3Wave?: number;
  osc3FmPower?: number;
  osc3Octave?: number;
  fmMulti?: number;         // 0-1
  fmSwing?: number;         // 0-1
  fmPhase?: number;         // 0-1
  masterShift?: number;     // 0-1
  osc1Sync?: number;        // 0-1 toggle
  osc2Sync?: number;
  osc3Sync?: number;

  // Filter 1
  filter1Type?: number;     // 1-7
  filter1Cutoff?: number;   // 0-1 (maps to 35-21965Hz in WASM)
  filter1Resonance?: number;// 0-1
  filter1Distortion?: number;
  filter1Pan?: number;      // -1 to 1
  filter1Output?: number;   // 0-1
  filter1ModMix?: number;   // -1 to 1
  filter1Input0?: number;   // 0-1
  filter1Input1?: number;
  filter1Input2?: number;

  // Filter 2
  filter2Type?: number;
  filter2Cutoff?: number;
  filter2Resonance?: number;
  filter2Distortion?: number;
  filter2Pan?: number;
  filter2Output?: number;
  filter2ModMix?: number;
  filter2Input0?: number;
  filter2Input1?: number;
  filter2Input2?: number;

  // Filter 3
  filter3Type?: number;
  filter3Cutoff?: number;
  filter3Resonance?: number;
  filter3Distortion?: number;
  filter3Pan?: number;
  filter3Output?: number;
  filter3ModMix?: number;
  filter3Input0?: number;
  filter3Input1?: number;
  filter3Input2?: number;

  // Envelope 1 (Filter 1)
  env1Attack?: number;      // 0-1 (maps to 1-4999ms)
  env1Decay?: number;
  env1Sustain?: number;
  env1Retrigger?: number;   // 0.004-1
  env1Release?: number;
  env1Shape?: number;       // -1 to 1
  env1Velocity?: number;    // 0-1

  // Envelope 2 (Filter 2)
  env2Attack?: number;
  env2Decay?: number;
  env2Sustain?: number;
  env2Retrigger?: number;
  env2Release?: number;
  env2Shape?: number;
  env2Velocity?: number;

  // Envelope 3 (Filter 3)
  env3Attack?: number;
  env3Decay?: number;
  env3Sustain?: number;
  env3Retrigger?: number;
  env3Release?: number;
  env3Shape?: number;
  env3Velocity?: number;

  // Envelope 4 (Main)
  env4Attack?: number;
  env4Decay?: number;
  env4Sustain?: number;
  env4Retrigger?: number;
  env4Release?: number;
  env4Shape?: number;
  env4Velocity?: number;

  // LFOs
  lfo1Speed?: number;       // 0-16 int
  lfo1Wave?: number;        // 0-1
  lfo1Phase?: number;       // 0-1
  lfo2Speed?: number;
  lfo2Wave?: number;
  lfo2Phase?: number;
  lfo3Speed?: number;
  lfo3Wave?: number;
  lfo3Phase?: number;

  // Effects
  reverbRoom?: number;      // 0-1
  reverbMix?: number;
  reverbWidth?: number;
  chorusMod?: number;
  chorusPan?: number;
  delay?: number;
  delayPan?: number;
  eqBypass?: number;        // 0-1 toggle

  // Master
  volume?: number;          // 0-1
  shape?: number;           // 0-1 distortion shape
  distortion?: number;      // 0-1
  glide?: number;           // 0-1
  glideTime?: number;       // integer
  octaveOffset?: number;    // integer
  noteOffset?: number;      // integer
  speed?: number;           // 20-1000 BPM
  effectBypass?: number;    // 0-1 toggle
}

export const DEFAULT_MONIQUE: MoniqueConfig = {
  // Oscillators
  osc1Wave: 1, osc1FmPower: 0, osc1Octave: 0,
  osc2Wave: 1, osc2FmPower: 0, osc2Octave: 0,
  osc3Wave: 0, osc3FmPower: 0, osc3Octave: 0,
  fmMulti: 0, fmSwing: 0, fmPhase: 0,
  masterShift: 0.5, osc1Sync: 0, osc2Sync: 0, osc3Sync: 0,

  // Filter 1
  filter1Type: 1, filter1Cutoff: 0.5, filter1Resonance: 0.3,
  filter1Distortion: 0, filter1Pan: 0, filter1Output: 0.8,
  filter1ModMix: 0, filter1Input0: 1, filter1Input1: 0, filter1Input2: 0,

  // Filter 2
  filter2Type: 1, filter2Cutoff: 0.5, filter2Resonance: 0.3,
  filter2Distortion: 0, filter2Pan: 0, filter2Output: 0,
  filter2ModMix: 0, filter2Input0: 0, filter2Input1: 1, filter2Input2: 0,

  // Filter 3
  filter3Type: 1, filter3Cutoff: 0.5, filter3Resonance: 0.3,
  filter3Distortion: 0, filter3Pan: 0, filter3Output: 0,
  filter3ModMix: 0, filter3Input0: 0, filter3Input1: 0, filter3Input2: 1,

  // Envelope 1 (Filter 1)
  env1Attack: 0.01, env1Decay: 0.3, env1Sustain: 0.7,
  env1Retrigger: 0.004, env1Release: 0.3, env1Shape: 0, env1Velocity: 0.5,

  // Envelope 2 (Filter 2)
  env2Attack: 0.01, env2Decay: 0.3, env2Sustain: 0.7,
  env2Retrigger: 0.004, env2Release: 0.3, env2Shape: 0, env2Velocity: 0.5,

  // Envelope 3 (Filter 3)
  env3Attack: 0.01, env3Decay: 0.3, env3Sustain: 0.7,
  env3Retrigger: 0.004, env3Release: 0.3, env3Shape: 0, env3Velocity: 0.5,

  // Envelope 4 (Main)
  env4Attack: 0.01, env4Decay: 0.3, env4Sustain: 0.8,
  env4Retrigger: 0.004, env4Release: 0.3, env4Shape: 0, env4Velocity: 0.5,

  // LFOs
  lfo1Speed: 4, lfo1Wave: 0, lfo1Phase: 0,
  lfo2Speed: 4, lfo2Wave: 0, lfo2Phase: 0,
  lfo3Speed: 4, lfo3Wave: 0, lfo3Phase: 0,

  // Effects
  reverbRoom: 0.3, reverbMix: 0, reverbWidth: 0.5,
  chorusMod: 0, chorusPan: 0.5,
  delay: 0, delayPan: 0.5,
  eqBypass: 0,

  // Master
  volume: 0.7, shape: 0, distortion: 0,
  glide: 0, glideTime: 0, octaveOffset: 0, noteOffset: 0,
  speed: 120, effectBypass: 0,
};

export const MONIQUE_PRESETS: Record<string, MoniqueConfig> = {
  'Deep Bass': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: -12,
    osc2Wave: 1, osc2FmPower: 0, osc2Octave: -12,
    osc3FmPower: 0, osc3Octave: 0,
    filter1Cutoff: 0.2, filter1Resonance: 0.6, filter1Output: 1,
    env1Attack: 0.05, env1Decay: 0.5, env1Sustain: 0.4, env1Release: 0.2,
    env4Attack: 0.02, env4Decay: 0.4, env4Sustain: 0.6, env4Release: 0.3,
    volume: 0.8,
  },
  'Acid Scream': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 2, osc1Octave: 0,
    filter1Type: 1, filter1Cutoff: 0.15, filter1Resonance: 0.85,
    filter1Distortion: 0.6, filter1Output: 1,
    env1Attack: 0, env1Decay: 0.2, env1Sustain: 0.1, env1Release: 0.15,
    env4Attack: 0, env4Decay: 0.3, env4Sustain: 0.5, env4Release: 0.1,
    distortion: 0.4, glide: 0.6, glideTime: 3,
    volume: 0.75,
  },
  'Warm Lead': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: 0,
    osc2Wave: 1, osc2FmPower: 0, osc2Octave: 7,
    filter1Cutoff: 0.45, filter1Resonance: 0.4, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 1,
    env1Attack: 0.02, env1Decay: 0.4, env1Sustain: 0.6, env1Release: 0.3,
    env4Attack: 0.01, env4Decay: 0.3, env4Sustain: 0.7, env4Release: 0.4,
    glide: 0.3, glideTime: 2,
    volume: 0.7,
  },
  'FM Pluck': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 0, osc1FmPower: 0.7,
    osc2Wave: 0, osc2FmPower: 0.5, osc2Octave: 12,
    fmMulti: 0.6, fmSwing: 0.3,
    filter1Cutoff: 0.7, filter1Resonance: 0.2, filter1Output: 1,
    env1Attack: 0, env1Decay: 0.15, env1Sustain: 0, env1Release: 0.1,
    env4Attack: 0, env4Decay: 0.2, env4Sustain: 0, env4Release: 0.15,
    volume: 0.7,
  },
  'Morphing Pad': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: 0,
    osc2Wave: 0, osc2Octave: 7,
    osc3Wave: 2, osc3Octave: -12,
    filter1Cutoff: 0.4, filter1Resonance: 0.3, filter1Output: 0.7,
    filter1Input0: 1, filter1Input1: 0.5, filter1Input2: 0.3,
    filter2Cutoff: 0.6, filter2Resonance: 0.2, filter2Output: 0.5,
    filter2Input0: 0.3, filter2Input1: 1, filter2Input2: 0.5,
    env1Attack: 0.4, env1Decay: 0.5, env1Sustain: 0.8, env1Release: 0.6,
    env2Attack: 0.5, env2Decay: 0.6, env2Sustain: 0.7, env2Release: 0.7,
    env4Attack: 0.5, env4Decay: 0.4, env4Sustain: 0.9, env4Release: 0.8,
    lfo1Speed: 2, lfo1Wave: 0.5,
    lfo2Speed: 3, lfo2Wave: 0.3,
    reverbRoom: 0.6, reverbMix: 0.4, reverbWidth: 0.7,
    volume: 0.65,
  },
  'Reese Bass': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: -12,
    osc2Wave: 1, osc2Octave: -12, osc2FmPower: 0,
    osc3Wave: 1, osc3Octave: -24, osc3FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.35, filter1Resonance: 0.15, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 1, filter1Input2: 0.7,
    env1Attack: 0.01, env1Decay: 0.6, env1Sustain: 0.3, env1Release: 0.2,
    env4Attack: 0.01, env4Decay: 0.5, env4Sustain: 0.7, env4Release: 0.3,
    lfo1Speed: 0.5, lfo1Wave: 0,
    chorusMod: 0.3, chorusPan: 0.5,
    distortion: 0.15, volume: 0.85,
  },
  'Wobble Bass': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: -12,
    osc2Wave: 2, osc2Octave: -12, osc2FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.5, filter1Resonance: 0.7, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 0.8,
    env1Attack: 0, env1Decay: 0.3, env1Sustain: 0.5, env1Release: 0.2,
    env4Attack: 0.01, env4Decay: 0.4, env4Sustain: 0.6, env4Release: 0.15,
    lfo1Speed: 4, lfo1Wave: 0,
    distortion: 0.5, volume: 0.8,
  },
  'Sync Lead': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: 0, osc1Sync: 1,
    osc2Wave: 1, osc2Octave: 12, osc2Sync: 1, osc2FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.6, filter1Resonance: 0.5,
    filter1Distortion: 0.3, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 0.6,
    env1Attack: 0, env1Decay: 0.25, env1Sustain: 0.4, env1Release: 0.2,
    env4Attack: 0, env4Decay: 0.3, env4Sustain: 0.6, env4Release: 0.25,
    glide: 0.2, glideTime: 2,
    delay: 0.3, delayPan: 0.7,
    volume: 0.7,
  },
  'Brass Stab': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: 0,
    osc2Wave: 2, osc2Octave: 0, osc2FmPower: 0,
    osc3Wave: 1, osc3Octave: -12, osc3FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.3, filter1Resonance: 0.35, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 1, filter1Input2: 0.5,
    env1Attack: 0.03, env1Decay: 0.15, env1Sustain: 0.3, env1Release: 0.1,
    env4Attack: 0.02, env4Decay: 0.1, env4Sustain: 0.5, env4Release: 0.15,
    distortion: 0.2, volume: 0.75,
  },
  'Dark Ambient': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 0, osc1Octave: -12,
    osc2Wave: 1, osc2Octave: 7, osc2FmPower: 0.3,
    osc3Wave: 3, osc3Octave: 0, osc3FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.2, filter1Resonance: 0.5, filter1Output: 0.6,
    filter1Input0: 1, filter1Input1: 0.4, filter1Input2: 0.2,
    filter2Type: 2, filter2Cutoff: 0.7, filter2Resonance: 0.3, filter2Output: 0.5,
    filter2Input0: 0.5, filter2Input1: 1,
    env1Attack: 0.8, env1Decay: 0.7, env1Sustain: 0.6, env1Release: 1,
    env2Attack: 1, env2Decay: 0.8, env2Sustain: 0.5, env2Release: 1,
    env4Attack: 0.6, env4Decay: 0.5, env4Sustain: 0.8, env4Release: 1,
    lfo1Speed: 0.3, lfo1Wave: 0,
    lfo2Speed: 0.7, lfo2Wave: 0.5,
    reverbRoom: 0.9, reverbMix: 0.6, reverbWidth: 1,
    delay: 0.4, delayPan: 0.6,
    volume: 0.6,
  },
  'Metallic Bell': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 0, osc1FmPower: 0.8, osc1Octave: 12,
    osc2Wave: 0, osc2FmPower: 0.6, osc2Octave: 19,
    fmMulti: 0.8, fmSwing: 0.5,
    filter1Type: 2, filter1Cutoff: 0.8, filter1Resonance: 0.4, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 0.7,
    env1Attack: 0, env1Decay: 0.5, env1Sustain: 0, env1Release: 0.4,
    env4Attack: 0, env4Decay: 0.8, env4Sustain: 0, env4Release: 0.6,
    reverbRoom: 0.5, reverbMix: 0.3,
    volume: 0.6,
  },
  'Hoover': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: 0,
    osc2Wave: 1, osc2Octave: 7, osc2FmPower: 0,
    osc3Wave: 1, osc3Octave: -5, osc3FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.55, filter1Resonance: 0.25,
    filter1Distortion: 0.4, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 1, filter1Input2: 1,
    env1Attack: 0.1, env1Decay: 0.3, env1Sustain: 0.7, env1Release: 0.3,
    env4Attack: 0.05, env4Decay: 0.2, env4Sustain: 0.8, env4Release: 0.3,
    glide: 0.5, glideTime: 4,
    chorusMod: 0.5, chorusPan: 0.6,
    distortion: 0.3, volume: 0.75,
  },
  'Squelchy Lead': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 2, osc1Octave: 0,
    osc2Wave: 1, osc2Octave: 0, osc2FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.1, filter1Resonance: 0.9,
    filter1Distortion: 0.7, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 0.5,
    env1Attack: 0, env1Decay: 0.12, env1Sustain: 0.05, env1Release: 0.08,
    env4Attack: 0, env4Decay: 0.15, env4Sustain: 0.4, env4Release: 0.1,
    glide: 0.4, glideTime: 2,
    distortion: 0.6, volume: 0.7,
  },
  'Sub Growl': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: -24,
    osc2Wave: 2, osc2Octave: -12, osc2FmPower: 0,
    osc3Wave: 3, osc3Octave: 0, osc3FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.25, filter1Resonance: 0.6,
    filter1Distortion: 0.8, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 0.8, filter1Input2: 0.15,
    env1Attack: 0.02, env1Decay: 0.3, env1Sustain: 0.2, env1Release: 0.15,
    env4Attack: 0.01, env4Decay: 0.4, env4Sustain: 0.5, env4Release: 0.2,
    lfo1Speed: 6, lfo1Wave: 0.3,
    distortion: 0.7, volume: 0.8,
  },
  'Talking Bass': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: -12,
    osc2Wave: 2, osc2Octave: -12, osc2FmPower: 0.2,
    filter1Type: 2, filter1Cutoff: 0.35, filter1Resonance: 0.75,
    filter1Output: 1, filter1Input0: 1, filter1Input1: 0.5,
    filter2Type: 2, filter2Cutoff: 0.55, filter2Resonance: 0.7,
    filter2Output: 0.6,
    env1Attack: 0.01, env1Decay: 0.25, env1Sustain: 0.4, env1Release: 0.15,
    env4Attack: 0.01, env4Decay: 0.3, env4Sustain: 0.6, env4Release: 0.2,
    lfo1Speed: 4, lfo1Wave: 0.5, lfo1Phase: 0.25,
    filter1ModMix: 0.6,
    volume: 0.85,
  },
  'Phase Lead': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: 0,
    osc2Wave: 1, osc2Octave: 0, osc2FmPower: 0.1,
    filter1Type: 4, filter1Cutoff: 0.5, filter1Resonance: 0.5,
    filter1Output: 0.8, filter1Input0: 1,
    filter2Type: 4, filter2Cutoff: 0.55, filter2Resonance: 0.5,
    filter2Output: 0.8, filter2Pan: 0.4,
    filter3Type: 4, filter3Cutoff: 0.6, filter3Resonance: 0.45,
    filter3Output: 0.7, filter3Pan: -0.4,
    env1Attack: 0.03, env1Decay: 0.4, env1Sustain: 0.7, env1Release: 0.3,
    env4Attack: 0.02, env4Decay: 0.5, env4Sustain: 0.8, env4Release: 0.35,
    lfo1Speed: 3, lfo1Wave: 0.5,
    volume: 0.75,
  },
  'Ring Mod Bell': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 0, osc1Octave: 12,
    osc2Wave: 0, osc2Octave: 19, osc2FmPower: 0.8,
    osc3Wave: 0, osc3Octave: 24, osc3FmPower: 0.5,
    fmMulti: 0.7, fmSwing: 0.3,
    filter1Type: 1, filter1Cutoff: 0.7, filter1Resonance: 0.2,
    filter1Output: 1, filter1Input0: 0.8, filter1Input1: 0.6, filter1Input2: 0.4,
    env1Attack: 0.001, env1Decay: 0.6, env1Sustain: 0.0, env1Release: 0.8,
    env4Attack: 0.001, env4Decay: 0.8, env4Sustain: 0.0, env4Release: 1.0,
    reverbRoom: 0.7, reverbMix: 0.4, reverbWidth: 0.8,
    volume: 0.7,
  },
  'Distortion Lead': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: 0,
    osc2Wave: 2, osc2Octave: 0, osc2FmPower: 0.15,
    filter1Type: 1, filter1Cutoff: 0.6, filter1Resonance: 0.4,
    filter1Distortion: 0.9, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 0.7,
    env1Attack: 0.01, env1Decay: 0.3, env1Sustain: 0.6, env1Release: 0.2,
    env4Attack: 0.01, env4Decay: 0.35, env4Sustain: 0.7, env4Release: 0.25,
    distortion: 0.85, shape: 0.6,
    volume: 0.75,
  },
  'Filter Cascade': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: -12,
    osc2Wave: 1, osc2Octave: 0, osc2FmPower: 0.05,
    filter1Type: 1, filter1Cutoff: 0.7, filter1Resonance: 0.3,
    filter1Output: 1, filter1Input0: 1, filter1Input1: 0.8,
    filter2Type: 2, filter2Cutoff: 0.5, filter2Resonance: 0.5,
    filter2Output: 0.9,
    filter3Type: 3, filter3Cutoff: 0.4, filter3Resonance: 0.6,
    filter3Output: 0.8,
    env1Attack: 0.02, env1Decay: 0.4, env1Sustain: 0.5, env1Release: 0.3,
    env4Attack: 0.01, env4Decay: 0.5, env4Sustain: 0.6, env4Release: 0.35,
    lfo1Speed: 2, lfo1Wave: 0.5,
    volume: 0.8,
  },
  'Pulse Width': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 2, osc1Octave: 0,
    osc2Wave: 2, osc2Octave: 0, osc2FmPower: 0,
    masterShift: 0.5,
    filter1Type: 1, filter1Cutoff: 0.55, filter1Resonance: 0.3,
    filter1Output: 1, filter1Input0: 1, filter1Input1: 0.8,
    env1Attack: 0.05, env1Decay: 0.5, env1Sustain: 0.7, env1Release: 0.3,
    env4Attack: 0.03, env4Decay: 0.6, env4Sustain: 0.8, env4Release: 0.35,
    lfo1Speed: 5, lfo1Wave: 0.5, lfo1Phase: 0.0,
    chorusMod: 0.3, chorusPan: 0.5,
    volume: 0.8,
  },
  'Ethereal Pad': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 0, osc1Octave: 0,
    osc2Wave: 0, osc2Octave: 12, osc2FmPower: 0.1,
    osc3Wave: 0, osc3Octave: -12, osc3FmPower: 0.05,
    filter1Type: 1, filter1Cutoff: 0.4, filter1Resonance: 0.2,
    filter1Output: 1, filter1Input0: 0.7, filter1Input1: 0.5, filter1Input2: 0.6,
    env1Attack: 0.8, env1Decay: 0.6, env1Sustain: 0.9, env1Release: 0.9,
    env4Attack: 0.7, env4Decay: 0.5, env4Sustain: 0.85, env4Release: 0.85,
    lfo1Speed: 1, lfo1Wave: 0.5,
    reverbRoom: 0.9, reverbMix: 0.6, reverbWidth: 1.0,
    chorusMod: 0.4, chorusPan: 0.6,
    volume: 0.7,
  },
  'Organ Drone': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 0, osc1Octave: 0,
    osc2Wave: 0, osc2Octave: 12, osc2FmPower: 0,
    osc3Wave: 0, osc3Octave: -12, osc3FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.65, filter1Resonance: 0.1,
    filter1Output: 1, filter1Input0: 0.8, filter1Input1: 0.6, filter1Input2: 0.7,
    env1Attack: 0.01, env1Decay: 0.1, env1Sustain: 1.0, env1Release: 0.1,
    env4Attack: 0.01, env4Decay: 0.1, env4Sustain: 1.0, env4Release: 0.1,
    volume: 0.75,
  },
  'Percussive Key': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 2, osc1Octave: 0,
    osc2Wave: 0, osc2Octave: 12, osc2FmPower: 0.3,
    filter1Type: 1, filter1Cutoff: 0.8, filter1Resonance: 0.15,
    filter1Output: 1, filter1Input0: 1, filter1Input1: 0.5,
    env1Attack: 0.001, env1Decay: 0.15, env1Sustain: 0.0, env1Release: 0.1,
    env4Attack: 0.001, env4Decay: 0.2, env4Sustain: 0.0, env4Release: 0.12,
    volume: 0.85,
  },
  'Siren': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 0, osc1Octave: 0,
    osc2Wave: 0, osc2Octave: 12, osc2FmPower: 0.2,
    filter1Type: 1, filter1Cutoff: 0.2, filter1Resonance: 0.7,
    filter1Output: 1, filter1Input0: 1, filter1Input1: 0.6,
    env1Attack: 0.5, env1Decay: 0.8, env1Sustain: 0.9, env1Release: 0.5,
    env4Attack: 0.4, env4Decay: 0.7, env4Sustain: 0.85, env4Release: 0.45,
    lfo1Speed: 2, lfo1Wave: 0.5,
    glide: 1.0, glideTime: 500,
    volume: 0.7,
  },
  'Hard Sync': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 1, osc1Octave: 0, osc1Sync: 1,
    osc2Wave: 1, osc2Octave: 12, osc2Sync: 1, osc2FmPower: 0,
    filter1Type: 1, filter1Cutoff: 0.5, filter1Resonance: 0.35,
    filter1Distortion: 0.4, filter1Output: 1,
    filter1Input0: 1, filter1Input1: 0.7,
    env1Attack: 0.01, env1Decay: 0.35, env1Sustain: 0.5, env1Release: 0.2,
    env4Attack: 0.01, env4Decay: 0.4, env4Sustain: 0.6, env4Release: 0.25,
    lfo1Speed: 3, lfo1Wave: 0.3,
    distortion: 0.3, volume: 0.8,
  },
};

// Map from MoniqueConfig key → C++ MoniqueParams enum index.
// Must match the enum in MoniqueSynth.cpp exactly.
const PARAM_INDEX: Record<string, number> = {
  // Master (0-4)
  volume: 0, glide: 1, octaveOffset: 2, noteOffset: 3, speed: 4,
  // Osc1 (5-8)
  osc1Wave: 5, osc1Octave: 6, osc1FmPower: 7, osc1Sync: 8,
  // Osc2 (9-12)
  osc2Wave: 9, osc2Octave: 10, osc2FmPower: 11, osc2Sync: 12,
  // Osc3 (13-16)
  osc3Wave: 13, osc3Octave: 14, osc3FmPower: 15, osc3Sync: 16,
  // FM Osc (17-20)
  fmMulti: 17, fmPhase: 18, fmSwing: 19, masterShift: 20,
  // Filter1 (21-27)
  filter1Type: 21, filter1Cutoff: 22, filter1Resonance: 23,
  filter1Distortion: 24, filter1Output: 25, filter1Pan: 26, filter1ModMix: 27,
  // Filter2 (28-34)
  filter2Type: 28, filter2Cutoff: 29, filter2Resonance: 30,
  filter2Distortion: 31, filter2Output: 32, filter2Pan: 33, filter2ModMix: 34,
  // Filter3 (35-41)
  filter3Type: 35, filter3Cutoff: 36, filter3Resonance: 37,
  filter3Distortion: 38, filter3Output: 39, filter3Pan: 40, filter3ModMix: 41,
  // FiltEnv1 (42-47)
  env1Attack: 42, env1Decay: 43, env1Sustain: 44,
  env1Retrigger: 45, env1Release: 46, env1Shape: 47,
  // FiltEnv2 (48-53)
  env2Attack: 48, env2Decay: 49, env2Sustain: 50,
  env2Retrigger: 51, env2Release: 52, env2Shape: 53,
  // FiltEnv3 (54-59)
  env3Attack: 54, env3Decay: 55, env3Sustain: 56,
  env3Retrigger: 57, env3Release: 58, env3Shape: 59,
  // Env — main output (60-65)
  env4Attack: 60, env4Decay: 61, env4Sustain: 62,
  env4Retrigger: 63, env4Release: 64, env4Shape: 65,
  // LFOs (66-74)
  lfo1Speed: 66, lfo1Wave: 67, lfo1Phase: 68,
  lfo2Speed: 69, lfo2Wave: 70, lfo2Phase: 71,
  lfo3Speed: 72, lfo3Wave: 73, lfo3Phase: 74,
  // Routing — filter inputs (87-95)
  filter1Input0: 87, filter1Input1: 88, filter1Input2: 89,
  filter2Input0: 90, filter2Input1: 91, filter2Input2: 92,
  filter3Input0: 93, filter3Input1: 94, filter3Input2: 95,
  // FX (96-103)
  distortion: 96, shape: 97, delay: 98, delayPan: 99,
  reverbRoom: 100, reverbMix: 101, chorusMod: 102, effectBypass: 103,
  // EQ (119)
  eqBypass: 119,
};

export class MoniqueSynthEngine implements DevilboxSynth {
  readonly name = 'MoniqueSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: MoniqueConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];
  private _currentNote = -1;

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<MoniqueConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_MONIQUE, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!MoniqueSynthEngine.isWorkletLoaded) {
        if (!MoniqueSynthEngine.workletLoadPromise) {
          MoniqueSynthEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}monique/Monique.worklet.js`
          );
        }
        await MoniqueSynthEngine.workletLoadPromise;
        MoniqueSynthEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}monique/Monique.wasm`),
        fetch(`${baseUrl}monique/Monique.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load Monique.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load Monique.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}monique/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
        .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)');

      this._worklet = new AudioWorkletNode(rawContext, 'monique-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          console.log('[MoniqueSynth] Worklet ready, factory default loaded');
          this.isInitialized = true;
          // Apply TS config on top of factory defaults (PARAM_INDEX matches C++ enum)
          this.applyConfig(this.config);
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'audioLevel') {
          console.log('[MoniqueSynth] 🔊 WASM producing audio! peak:', event.data.peak);
        } else if (event.data.type === 'error') {
          console.error('[MoniqueSynth] Worklet error:', event.data.error);
        } else {
          console.log('[MoniqueSynth] Worklet message:', event.data);
        }
      };

      console.log('[MoniqueSynth] Sending init to worklet, wasmBinary:', wasmBinary.byteLength, 'jsCode:', jsCode.length);
      this._worklet.port.postMessage({
        type: 'init', wasmBinary, jsCode, sampleRate: rawContext.sampleRate,
      });

      this._worklet.connect(this.output);

      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize MoniqueSynth:', error);
      throw error;
    }
  }

  applyConfig(config: MoniqueConfig): void {
    if (!this._worklet || !this.isInitialized) return;
    for (const [key, index] of Object.entries(PARAM_INDEX)) {
      const value = (config as Record<string, number | undefined>)[key];
      if (value !== undefined) {
        this._worklet.port.postMessage({ type: 'setParam', index, value });
      }
    }
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
    const vel = Math.round((velocity ?? 0.8) * 127);
    this._currentNote = note;
    if (!this.isInitialized || !this._worklet) {
      this.pendingNotes.push({ note, velocity: vel });
      return this;
    }
    this._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
    return this;
  }

  // Monique is monophonic — release the specified note or current note
  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet || !this.isInitialized) return this;
    // If a specific note was given, convert and release it
    let note = this._currentNote;
    if (frequency !== undefined) {
      note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
    }
    if (note >= 0) {
      this._worklet.port.postMessage({ type: 'noteOff', note });
      if (note === this._currentNote) this._currentNote = -1;
    }
    return this;
  }

  set(param: string, value: number): void {
    const index = PARAM_INDEX[param];
    if (index !== undefined) {
      (this.config as Record<string, number>)[param] = value;
      if (this._worklet && this.isInitialized) {
        this._worklet.port.postMessage({ type: 'setParam', index, value });
      }
    }
  }

  get(param: string): number | undefined {
    return (this.config as Record<string, number | undefined>)[param];
  }

  setPreset(name: string): void {
    const preset = MONIQUE_PRESETS[name];
    if (preset) {
      this.config = { ...preset };
      this.applyConfig(this.config);
    }
  }

  dispose(): void {
    if (this._worklet) {
      this._worklet.port.postMessage({ type: 'dispose' });
      this._worklet.disconnect();
      this._worklet = null;
    }
    this.isInitialized = false;
  }
}
