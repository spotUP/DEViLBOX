/**
 * OBXdSynth.ts - Oberheim OB-X Synthesizer wrapper for DEViLBOX
 * Provides a Tone.js compatible interface to the OB-Xd WASM engine
 *
 * Features:
 * - 8-voice polyphonic analog-modeled synthesis
 * - Dual oscillators with sync and ring mod
 * - Classic Oberheim filter emulation
 * - Comprehensive modulation with LFO and envelopes
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { loadNativePatch, captureNativeState, type NativePatch } from '@/engine/common/NativePatchLoader';

/**
 * OB-Xd Parameter IDs (matches C++ enum)
 * Using as const object for erasableSyntaxOnly compatibility
 */
export const OBXdParam = {
  // Oscillator 1
  OSC1_WAVEFORM: 0,
  OSC1_OCTAVE: 1,
  OSC1_DETUNE: 2,
  OSC1_PW: 3,
  OSC1_LEVEL: 4,

  // Oscillator 2
  OSC2_WAVEFORM: 5,
  OSC2_OCTAVE: 6,
  OSC2_DETUNE: 7,
  OSC2_PW: 8,
  OSC2_LEVEL: 9,

  // Oscillator Mix
  OSC_MIX: 10,
  OSC_SYNC: 11,
  OSC_XOR: 12,

  // Filter
  FILTER_CUTOFF: 13,
  FILTER_RESONANCE: 14,
  FILTER_TYPE: 15,
  FILTER_ENV_AMOUNT: 16,
  FILTER_KEY_TRACK: 17,
  FILTER_VELOCITY: 18,

  // Filter Envelope
  FILTER_ATTACK: 19,
  FILTER_DECAY: 20,
  FILTER_SUSTAIN: 21,
  FILTER_RELEASE: 22,

  // Amp Envelope
  AMP_ATTACK: 23,
  AMP_DECAY: 24,
  AMP_SUSTAIN: 25,
  AMP_RELEASE: 26,

  // LFO
  LFO_RATE: 27,
  LFO_WAVEFORM: 28,
  LFO_DELAY: 29,
  LFO_OSC_AMOUNT: 30,
  LFO_FILTER_AMOUNT: 31,
  LFO_AMP_AMOUNT: 32,
  LFO_PW_AMOUNT: 33,

  // Global
  MASTER_VOLUME: 34,
  VOICES: 35,
  UNISON: 36,
  UNISON_DETUNE: 37,
  PORTAMENTO: 38,
  PAN_SPREAD: 39,
  VELOCITY_SENSITIVITY: 40,

  // Extended
  NOISE_LEVEL: 41,
  SUB_OSC_LEVEL: 42,
  SUB_OSC_OCTAVE: 43,
  DRIFT: 44,
} as const;
export type OBXdParamType = (typeof OBXdParam)[keyof typeof OBXdParam];

/**
 * Waveform types
 */
export const OBXdWaveform = {
  SAW: 0,
  PULSE: 1,
  TRIANGLE: 2,
  NOISE: 3,
} as const;
export type OBXdWaveformType = (typeof OBXdWaveform)[keyof typeof OBXdWaveform];

/**
 * LFO waveform types
 */
export const OBXdLFOWave = {
  SINE: 0,
  TRIANGLE: 1,
  SAW: 2,
  SQUARE: 3,
  SAMPLE_HOLD: 4,
} as const;
export type OBXdLFOWaveType = (typeof OBXdLFOWave)[keyof typeof OBXdLFOWave];

/**
 * Configuration interface for OB-Xd synth
 */
export interface OBXdConfig {
  // Oscillator 1
  osc1Waveform?: OBXdWaveformType;
  osc1Octave?: number;      // -2 to +2
  osc1Detune?: number;      // -1 to +1 semitones
  osc1PulseWidth?: number;  // 0-1
  osc1Level?: number;       // 0-1

  // Oscillator 2
  osc2Waveform?: OBXdWaveformType;
  osc2Octave?: number;
  osc2Detune?: number;
  osc2PulseWidth?: number;
  osc2Level?: number;

  // Oscillator options
  oscSync?: boolean;
  oscXor?: boolean;         // Ring mod

  // Filter
  filterCutoff?: number;    // 0-1 (maps to 20-20000 Hz)
  filterResonance?: number; // 0-1
  filterType?: number;      // 0=LP24, 1=LP12, 2=HP, 3=BP, 4=Notch
  filterEnvAmount?: number; // 0-1
  filterKeyTrack?: number;  // 0-1
  filterVelocity?: number;  // 0-1

  // Filter envelope
  filterAttack?: number;    // 0-1 (seconds-ish)
  filterDecay?: number;
  filterSustain?: number;
  filterRelease?: number;

  // Amp envelope
  ampAttack?: number;
  ampDecay?: number;
  ampSustain?: number;
  ampRelease?: number;

  // LFO
  lfoRate?: number;         // 0-1 (maps to 0.1-20 Hz)
  lfoWaveform?: OBXdLFOWaveType;
  lfoDelay?: number;        // 0-1
  lfoOscAmount?: number;
  lfoFilterAmount?: number;
  lfoAmpAmount?: number;    // 0-1
  lfoPwAmount?: number;

  // Global
  masterVolume?: number;
  voices?: number;          // 1-8
  unison?: boolean;
  unisonDetune?: number;    // 0-1
  portamento?: number;      // 0-1 (glide time)
  velocitySensitivity?: number;
  panSpread?: number;

  // Extended
  noiseLevel?: number;      // 0-1
  subOscLevel?: number;     // 0-1
  subOscOctave?: number;    // -1 or -2
  drift?: number;           // 0-1 (analog drift)
}

/**
 * Classic OB-X style presets
 */
export const OBXD_PRESETS: Record<string, Partial<OBXdConfig>> = {
  'Classic Brass': {
    osc1Waveform: OBXdWaveform.SAW,
    osc2Waveform: OBXdWaveform.SAW,
    osc2Detune: 0.05,
    osc1Level: 1,
    osc2Level: 0.8,
    filterCutoff: 0.4,
    filterResonance: 0.2,
    filterEnvAmount: 0.6,
    filterAttack: 0.1,
    filterDecay: 0.3,
    filterSustain: 0.4,
    filterRelease: 0.2,
    ampAttack: 0.05,
    ampDecay: 0.1,
    ampSustain: 0.8,
    ampRelease: 0.3,
  },
  'Fat Lead': {
    osc1Waveform: OBXdWaveform.SAW,
    osc2Waveform: OBXdWaveform.SAW,
    osc2Octave: -1,
    osc2Detune: 0.1,
    osc1Level: 1,
    osc2Level: 1,
    filterCutoff: 0.6,
    filterResonance: 0.4,
    filterEnvAmount: 0.3,
    lfoRate: 0.3,
    lfoOscAmount: 0.1,
  },
  'Pulse Pad': {
    osc1Waveform: OBXdWaveform.PULSE,
    osc2Waveform: OBXdWaveform.PULSE,
    osc1PulseWidth: 0.3,
    osc2PulseWidth: 0.7,
    osc2Detune: 0.02,
    filterCutoff: 0.3,
    filterResonance: 0.1,
    filterEnvAmount: 0.2,
    ampAttack: 0.5,
    ampDecay: 0.5,
    ampSustain: 0.7,
    ampRelease: 1.0,
    lfoRate: 0.15,
    lfoPwAmount: 0.3,
  },
  'Sync Lead': {
    osc1Waveform: OBXdWaveform.SAW,
    osc2Waveform: OBXdWaveform.SAW,
    osc2Octave: 1,
    oscSync: true,
    filterCutoff: 0.5,
    filterResonance: 0.3,
    filterEnvAmount: 0.5,
  },
  'Init': {
    osc1Waveform: OBXdWaveform.SAW,
    osc1Level: 1,
    osc2Level: 0,
    filterCutoff: 0.7,
    filterResonance: 0.3,
    ampAttack: 0.01,
    ampDecay: 0.2,
    ampSustain: 0.7,
    ampRelease: 0.3,
  },
};

/**
 * Native presets — complete engine state snapshots (number[]).
 * Each array has 45 values matching OBXdParam indices 0-44:
 *   [0] OSC1_WAVEFORM  [1] OSC1_OCTAVE  [2] OSC1_DETUNE  [3] OSC1_PW  [4] OSC1_LEVEL
 *   [5] OSC2_WAVEFORM  [6] OSC2_OCTAVE  [7] OSC2_DETUNE  [8] OSC2_PW  [9] OSC2_LEVEL
 *  [10] OSC_MIX       [11] OSC_SYNC    [12] OSC_XOR
 *  [13] FILTER_CUTOFF [14] FILTER_RESO [15] FILTER_TYPE  [16] FILTER_ENV [17] FILTER_KT [18] FILTER_VEL
 *  [19] FILT_ATK      [20] FILT_DEC    [21] FILT_SUS     [22] FILT_REL
 *  [23] AMP_ATK       [24] AMP_DEC     [25] AMP_SUS      [26] AMP_REL
 *  [27] LFO_RATE      [28] LFO_WAVE    [29] LFO_DELAY    [30] LFO_OSC  [31] LFO_FILT  [32] LFO_AMP  [33] LFO_PW
 *  [34] MASTER_VOL    [35] VOICES      [36] UNISON       [37] UNI_DET  [38] PORTA     [39] PAN_SPR  [40] VEL_SENS
 *  [41] NOISE_LVL     [42] SUB_LVL    [43] SUB_OCT      [44] DRIFT
 *
 * Waveforms: 0=Saw, 1=Pulse, 2=Triangle, 3=Noise
 * LFO waves: 0=Sine, 1=Triangle, 2=Saw, 3=Square, 4=S&H
 * Filter:    0=LP24, 1=LP12, 2=HP, 3=BP, 4=Notch
 */
export const OBXD_NATIVE_PRESETS: NativePatch[] = [
  // ═══════════════════════════════════════════════════════════
  // INIT / DEFAULT
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Init',
    //       OSC1                     OSC2                     MIX/SYNC/XOR
    values: [0, 0, 0, 0.5, 1,        0, 0, 0, 0.5, 0,        0, 0, 0,
    //       FILTER                                FILT ENV
             0.7, 0.3, 0, 0.5, 0, 0.3,            0.01, 0.2, 0.3, 0.3,
    //       AMP ENV                 LFO
             0.01, 0.2, 0.7, 0.3,   0.2, 0, 0, 0, 0, 0, 0,
    //       GLOBAL                                           EXTENDED
             0.7, 8, 0, 0.1, 0, 0.3, 0.5,                   0, 0, -1, 0.02],
  },

  // ═══════════════════════════════════════════════════════════
  // BASSES
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Classic Bass',
    values: [0, -1, 0, 0.5, 1,       0, -1, 0.08, 0.5, 0.7,   0, 0, 0,
             0.25, 0.15, 0, 0.7, 0, 0,            0.01, 0.25, 0.1, 0.15,
             0.01, 0.1, 0.6, 0.15,  0.2, 0, 0, 0, 0, 0, 0,
             0.75, 4, 0, 0.1, 0, 0.1, 0.3,                   0, 0.3, -1, 0.02],
  },
  {
    name: 'Sub Bass',
    values: [2, -2, 0, 0.5, 1,       0, -1, 0.03, 0.5, 0.5,   0, 0, 0,
             0.15, 0.05, 0, 0.3, 0, 0,            0.01, 0.35, 0.15, 0.2,
             0.01, 0.15, 0.8, 0.2,  0, 0, 0, 0, 0, 0, 0,
             0.8, 4, 0, 0.1, 0, 0, 0.2,                       0, 0.5, -2, 0.01],
  },
  {
    name: 'Acid Bass',
    values: [0, -1, 0, 0.5, 1,       0, -1, 0, 0.5, 0,        0, 0, 0,
             0.2, 0.7, 0, 0.9, 0, 0.5,            0.01, 0.15, 0.05, 0.1,
             0.01, 0.08, 0.6, 0.1,  0, 0, 0, 0, 0, 0, 0,
             0.7, 1, 0, 0.1, 0.05, 0, 0.6,                    0, 0, -1, 0.02],
  },
  {
    name: 'Growl Bass',
    values: [0, -1, 0, 0.5, 1,       0, -1, 0.15, 0.5, 0.8,   0, 0, 0,
             0.3, 0.55, 0, 0.8, 0, 0.4,           0.01, 0.2, 0.1, 0.15,
             0.01, 0.12, 0.65, 0.12, 0.35, 0, 0, 0.05, 0.15, 0, 0,
             0.75, 4, 0, 0.15, 0, 0.1, 0.5,                   0, 0.4, -1, 0.03],
  },
  {
    name: 'Pulse Bass',
    values: [1, -1, 0, 0.35, 1,      1, -1, 0.06, 0.65, 0.7,  0, 0, 0,
             0.2, 0.2, 0, 0.6, 0, 0.2,            0.01, 0.3, 0.2, 0.2,
             0.01, 0.15, 0.7, 0.15, 0, 0, 0, 0, 0, 0, 0,
             0.7, 4, 0, 0.1, 0, 0.1, 0.4,                     0, 0.2, -1, 0.02],
  },

  // ═══════════════════════════════════════════════════════════
  // LEADS
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Fat Lead',
    values: [0, 0, 0, 0.5, 1,        0, -1, 0.1, 0.5, 1,      0, 0, 0,
             0.6, 0.4, 0, 0.3, 0.2, 0.3,          0.01, 0.2, 0.4, 0.2,
             0.01, 0.1, 0.8, 0.2,   0.3, 0, 0, 0.1, 0, 0, 0,
             0.7, 8, 0, 0.1, 0, 0.3, 0.5,                     0, 0, -1, 0.02],
  },
  {
    name: 'Sync Lead',
    values: [0, 0, 0, 0.5, 1,        0, 1, 0, 0.5, 0.8,       0, 1, 0,
             0.5, 0.3, 0, 0.5, 0.3, 0.3,          0.01, 0.25, 0.3, 0.2,
             0.01, 0.15, 0.8, 0.25, 0, 0, 0, 0, 0, 0, 0,
             0.7, 4, 0, 0.1, 0, 0.2, 0.5,                     0, 0, -1, 0.02],
  },
  {
    name: 'Screaming Lead',
    values: [0, 0, 0, 0.5, 1,        0, 1, 0.12, 0.5, 0.6,    0, 1, 0,
             0.35, 0.65, 0, 0.8, 0.4, 0.4,        0.01, 0.15, 0.2, 0.15,
             0.01, 0.1, 0.85, 0.2,  0.25, 0, 0, 0.08, 0, 0, 0,
             0.7, 1, 0, 0.1, 0.08, 0.1, 0.6,                  0, 0, -1, 0.03],
  },
  {
    name: 'Triangle Lead',
    values: [2, 0, 0, 0.5, 1,        2, 0, 0.08, 0.5, 0.6,    0, 0, 0,
             0.65, 0.15, 0, 0.2, 0.3, 0.2,        0.01, 0.3, 0.4, 0.3,
             0.01, 0.15, 0.8, 0.25, 0.3, 0, 0, 0.15, 0, 0, 0,
             0.7, 4, 0, 0.1, 0, 0.2, 0.4,                     0, 0, -1, 0.01],
  },
  {
    name: 'Mono Saw Lead',
    values: [0, 0, 0, 0.5, 1,        0, 0, 0.05, 0.5, 0.9,    0, 0, 0,
             0.55, 0.35, 0, 0.4, 0.3, 0.4,        0.01, 0.2, 0.35, 0.2,
             0.01, 0.1, 0.85, 0.2,  0, 0, 0, 0, 0, 0, 0,
             0.7, 1, 0, 0.1, 0.06, 0.1, 0.5,                  0, 0, -1, 0.02],
  },
  {
    name: 'Portamento Lead',
    values: [0, 0, 0, 0.5, 1,        0, 0, 0.07, 0.5, 0.85,   0, 0, 0,
             0.5, 0.3, 0, 0.35, 0.25, 0.3,        0.01, 0.25, 0.3, 0.25,
             0.01, 0.12, 0.8, 0.2,  0.2, 0, 0, 0.05, 0, 0, 0,
             0.7, 1, 0, 0.1, 0.25, 0.15, 0.5,                 0, 0, -1, 0.02],
  },

  // ═══════════════════════════════════════════════════════════
  // PADS
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Classic Brass',
    values: [0, 0, 0, 0.5, 1,        0, 0, 0.05, 0.5, 0.8,    0, 0, 0,
             0.4, 0.2, 0, 0.6, 0, 0.3,            0.1, 0.3, 0.4, 0.2,
             0.05, 0.1, 0.8, 0.3,   0.2, 0, 0, 0, 0, 0, 0,
             0.7, 8, 0, 0.1, 0, 0.3, 0.5,                     0, 0, -1, 0.02],
  },
  {
    name: 'Pulse Pad',
    values: [1, 0, 0, 0.3, 1,        1, 0, 0.02, 0.7, 0.9,    0, 0, 0,
             0.3, 0.1, 0, 0.2, 0.1, 0.2,          0.3, 0.5, 0.4, 0.5,
             0.5, 0.5, 0.7, 1.0,    0.15, 0, 0, 0, 0, 0, 0.3,
             0.7, 8, 0, 0.1, 0, 0.4, 0.3,                     0, 0, -1, 0.02],
  },
  {
    name: 'Warm Pad',
    values: [0, 0, 0, 0.5, 0.8,      0, 0, 0.06, 0.5, 0.8,    0, 0, 0,
             0.35, 0.15, 1, 0.3, 0.1, 0.1,        0.2, 0.4, 0.5, 0.6,
             0.6, 0.4, 0.75, 0.8,   0.1, 0, 0, 0, 0.05, 0, 0,
             0.7, 8, 0, 0.15, 0, 0.5, 0.3,                    0, 0, -1, 0.03],
  },
  {
    name: 'Shimmering Pad',
    values: [0, 0, 0, 0.5, 0.7,      0, 1, 0.03, 0.5, 0.7,    0, 0, 0,
             0.45, 0.2, 0, 0.25, 0.2, 0.1,        0.4, 0.5, 0.5, 0.7,
             0.7, 0.3, 0.8, 0.9,    0.25, 1, 0, 0.1, 0.08, 0, 0,
             0.65, 8, 0, 0.2, 0, 0.6, 0.3,                    0, 0, -1, 0.02],
  },
  {
    name: 'Dark Pad',
    values: [0, -1, 0, 0.5, 0.9,     0, 0, 0.04, 0.5, 0.7,    0, 0, 0,
             0.2, 0.1, 0, 0.15, 0, 0.1,           0.5, 0.6, 0.5, 0.7,
             0.7, 0.5, 0.75, 0.9,   0.08, 0, 0, 0, 0, 0, 0,
             0.7, 8, 0, 0.1, 0, 0.5, 0.2,                     0, 0.2, -1, 0.03],
  },
  {
    name: 'Ethereal Pad',
    values: [2, 0, 0, 0.5, 0.6,      2, 0, 0.05, 0.5, 0.6,    0, 0, 0,
             0.5, 0.25, 0, 0.2, 0.15, 0.1,        0.6, 0.4, 0.5, 0.8,
             0.8, 0.3, 0.7, 1.0,    0.12, 0, 0, 0.08, 0.06, 0, 0,
             0.65, 8, 0, 0.15, 0, 0.6, 0.25,                  0, 0, -1, 0.02],
  },

  // ═══════════════════════════════════════════════════════════
  // STRINGS
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Analog Strings',
    values: [0, 0, 0, 0.5, 0.9,      0, 0, 0.04, 0.5, 0.9,    0, 0, 0,
             0.4, 0.1, 0, 0.3, 0.15, 0.2,         0.2, 0.4, 0.5, 0.4,
             0.4, 0.3, 0.8, 0.5,    0.15, 0, 0.2, 0.03, 0, 0, 0,
             0.7, 8, 0, 0.15, 0, 0.5, 0.4,                    0, 0, -1, 0.03],
  },
  {
    name: 'Unison Strings',
    values: [0, 0, 0, 0.5, 1,        0, 0, 0.03, 0.5, 1,      0, 0, 0,
             0.45, 0.12, 0, 0.35, 0.15, 0.2,      0.25, 0.4, 0.55, 0.45,
             0.35, 0.3, 0.8, 0.5,   0.12, 0, 0.15, 0.02, 0, 0, 0,
             0.65, 8, 1, 0.2, 0, 0.6, 0.35,                   0, 0, -1, 0.03],
  },

  // ═══════════════════════════════════════════════════════════
  // KEYS / PLUCKS
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Electric Piano',
    values: [2, 0, 0, 0.5, 0.8,      2, 1, 0.01, 0.5, 0.4,    0, 0, 0,
             0.5, 0.1, 0, 0.3, 0.3, 0.4,          0.01, 0.3, 0.2, 0.25,
             0.01, 0.4, 0.5, 0.35,  0, 0, 0, 0, 0, 0, 0,
             0.7, 8, 0, 0.1, 0, 0.4, 0.5,                     0, 0, -1, 0.01],
  },
  {
    name: 'Pluck',
    values: [0, 0, 0, 0.5, 1,        0, 0, 0.03, 0.5, 0.6,    0, 0, 0,
             0.6, 0.2, 0, 0.65, 0.3, 0.3,         0.01, 0.15, 0.1, 0.12,
             0.01, 0.2, 0.3, 0.2,   0, 0, 0, 0, 0, 0, 0,
             0.7, 8, 0, 0.1, 0, 0.3, 0.5,                     0, 0, -1, 0.02],
  },
  {
    name: 'Harpsichord',
    values: [1, 0, 0, 0.4, 1,        1, 1, 0, 0.6, 0.5,       0, 0, 0,
             0.55, 0.15, 0, 0.7, 0.4, 0.5,        0.01, 0.1, 0.05, 0.08,
             0.01, 0.12, 0.2, 0.15, 0, 0, 0, 0, 0, 0, 0,
             0.7, 8, 0, 0.1, 0, 0.3, 0.6,                     0, 0, -1, 0.01],
  },

  // ═══════════════════════════════════════════════════════════
  // FX / EXPERIMENTAL
  // ═══════════════════════════════════════════════════════════
  {
    name: 'XOR Metallic',
    values: [0, 0, 0, 0.5, 1,        0, 0, 0.15, 0.5, 1,      0, 0, 1,
             0.45, 0.4, 0, 0.5, 0.2, 0.3,         0.01, 0.2, 0.25, 0.2,
             0.01, 0.15, 0.7, 0.25, 0.3, 2, 0, 0.1, 0.1, 0, 0,
             0.65, 8, 0, 0.1, 0, 0.3, 0.4,                    0, 0, -1, 0.04],
  },
  {
    name: 'Noise Sweep',
    values: [3, 0, 0, 0.5, 0.8,      0, 0, 0, 0.5, 0.5,       0, 0, 0,
             0.15, 0.5, 0, 0.9, 0, 0,             0.3, 0.8, 0.3, 0.6,
             0.5, 0.6, 0.6, 0.8,    0, 0, 0, 0, 0, 0, 0,
             0.65, 8, 0, 0.1, 0, 0.4, 0.2,                    0.5, 0, -1, 0.02],
  },
  {
    name: 'S&H Random',
    values: [0, 0, 0, 0.5, 1,        1, 0, 0.08, 0.5, 0.7,    0, 0, 0,
             0.35, 0.3, 0, 0.4, 0.2, 0.2,         0.01, 0.2, 0.3, 0.2,
             0.01, 0.15, 0.7, 0.25, 0.5, 4, 0, 0, 0.4, 0, 0.2,
             0.65, 8, 0, 0.1, 0, 0.3, 0.4,                    0, 0, -1, 0.03],
  },
  {
    name: 'PWM Evolve',
    values: [1, 0, 0, 0.3, 1,        1, 0, 0.02, 0.7, 0.9,    0, 0, 0,
             0.4, 0.15, 0, 0.25, 0.1, 0.2,        0.4, 0.5, 0.45, 0.5,
             0.5, 0.4, 0.75, 0.7,   0.2, 0, 0, 0, 0, 0, 0.6,
             0.7, 8, 0, 0.1, 0, 0.4, 0.3,                     0, 0, -1, 0.02],
  },
  {
    name: 'Resonant Sweep',
    values: [0, 0, 0, 0.5, 1,        0, 0, 0.06, 0.5, 0.8,    0, 0, 0,
             0.15, 0.75, 0, 0.85, 0.3, 0.3,       0.2, 0.6, 0.2, 0.5,
             0.3, 0.4, 0.7, 0.6,    0.1, 0, 0, 0, 0.2, 0, 0,
             0.65, 8, 0, 0.1, 0, 0.3, 0.4,                    0, 0, -1, 0.02],
  },
  {
    name: 'Bandpass Drone',
    values: [0, -1, 0, 0.5, 0.9,     0, 0, 0.07, 0.5, 0.9,    0, 0, 0,
             0.4, 0.6, 3, 0.1, 0, 0,              0.01, 0.3, 0.5, 0.4,
             0.8, 0.2, 0.9, 0.8,    0.08, 2, 0, 0.03, 0.05, 0, 0,
             0.6, 8, 0, 0.2, 0, 0.6, 0.2,                     0.15, 0.3, -1, 0.04],
  },

  // ═══════════════════════════════════════════════════════════
  // UNISON / DETUNED
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Supersaw',
    values: [0, 0, 0, 0.5, 1,        0, 0, 0.12, 0.5, 1,      0, 0, 0,
             0.55, 0.15, 0, 0.3, 0.15, 0.2,       0.01, 0.25, 0.4, 0.3,
             0.01, 0.15, 0.8, 0.3,  0, 0, 0, 0, 0, 0, 0,
             0.7, 8, 1, 0.3, 0, 0.5, 0.4,                     0, 0, -1, 0.04],
  },
  {
    name: 'Unison Hoover',
    values: [0, -1, 0, 0.5, 1,       0, 0, 0.1, 0.5, 0.8,     0, 0, 0,
             0.4, 0.3, 0, 0.5, 0.1, 0.3,          0.01, 0.2, 0.2, 0.2,
             0.01, 0.15, 0.75, 0.2, 0.3, 0, 0, 0.05, 0.1, 0, 0,
             0.7, 8, 1, 0.35, 0.05, 0.4, 0.5,                 0, 0.2, -1, 0.05],
  },
  {
    name: 'Thick Unison Pad',
    values: [0, 0, 0, 0.5, 0.85,     1, 0, 0.04, 0.45, 0.85,  0, 0, 0,
             0.35, 0.15, 0, 0.2, 0.1, 0.15,       0.5, 0.5, 0.5, 0.6,
             0.6, 0.4, 0.8, 0.8,    0.1, 0, 0, 0, 0.04, 0, 0.15,
             0.65, 8, 1, 0.25, 0, 0.6, 0.3,                   0, 0, -1, 0.04],
  },
];

/**
 * OBXdSynth - Oberheim OB-X Synthesizer
 */
export class OBXdSynth implements DevilboxSynth {
  readonly name = 'OBXdSynth';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: OBXdConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];
  private pendingPatch: number[] | null = null;

  // Static initialization tracking
  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;

  private _initPromise: Promise<void>;

  constructor(config: Partial<OBXdConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();

    // Apply defaults
    this.config = {
      osc1Waveform: OBXdWaveform.SAW,
      osc1Octave: 0,
      osc1Level: 1,
      osc1PulseWidth: 0.5,
      osc2Waveform: OBXdWaveform.SAW,
      osc2Octave: 0,
      osc2Detune: 0.1,
      osc2Level: 0.7,
      osc2PulseWidth: 0.5,
      filterCutoff: 0.7,
      filterResonance: 0.3,
      filterEnvAmount: 0.5,
      filterAttack: 0.01,
      filterDecay: 0.3,
      filterSustain: 0.3,
      filterRelease: 0.3,
      ampAttack: 0.01,
      ampDecay: 0.2,
      ampSustain: 0.7,
      ampRelease: 0.3,
      lfoRate: 0.2,
      lfoWaveform: OBXdLFOWave.SINE,
      masterVolume: 0.7,
      velocitySensitivity: 0.5,
      panSpread: 0.3,
      ...config,
    };

    // Start initialization and store promise for ensureInitialized()
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  /**
   * Initialize the WASM engine and AudioWorklet
   */
  private async initialize(): Promise<void> {
    try {
      // Get native AudioContext
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Load worklet module (once per session)
      if (!OBXdSynth.isWorkletLoaded) {
        if (!OBXdSynth.workletLoadPromise) {
          OBXdSynth.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}obxd/OBXd.worklet.js`
          );
        }
        await OBXdSynth.workletLoadPromise;
        OBXdSynth.isWorkletLoaded = true;
      }

      // Fetch WASM binary and JS code in parallel
      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}obxd/OBXd.wasm`),
        fetch(`${baseUrl}obxd/OBXd.js`)
      ]);

      if (!wasmResponse.ok) {
        throw new Error(`Failed to load OBXd.wasm: ${wasmResponse.status}`);
      }
      if (!jsResponse.ok) {
        throw new Error(`Failed to load OBXd.js: ${jsResponse.status}`);
      }

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      // Preprocess JS code for AudioWorklet new Function() compatibility:
      // 1. Polyfill URL class (not available in AudioWorklet's WorkletGlobalScope)
      // 2. Replace import.meta.url (not available in Function constructor scope)
      // 3. Remove ES module export statement (invalid syntax in Function body)
      // 4. Strip Node.js-specific dynamic import block (fails in worklet context)
      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}obxd/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      // Create worklet node using native AudioWorkletNode constructor
      this._worklet = new AudioWorkletNode(rawContext, 'obxd-processor');

      // Set up message handler
      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;

          // If a native patch was queued, load it atomically
          if (this.pendingPatch) {
            void loadNativePatch(this._worklet!, this.pendingPatch).catch(() => {});
            this.pendingPatch = null;
          } else {
            // Fall back to flat config
            this.applyConfig(this.config);
          }

          // Process pending notes
          for (const { note, velocity } of this.pendingNotes) {
            this.triggerAttack(note, undefined, velocity / 127);
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('OBXd error:', event.data.error);
        }
      };

      // Initialize WASM engine with binary and JS code
      this._worklet.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode
      });

      // Connect worklet to native GainNode output
      this._worklet.connect(this.output);

      // CRITICAL: Connect through silent keepalive to destination to force process() calls
      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize OBXdSynth:', error);
      throw error;
    }
  }

  /**
   * Apply configuration to the synth
   */
  private applyConfig(config: OBXdConfig): void {
    if (!this._worklet || !this.isInitialized) return;

    // Map config properties to parameter IDs
    const paramMapping: Array<[keyof OBXdConfig, OBXdParamType]> = [
      // Oscillator 1
      ['osc1Waveform', OBXdParam.OSC1_WAVEFORM],
      ['osc1Octave', OBXdParam.OSC1_OCTAVE],
      ['osc1Detune', OBXdParam.OSC1_DETUNE],
      ['osc1PulseWidth', OBXdParam.OSC1_PW],
      ['osc1Level', OBXdParam.OSC1_LEVEL],
      // Oscillator 2
      ['osc2Waveform', OBXdParam.OSC2_WAVEFORM],
      ['osc2Octave', OBXdParam.OSC2_OCTAVE],
      ['osc2Detune', OBXdParam.OSC2_DETUNE],
      ['osc2PulseWidth', OBXdParam.OSC2_PW],
      ['osc2Level', OBXdParam.OSC2_LEVEL],
      // Filter
      ['filterCutoff', OBXdParam.FILTER_CUTOFF],
      ['filterResonance', OBXdParam.FILTER_RESONANCE],
      ['filterType', OBXdParam.FILTER_TYPE],
      ['filterEnvAmount', OBXdParam.FILTER_ENV_AMOUNT],
      ['filterKeyTrack', OBXdParam.FILTER_KEY_TRACK],
      ['filterVelocity', OBXdParam.FILTER_VELOCITY],
      // Filter Envelope
      ['filterAttack', OBXdParam.FILTER_ATTACK],
      ['filterDecay', OBXdParam.FILTER_DECAY],
      ['filterSustain', OBXdParam.FILTER_SUSTAIN],
      ['filterRelease', OBXdParam.FILTER_RELEASE],
      // Amp Envelope
      ['ampAttack', OBXdParam.AMP_ATTACK],
      ['ampDecay', OBXdParam.AMP_DECAY],
      ['ampSustain', OBXdParam.AMP_SUSTAIN],
      ['ampRelease', OBXdParam.AMP_RELEASE],
      // LFO
      ['lfoRate', OBXdParam.LFO_RATE],
      ['lfoWaveform', OBXdParam.LFO_WAVEFORM],
      ['lfoDelay', OBXdParam.LFO_DELAY],
      ['lfoOscAmount', OBXdParam.LFO_OSC_AMOUNT],
      ['lfoFilterAmount', OBXdParam.LFO_FILTER_AMOUNT],
      ['lfoAmpAmount', OBXdParam.LFO_AMP_AMOUNT],
      ['lfoPwAmount', OBXdParam.LFO_PW_AMOUNT],
      // Global
      ['masterVolume', OBXdParam.MASTER_VOLUME],
      ['voices', OBXdParam.VOICES],
      ['unisonDetune', OBXdParam.UNISON_DETUNE],
      ['portamento', OBXdParam.PORTAMENTO],
      ['velocitySensitivity', OBXdParam.VELOCITY_SENSITIVITY],
      ['panSpread', OBXdParam.PAN_SPREAD],
      // Extended
      ['noiseLevel', OBXdParam.NOISE_LEVEL],
      ['subOscLevel', OBXdParam.SUB_OSC_LEVEL],
      ['subOscOctave', OBXdParam.SUB_OSC_OCTAVE],
      ['drift', OBXdParam.DRIFT],
    ];

    for (const [key, paramId] of paramMapping) {
      const value = config[key];
      if (value !== undefined) {
        this.setParameter(paramId, value as number);
      }
    }

    // Handle boolean params
    if (config.oscSync !== undefined) {
      this.setParameter(OBXdParam.OSC_SYNC, config.oscSync ? 1 : 0);
    }
    if (config.oscXor !== undefined) {
      this.setParameter(OBXdParam.OSC_XOR, config.oscXor ? 1 : 0);
    }
    if (config.unison !== undefined) {
      this.setParameter(OBXdParam.UNISON, config.unison ? 1 : 0);
    }
  }

  /**
   * Set a parameter value
   */
  setParameter(paramId: OBXdParamType | number, value: number): void {
    this._worklet?.port.postMessage({
      type: 'parameter',
      paramId,
      value,
    });
  }

  /**
   * Load a preset by name (legacy flat config presets)
   */
  loadPreset(name: keyof typeof OBXD_PRESETS): void {
    const preset = OBXD_PRESETS[name];
    if (preset) {
      this.config = { ...this.config, ...preset };
      this.applyConfig(this.config);
    }
  }

  /**
   * Load a native patch (complete engine state snapshot).
   * If not yet initialized, queues the patch for loading on ready.
   */
  loadPatch(values: number[]): void {
    if (this.isInitialized && this._worklet) {
      void loadNativePatch(this._worklet, values).catch(() => {});
    } else {
      this.pendingPatch = values;
    }
  }

  /**
   * Load a native preset by name from the OBXD_NATIVE_PRESETS map.
   */
  loadNativePreset(name: string): void {
    const preset = OBXD_NATIVE_PRESETS.find(p => p.name === name);
    if (preset) {
      this.loadPatch(preset.values);
    } else {
      console.warn(`[OBXd] Native preset not found: ${name}`);
    }
  }

  /**
   * Capture the current complete engine state (for preset creation).
   */
  async getState(): Promise<number[] | null> {
    if (!this.isInitialized || !this._worklet) return null;
    try {
      const result = await captureNativeState(this._worklet);
      return result.values;
    } catch {
      return null;
    }
  }

  /**
   * Set filter cutoff (0-1)
   */
  setCutoff(value: number): void {
    this.config.filterCutoff = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.FILTER_CUTOFF, this.config.filterCutoff);
  }

  /**
   * Set filter resonance (0-1)
   */
  setResonance(value: number): void {
    this.config.filterResonance = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.FILTER_RESONANCE, this.config.filterResonance);
  }

  /**
   * Set filter envelope amount (0-1)
   */
  setFilterEnvAmount(value: number): void {
    this.config.filterEnvAmount = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.FILTER_ENV_AMOUNT, this.config.filterEnvAmount);
  }

  /**
   * Set oscillator 1 waveform
   */
  setOsc1Waveform(waveform: OBXdWaveformType): void {
    this.config.osc1Waveform = waveform;
    this.setParameter(OBXdParam.OSC1_WAVEFORM, waveform);
  }

  /**
   * Set oscillator 2 waveform
   */
  setOsc2Waveform(waveform: OBXdWaveformType): void {
    this.config.osc2Waveform = waveform;
    this.setParameter(OBXdParam.OSC2_WAVEFORM, waveform);
  }

  /**
   * Set oscillator 2 detune (-1 to +1)
   */
  setOsc2Detune(value: number): void {
    this.config.osc2Detune = Math.max(-1, Math.min(1, value));
    this.setParameter(OBXdParam.OSC2_DETUNE, this.config.osc2Detune);
  }

  /**
   * Set LFO rate (0-1)
   */
  setLfoRate(value: number): void {
    this.config.lfoRate = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.LFO_RATE, this.config.lfoRate);
  }

  /**
   * Set LFO to oscillator modulation amount (0-1)
   */
  setLfoOscAmount(value: number): void {
    this.config.lfoOscAmount = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.LFO_OSC_AMOUNT, this.config.lfoOscAmount);
  }

  /**
   * Set LFO to filter modulation amount (0-1)
   */
  setLfoFilterAmount(value: number): void {
    this.config.lfoFilterAmount = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.LFO_FILTER_AMOUNT, this.config.lfoFilterAmount);
  }

  /**
   * Set portamento/glide time (0-1)
   */
  setPortamento(value: number): void {
    this.config.portamento = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.PORTAMENTO, this.config.portamento);
  }

  /**
   * Set unison mode
   */
  setUnison(enabled: boolean): void {
    this.config.unison = enabled;
    this.setParameter(OBXdParam.UNISON, enabled ? 1 : 0);
  }

  /**
   * Set unison detune (0-1)
   */
  setUnisonDetune(value: number): void {
    this.config.unisonDetune = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.UNISON_DETUNE, this.config.unisonDetune);
  }

  /**
   * Set master volume (0-1)
   */
  setVolume(value: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, value));
    this.setParameter(OBXdParam.MASTER_VOLUME, this.config.masterVolume);
  }

  /**
   * Trigger a note
   */
  triggerAttack(
    frequency: number | string,
    _time?: number,
    velocity = 1
  ): this {
    const midiNote = noteToMidi(frequency);

    const vel = Math.round(velocity * 127);

    if (!this.isInitialized) {
      this.pendingNotes.push({ note: midiNote, velocity: vel });
      return this;
    }

    this._worklet?.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: vel,
    });

    return this;
  }

  /**
   * Release a note
   */
  triggerRelease(frequency?: number | string, time?: number): this {
    void time;
    if (!this._worklet) return this;

    if (frequency !== undefined) {
      const midiNote = noteToMidi(frequency);

      this._worklet.port.postMessage({
        type: 'noteOff',
        note: midiNote,
      });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }

    return this;
  }

  /**
   * Release all voices (panic button, song stop, etc.)
   */
  releaseAll(): void {
    this._worklet?.port.postMessage({ type: 'allNotesOff' });
  }

  /**
   * Send MIDI Control Change
   */
  controlChange(cc: number, value: number): void {
    this._worklet?.port.postMessage({
      type: 'controlChange',
      cc,
      value,
    });
  }

  /**
   * Send pitch bend (0-16383, 8192 = center)
   */
  pitchBend(value: number): void {
    this._worklet?.port.postMessage({
      type: 'pitchBend',
      value,
    });
  }

  /** NKS param name → OBXd param ID for automation */
  private static readonly NKS_TO_PARAM: Record<string, number> = {
    'osc1Waveform': OBXdParam.OSC1_WAVEFORM, 'osc1Octave': OBXdParam.OSC1_OCTAVE,
    'osc1PulseWidth': OBXdParam.OSC1_PW, 'osc1Level': OBXdParam.OSC1_LEVEL,
    'osc2Waveform': OBXdParam.OSC2_WAVEFORM, 'osc2Octave': OBXdParam.OSC2_OCTAVE,
    'osc2Detune': OBXdParam.OSC2_DETUNE, 'osc2Level': OBXdParam.OSC2_LEVEL,
    'filterCutoff': OBXdParam.FILTER_CUTOFF, 'filterResonance': OBXdParam.FILTER_RESONANCE,
    'filterEnvAmount': OBXdParam.FILTER_ENV_AMOUNT, 'filterKeyTrack': OBXdParam.FILTER_KEY_TRACK,
    'filterAttack': OBXdParam.FILTER_ATTACK, 'filterDecay': OBXdParam.FILTER_DECAY,
    'filterSustain': OBXdParam.FILTER_SUSTAIN, 'filterRelease': OBXdParam.FILTER_RELEASE,
    'ampAttack': OBXdParam.AMP_ATTACK, 'ampDecay': OBXdParam.AMP_DECAY,
    'ampSustain': OBXdParam.AMP_SUSTAIN, 'ampRelease': OBXdParam.AMP_RELEASE,
    'lfoRate': OBXdParam.LFO_RATE, 'lfoWaveform': OBXdParam.LFO_WAVEFORM,
    'lfoOscAmount': OBXdParam.LFO_OSC_AMOUNT, 'lfoFilterAmount': OBXdParam.LFO_FILTER_AMOUNT,
    'lfoAmpAmount': OBXdParam.LFO_AMP_AMOUNT, 'lfoPwAmount': OBXdParam.LFO_PW_AMOUNT,
    'masterVolume': OBXdParam.MASTER_VOLUME, 'portamento': OBXdParam.PORTAMENTO,
    'unisonDetune': OBXdParam.UNISON_DETUNE,
  };

  /**
   * Set a named parameter (for automation). Maps NKS param names to OBXd parameter IDs.
   */
  set(param: string, value: number): void {
    const paramId = OBXdSynth.NKS_TO_PARAM[param];
    if (paramId !== undefined) {
      this.setParameter(paramId, value);
    } else if (param === 'unison') {
      this.setParameter(OBXdParam.UNISON, value >= 0.5 ? 1 : 0);
    } else if (param === 'oscSync') {
      this.setParameter(OBXdParam.OSC_SYNC, value >= 0.5 ? 1 : 0);
    }
  }

  get(param: string): number | undefined {
    const key = param as keyof OBXdConfig;
    const val = this.config[key];
    return typeof val === 'number' ? val : undefined;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this._worklet?.port.postMessage({ type: 'allNotesOff' });
    this._worklet?.disconnect();
    this._worklet = null;
    this.output.disconnect();
  }
}

export default OBXdSynth;
