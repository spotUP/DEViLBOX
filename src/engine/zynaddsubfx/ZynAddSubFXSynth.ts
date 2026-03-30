/**
 * ZynAddSubFXSynth.ts - ZynAddSubFX WASM engine for DEViLBOX
 *
 * Features:
 * - ADDsynth: 4 voices with waveform, volume, detune
 * - SUBsynth: subtractive synthesis with harmonics
 * - PADsynth: pad synthesis with bandwidth control
 * - Global filter with ADSR envelope
 * - Amp envelope (ADSR)
 * - Effects: reverb, chorus, distortion, EQ
 * - ~70 parameters
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

export const ZynAddSubFXParam = {
  // ADDsynth (0-19)
  ADD_ENABLE: 0, ADD_VOLUME: 1, ADD_PANNING: 2, ADD_DETUNE: 3, ADD_OCTAVE: 4,
  ADD_V1_WAVE: 5, ADD_V1_VOLUME: 6, ADD_V1_DETUNE: 7,
  ADD_V2_WAVE: 8, ADD_V2_VOLUME: 9, ADD_V2_DETUNE: 10, ADD_V2_OCTAVE: 11,
  ADD_V3_WAVE: 12, ADD_V3_VOLUME: 13, ADD_V3_DETUNE: 14, ADD_V3_OCTAVE: 15,
  ADD_V4_WAVE: 16, ADD_V4_VOLUME: 17, ADD_V4_DETUNE: 18, ADD_V4_OCTAVE: 19,
  // SUBsynth (20-34)
  SUB_ENABLE: 20, SUB_VOLUME: 21, SUB_PANNING: 22, SUB_OCTAVE: 23, SUB_DETUNE: 24,
  SUB_BANDWIDTH: 25, SUB_BANDWIDTH_SCALE: 26,
  SUB_NUM_HARMONICS: 27, SUB_MAG_TYPE: 28,
  SUB_HARM_1: 29, SUB_HARM_2: 30, SUB_HARM_3: 31, SUB_HARM_4: 32, SUB_HARM_5: 33, SUB_HARM_6: 34,
  // PADsynth (35-44)
  PAD_ENABLE: 35, PAD_VOLUME: 36, PAD_PANNING: 37,
  PAD_BANDWIDTH: 38, PAD_BANDWIDTH_SCALE: 39,
  PAD_PROFILE_WIDTH: 40, PAD_PROFILE_STRETCH: 41,
  PAD_OCTAVE: 42, PAD_DETUNE: 43, PAD_QUALITY: 44,
  // Global filter (45-54)
  FILTER_TYPE: 45, FILTER_CUTOFF: 46, FILTER_RESONANCE: 47,
  FILTER_ENV_AMOUNT: 48, FILTER_VELOCITY: 49,
  FILTER_ATTACK: 50, FILTER_DECAY: 51, FILTER_SUSTAIN: 52, FILTER_RELEASE: 53,
  FILTER_KEY_TRACK: 54,
  // Amp envelope (55-58)
  AMP_ATTACK: 55, AMP_DECAY: 56, AMP_SUSTAIN: 57, AMP_RELEASE: 58,
  // Effects (59-69)
  REVERB_WET: 59, REVERB_SIZE: 60, REVERB_DAMP: 61,
  CHORUS_WET: 62, CHORUS_RATE: 63, CHORUS_DEPTH: 64,
  DISTORTION_WET: 65, DISTORTION_DRIVE: 66, DISTORTION_TYPE: 67,
  EQ_LOW: 68, EQ_HIGH: 69,
} as const;

export const ZYNADDSUBFX_PARAM_NAMES: Record<number, string> = {
  0: 'ADD Enable', 1: 'ADD Volume', 2: 'ADD Pan', 3: 'ADD Detune', 4: 'ADD Octave',
  5: 'V1 Wave', 6: 'V1 Volume', 7: 'V1 Detune',
  8: 'V2 Wave', 9: 'V2 Volume', 10: 'V2 Detune', 11: 'V2 Octave',
  12: 'V3 Wave', 13: 'V3 Volume', 14: 'V3 Detune', 15: 'V3 Octave',
  16: 'V4 Wave', 17: 'V4 Volume', 18: 'V4 Detune', 19: 'V4 Octave',
  20: 'SUB Enable', 21: 'SUB Volume', 22: 'SUB Pan', 23: 'SUB Octave', 24: 'SUB Detune',
  25: 'SUB Bandwidth', 26: 'SUB BW Scale',
  27: 'SUB Harmonics', 28: 'SUB Mag Type',
  29: 'Harm 1', 30: 'Harm 2', 31: 'Harm 3', 32: 'Harm 4', 33: 'Harm 5', 34: 'Harm 6',
  35: 'PAD Enable', 36: 'PAD Volume', 37: 'PAD Pan',
  38: 'PAD Bandwidth', 39: 'PAD BW Scale',
  40: 'PAD Profile W', 41: 'PAD Stretch',
  42: 'PAD Octave', 43: 'PAD Detune', 44: 'PAD Quality',
  45: 'Filter Type', 46: 'Cutoff', 47: 'Resonance',
  48: 'Filt Env', 49: 'Filt Vel',
  50: 'Filt Atk', 51: 'Filt Dec', 52: 'Filt Sus', 53: 'Filt Rel',
  54: 'Key Track',
  55: 'Amp Atk', 56: 'Amp Dec', 57: 'Amp Sus', 58: 'Amp Rel',
  59: 'Reverb', 60: 'Rev Size', 61: 'Rev Damp',
  62: 'Chorus', 63: 'Chr Rate', 64: 'Chr Depth',
  65: 'Distort', 66: 'Drive', 67: 'Dist Type',
  68: 'EQ Low', 69: 'EQ High',
};

export interface ZynAddSubFXConfig {
  // ADDsynth
  addEnable?: number;       // 0/1
  addVolume?: number;       // 0-1
  addPanning?: number;      // -1 to 1
  addDetune?: number;       // -1 to 1
  addOctave?: number;       // -4 to 4
  addVoice1Wave?: number;   // 0-6: sine/tri/saw/square/noise/voice/chirp
  addVoice1Volume?: number; // 0-1
  addVoice1Detune?: number; // -1 to 1
  addVoice2Wave?: number;
  addVoice2Volume?: number;
  addVoice2Detune?: number;
  addVoice2Octave?: number; // -4 to 4
  addVoice3Wave?: number;
  addVoice3Volume?: number;
  addVoice3Detune?: number;
  addVoice3Octave?: number;
  addVoice4Wave?: number;
  addVoice4Volume?: number;
  addVoice4Detune?: number;
  addVoice4Octave?: number;
  // SUBsynth
  subEnable?: number;           // 0/1
  subVolume?: number;           // 0-1
  subPanning?: number;          // -1 to 1
  subOctave?: number;           // -4 to 4
  subDetune?: number;           // -1 to 1
  subBandwidth?: number;        // 0-1
  subBandwidthScale?: number;   // 0-1
  subNumHarmonics?: number;     // 1-64
  subMagType?: number;          // 0-3: linear/dB/-40dB/-60dB
  subHarmonic1?: number;        // 0-1
  subHarmonic2?: number;
  subHarmonic3?: number;
  subHarmonic4?: number;
  subHarmonic5?: number;
  subHarmonic6?: number;
  // PADsynth
  padEnable?: number;           // 0/1
  padVolume?: number;           // 0-1
  padPanning?: number;          // -1 to 1
  padBandwidth?: number;        // 0-1
  padBandwidthScale?: number;   // 0-1
  padProfileWidth?: number;     // 0-1
  padProfileStretch?: number;   // 0-1
  padOctave?: number;           // -4 to 4
  padDetune?: number;           // -1 to 1
  padQuality?: number;          // 0-3
  // Global filter
  filterType?: number;          // 0-5: LP/HP/BP/Notch/Peak/LShelf
  filterCutoff?: number;        // 0-1
  filterResonance?: number;     // 0-1
  filterEnvAmount?: number;     // 0-1
  filterVelocity?: number;      // 0-1
  filterAttack?: number;        // 0-1
  filterDecay?: number;         // 0-1
  filterSustain?: number;       // 0-1
  filterRelease?: number;       // 0-1
  filterKeyTrack?: number;      // 0-1
  // Amp envelope
  ampAttack?: number;           // 0-1
  ampDecay?: number;            // 0-1
  ampSustain?: number;          // 0-1
  ampRelease?: number;          // 0-1
  // Effects
  reverbWet?: number;           // 0-1
  reverbSize?: number;          // 0-1
  reverbDamp?: number;          // 0-1
  chorusWet?: number;           // 0-1
  chorusRate?: number;          // 0-1
  chorusDepth?: number;         // 0-1
  distortionWet?: number;       // 0-1
  distortionDrive?: number;     // 0-1
  distortionType?: number;      // 0-4
  eqLow?: number;               // 0-1
  eqHigh?: number;              // 0-1
}

export const DEFAULT_ZYNADDSUBFX: ZynAddSubFXConfig = {
  // ADDsynth: on, single sine voice
  addEnable: 1, addVolume: 0.8, addPanning: 0, addDetune: 0, addOctave: 0,
  addVoice1Wave: 0, addVoice1Volume: 1.0, addVoice1Detune: 0,
  addVoice2Wave: 0, addVoice2Volume: 0, addVoice2Detune: 0, addVoice2Octave: 0,
  addVoice3Wave: 0, addVoice3Volume: 0, addVoice3Detune: 0, addVoice3Octave: 0,
  addVoice4Wave: 0, addVoice4Volume: 0, addVoice4Detune: 0, addVoice4Octave: 0,
  // SUBsynth: off
  subEnable: 0, subVolume: 0.8, subPanning: 0, subOctave: 0, subDetune: 0,
  subBandwidth: 0.5, subBandwidthScale: 0.5,
  subNumHarmonics: 8, subMagType: 0,
  subHarmonic1: 1.0, subHarmonic2: 0.5, subHarmonic3: 0.3, subHarmonic4: 0.2, subHarmonic5: 0.1, subHarmonic6: 0.05,
  // PADsynth: off
  padEnable: 0, padVolume: 0.8, padPanning: 0,
  padBandwidth: 0.5, padBandwidthScale: 0.5,
  padProfileWidth: 0.5, padProfileStretch: 0.5,
  padOctave: 0, padDetune: 0, padQuality: 1,
  // Global filter: LP, open
  filterType: 0, filterCutoff: 0.8, filterResonance: 0.2,
  filterEnvAmount: 0, filterVelocity: 0.5,
  filterAttack: 0.01, filterDecay: 0.3, filterSustain: 0.7, filterRelease: 0.3,
  filterKeyTrack: 0.5,
  // Amp envelope
  ampAttack: 0.01, ampDecay: 0.1, ampSustain: 1.0, ampRelease: 0.2,
  // Effects: all dry
  reverbWet: 0, reverbSize: 0.5, reverbDamp: 0.5,
  chorusWet: 0, chorusRate: 0.3, chorusDepth: 0.3,
  distortionWet: 0, distortionDrive: 0.3, distortionType: 0,
  eqLow: 0.5, eqHigh: 0.5,
};

export const ZYNADDSUBFX_PRESETS: Record<string, ZynAddSubFXConfig> = {
  'Additive Pad': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, addVolume: 0.7,
    addVoice1Wave: 0, addVoice1Volume: 1.0, addVoice1Detune: 0,
    addVoice2Wave: 0, addVoice2Volume: 0.8, addVoice2Detune: 0.1, addVoice2Octave: 0,
    addVoice3Wave: 0, addVoice3Volume: 0.6, addVoice3Detune: -0.1, addVoice3Octave: 0,
    addVoice4Wave: 0, addVoice4Volume: 0.4, addVoice4Detune: 0.05, addVoice4Octave: 1,
    subEnable: 0, padEnable: 0,
    ampAttack: 0.4, ampDecay: 0.2, ampSustain: 0.8, ampRelease: 0.6,
    filterCutoff: 0.6, filterResonance: 0.1, filterEnvAmount: 0.2,
    chorusWet: 0.3, chorusRate: 0.2, chorusDepth: 0.4,
    reverbWet: 0.2,
  },
  'Sub Bass': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 0, subEnable: 1, padEnable: 0,
    subVolume: 0.9, subOctave: -1,
    subBandwidth: 0.3, subNumHarmonics: 4, subMagType: 0,
    subHarmonic1: 1.0, subHarmonic2: 0.7, subHarmonic3: 0.3, subHarmonic4: 0.1, subHarmonic5: 0, subHarmonic6: 0,
    filterCutoff: 0.4, filterResonance: 0.3,
    ampAttack: 0.01, ampDecay: 0.2, ampSustain: 0.9, ampRelease: 0.15,
  },
  'PAD Atmosphere': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 0, subEnable: 0, padEnable: 1,
    padVolume: 0.7, padBandwidth: 0.8, padBandwidthScale: 0.6,
    padProfileWidth: 0.7, padProfileStretch: 0.4, padQuality: 2,
    ampAttack: 0.6, ampDecay: 0.3, ampSustain: 0.7, ampRelease: 1.0,
    filterCutoff: 0.5, filterResonance: 0.15, filterEnvAmount: 0.1,
    reverbWet: 0.6, reverbSize: 0.8, reverbDamp: 0.3,
  },
  'FM Lead': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 0,
    addVolume: 0.8,
    addVoice1Wave: 0, addVoice1Volume: 1.0, addVoice1Detune: 0,
    addVoice2Wave: 2, addVoice2Volume: 0.6, addVoice2Detune: 0, addVoice2Octave: 1,
    ampAttack: 0.01, ampDecay: 0.15, ampSustain: 0.7, ampRelease: 0.2,
    filterCutoff: 0.7, filterResonance: 0.4, filterEnvAmount: 0.5,
    filterAttack: 0.01, filterDecay: 0.4, filterSustain: 0.3, filterRelease: 0.2,
    distortionWet: 0.15, distortionDrive: 0.4,
  },
  'Full Stack': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 1, padEnable: 1,
    addVolume: 0.5, subVolume: 0.4, padVolume: 0.3,
    addVoice1Wave: 2, addVoice1Volume: 0.8, addVoice1Detune: 0.05,
    addVoice2Wave: 0, addVoice2Volume: 0.6, addVoice2Detune: -0.05, addVoice2Octave: 0,
    subBandwidth: 0.6, subNumHarmonics: 12,
    padBandwidth: 0.7, padQuality: 2,
    ampAttack: 0.1, ampSustain: 0.8, ampRelease: 0.5,
    filterCutoff: 0.65, filterResonance: 0.25,
    reverbWet: 0.25, chorusWet: 0.15,
  },
  'Warm Strings': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 1,
    addVolume: 0.5, padVolume: 0.5,
    addVoice1Wave: 2, addVoice1Volume: 0.7, addVoice1Detune: 0.03,
    addVoice2Wave: 2, addVoice2Volume: 0.7, addVoice2Detune: -0.03,
    padBandwidth: 0.6, padQuality: 2,
    ampAttack: 0.35, ampDecay: 0.2, ampSustain: 0.85, ampRelease: 0.5,
    filterCutoff: 0.55, filterResonance: 0.1, filterEnvAmount: 0.15,
    chorusWet: 0.25, chorusRate: 0.15, chorusDepth: 0.35,
    reverbWet: 0.3, reverbSize: 0.7,
  },
  'Crystal Bell': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 0,
    addVolume: 0.75,
    addVoice1Wave: 0, addVoice1Volume: 1.0, addVoice1Detune: 0,
    addVoice2Wave: 0, addVoice2Volume: 0.5, addVoice2Detune: 0, addVoice2Octave: 2,
    addVoice3Wave: 0, addVoice3Volume: 0.3, addVoice3Detune: 0.02, addVoice3Octave: 3,
    addVoice4Wave: 0, addVoice4Volume: 0.15, addVoice4Detune: -0.01, addVoice4Octave: 4,
    ampAttack: 0.005, ampDecay: 0.6, ampSustain: 0.1, ampRelease: 0.8,
    filterCutoff: 0.85, filterResonance: 0.05,
    reverbWet: 0.45, reverbSize: 0.75, reverbDamp: 0.4,
  },
  'Dark Ambient': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 0, subEnable: 1, padEnable: 1,
    subVolume: 0.6, subOctave: -1, subBandwidth: 0.7, subNumHarmonics: 16, subMagType: 1,
    subHarmonic1: 1.0, subHarmonic2: 0.5, subHarmonic3: 0.3, subHarmonic4: 0.6,
    subHarmonic5: 0.1, subHarmonic6: 0.4,
    padVolume: 0.5, padBandwidth: 0.9, padBandwidthScale: 0.7, padQuality: 3,
    ampAttack: 0.8, ampDecay: 0.4, ampSustain: 0.6, ampRelease: 1.0,
    filterCutoff: 0.35, filterResonance: 0.2, filterEnvAmount: 0.1,
    reverbWet: 0.7, reverbSize: 0.9, reverbDamp: 0.2,
  },
  'Analog Bass': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 1, padEnable: 0,
    addVolume: 0.7, addVoice1Wave: 2, addVoice1Volume: 0.9,
    addVoice2Wave: 3, addVoice2Volume: 0.4, addVoice2Octave: -1,
    subVolume: 0.5, subOctave: -1, subBandwidth: 0.2, subNumHarmonics: 6,
    subHarmonic1: 1.0, subHarmonic2: 0.8, subHarmonic3: 0.4, subHarmonic4: 0.2,
    subHarmonic5: 0.1, subHarmonic6: 0.05,
    ampAttack: 0.005, ampDecay: 0.3, ampSustain: 0.7, ampRelease: 0.12,
    filterCutoff: 0.45, filterResonance: 0.45, filterEnvAmount: 0.4,
    filterAttack: 0.005, filterDecay: 0.35, filterSustain: 0.2, filterRelease: 0.15,
    distortionWet: 0.1, distortionDrive: 0.25,
  },
  'Choir Pad': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 1,
    addVolume: 0.55,
    addVoice1Wave: 0, addVoice1Volume: 0.8, addVoice1Detune: 0.04,
    addVoice2Wave: 0, addVoice2Volume: 0.8, addVoice2Detune: -0.04,
    addVoice3Wave: 0, addVoice3Volume: 0.5, addVoice3Detune: 0.08, addVoice3Octave: 1,
    padVolume: 0.45, padBandwidth: 0.75, padProfileWidth: 0.6, padQuality: 2,
    ampAttack: 0.5, ampDecay: 0.25, ampSustain: 0.8, ampRelease: 0.7,
    filterCutoff: 0.5, filterResonance: 0.1, filterEnvAmount: 0.15,
    chorusWet: 0.35, chorusRate: 0.18, chorusDepth: 0.45,
    reverbWet: 0.4, reverbSize: 0.8, reverbDamp: 0.35,
  },
  'Pluck Synth': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 0,
    addVolume: 0.8,
    addVoice1Wave: 2, addVoice1Volume: 1.0,
    addVoice2Wave: 3, addVoice2Volume: 0.4, addVoice2Octave: 1,
    ampAttack: 0.002, ampDecay: 0.4, ampSustain: 0.05, ampRelease: 0.3,
    filterCutoff: 0.75, filterResonance: 0.3, filterEnvAmount: 0.6,
    filterAttack: 0.002, filterDecay: 0.35, filterSustain: 0.1, filterRelease: 0.25,
    reverbWet: 0.15,
  },
  'Organ Tone': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 0,
    addVolume: 0.7,
    addVoice1Wave: 0, addVoice1Volume: 1.0, addVoice1Detune: 0,
    addVoice2Wave: 0, addVoice2Volume: 0.7, addVoice2Detune: 0, addVoice2Octave: 1,
    addVoice3Wave: 0, addVoice3Volume: 0.5, addVoice3Detune: 0, addVoice3Octave: 2,
    addVoice4Wave: 0, addVoice4Volume: 0.3, addVoice4Detune: 0, addVoice4Octave: -1,
    ampAttack: 0.01, ampDecay: 0.05, ampSustain: 0.95, ampRelease: 0.08,
    filterCutoff: 0.7, filterResonance: 0.05,
    chorusWet: 0.2, chorusRate: 0.3, chorusDepth: 0.25,
    reverbWet: 0.15, reverbSize: 0.5,
  },
  'Brass Section': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 1, padEnable: 0,
    addVolume: 0.65,
    addVoice1Wave: 2, addVoice1Volume: 0.9, addVoice1Detune: 0.02,
    addVoice2Wave: 2, addVoice2Volume: 0.8, addVoice2Detune: -0.02,
    subVolume: 0.35, subBandwidth: 0.4, subNumHarmonics: 8,
    subHarmonic1: 1.0, subHarmonic2: 0.6, subHarmonic3: 0.8, subHarmonic4: 0.3,
    subHarmonic5: 0.5, subHarmonic6: 0.2,
    ampAttack: 0.08, ampDecay: 0.15, ampSustain: 0.85, ampRelease: 0.2,
    filterCutoff: 0.6, filterResonance: 0.2, filterEnvAmount: 0.35,
    filterAttack: 0.05, filterDecay: 0.3, filterSustain: 0.5, filterRelease: 0.15,
    reverbWet: 0.2, reverbSize: 0.6,
  },
  'Metallic Hit': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 0,
    addVolume: 0.85,
    addVoice1Wave: 0, addVoice1Volume: 1.0, addVoice1Detune: 0,
    addVoice2Wave: 0, addVoice2Volume: 0.7, addVoice2Detune: 0.15, addVoice2Octave: 2,
    addVoice3Wave: 0, addVoice3Volume: 0.5, addVoice3Detune: -0.12, addVoice3Octave: 3,
    addVoice4Wave: 0, addVoice4Volume: 0.35, addVoice4Detune: 0.22, addVoice4Octave: 4,
    ampAttack: 0.001, ampDecay: 0.5, ampSustain: 0.0, ampRelease: 0.6,
    filterCutoff: 0.9, filterResonance: 0.15,
    reverbWet: 0.35, reverbSize: 0.65, reverbDamp: 0.5,
  },
  'Saw Lead': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 0,
    addVolume: 0.8,
    addVoice1Wave: 2, addVoice1Volume: 1.0, addVoice1Detune: 0.06,
    addVoice2Wave: 2, addVoice2Volume: 0.9, addVoice2Detune: -0.06,
    ampAttack: 0.01, ampDecay: 0.1, ampSustain: 0.8, ampRelease: 0.15,
    filterCutoff: 0.65, filterResonance: 0.35, filterEnvAmount: 0.3,
    filterAttack: 0.01, filterDecay: 0.25, filterSustain: 0.4, filterRelease: 0.15,
    distortionWet: 0.08, distortionDrive: 0.2,
  },
  'Sub Drone': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 0, subEnable: 1, padEnable: 0,
    subVolume: 0.85, subOctave: -2,
    subBandwidth: 0.15, subNumHarmonics: 3, subMagType: 0,
    subHarmonic1: 1.0, subHarmonic2: 0.5, subHarmonic3: 0.2,
    subHarmonic4: 0, subHarmonic5: 0, subHarmonic6: 0,
    ampAttack: 0.5, ampDecay: 0.1, ampSustain: 1.0, ampRelease: 0.8,
    filterCutoff: 0.3, filterResonance: 0.15,
    reverbWet: 0.4, reverbSize: 0.85,
  },
  'Ice Pad': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 0, subEnable: 0, padEnable: 1,
    padVolume: 0.7, padBandwidth: 0.4, padBandwidthScale: 0.3,
    padProfileWidth: 0.5, padProfileStretch: 0.6, padQuality: 3,
    ampAttack: 0.7, ampDecay: 0.3, ampSustain: 0.65, ampRelease: 0.9,
    filterCutoff: 0.7, filterResonance: 0.25, filterEnvAmount: 0.2,
    filterAttack: 0.5, filterDecay: 0.4, filterSustain: 0.6, filterRelease: 0.5,
    chorusWet: 0.4, chorusRate: 0.1, chorusDepth: 0.5,
    reverbWet: 0.55, reverbSize: 0.85, reverbDamp: 0.15,
  },
  'Detuned Poly': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 0,
    addVolume: 0.7,
    addVoice1Wave: 2, addVoice1Volume: 0.9, addVoice1Detune: 0.08,
    addVoice2Wave: 2, addVoice2Volume: 0.9, addVoice2Detune: -0.08,
    addVoice3Wave: 3, addVoice3Volume: 0.5, addVoice3Detune: 0.12, addVoice3Octave: 1,
    addVoice4Wave: 3, addVoice4Volume: 0.5, addVoice4Detune: -0.12, addVoice4Octave: 1,
    ampAttack: 0.05, ampDecay: 0.2, ampSustain: 0.75, ampRelease: 0.35,
    filterCutoff: 0.6, filterResonance: 0.15, filterEnvAmount: 0.2,
    filterAttack: 0.03, filterDecay: 0.3, filterSustain: 0.4, filterRelease: 0.2,
    chorusWet: 0.2, chorusRate: 0.25, chorusDepth: 0.3,
    reverbWet: 0.2,
  },
  'Noise Texture': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 0, padEnable: 0,
    addVolume: 0.6,
    addVoice1Wave: 4, addVoice1Volume: 0.7,
    addVoice2Wave: 0, addVoice2Volume: 0.4, addVoice2Detune: 0,
    ampAttack: 0.3, ampDecay: 0.5, ampSustain: 0.4, ampRelease: 0.7,
    filterCutoff: 0.45, filterResonance: 0.35, filterEnvAmount: 0.3,
    filterAttack: 0.2, filterDecay: 0.6, filterSustain: 0.25, filterRelease: 0.4,
    reverbWet: 0.5, reverbSize: 0.7, reverbDamp: 0.4,
  },
  'Hybrid Stack': {
    ...DEFAULT_ZYNADDSUBFX,
    addEnable: 1, subEnable: 1, padEnable: 1,
    addVolume: 0.45, subVolume: 0.35, padVolume: 0.35,
    addVoice1Wave: 2, addVoice1Volume: 0.8, addVoice1Detune: 0.04,
    addVoice2Wave: 3, addVoice2Volume: 0.5, addVoice2Detune: -0.04, addVoice2Octave: 1,
    subBandwidth: 0.5, subNumHarmonics: 10, subOctave: -1,
    subHarmonic1: 1.0, subHarmonic2: 0.6, subHarmonic3: 0.4, subHarmonic4: 0.3,
    subHarmonic5: 0.2, subHarmonic6: 0.1,
    padBandwidth: 0.65, padQuality: 2,
    ampAttack: 0.15, ampDecay: 0.2, ampSustain: 0.8, ampRelease: 0.45,
    filterCutoff: 0.6, filterResonance: 0.2, filterEnvAmount: 0.25,
    chorusWet: 0.2, chorusRate: 0.2, chorusDepth: 0.3,
    reverbWet: 0.3, reverbSize: 0.65,
  },
};

const CONFIG_KEYS: (keyof ZynAddSubFXConfig)[] = [
  // ADDsynth (0-19)
  'addEnable', 'addVolume', 'addPanning', 'addDetune', 'addOctave',
  'addVoice1Wave', 'addVoice1Volume', 'addVoice1Detune',
  'addVoice2Wave', 'addVoice2Volume', 'addVoice2Detune', 'addVoice2Octave',
  'addVoice3Wave', 'addVoice3Volume', 'addVoice3Detune', 'addVoice3Octave',
  'addVoice4Wave', 'addVoice4Volume', 'addVoice4Detune', 'addVoice4Octave',
  // SUBsynth (20-34)
  'subEnable', 'subVolume', 'subPanning', 'subOctave', 'subDetune',
  'subBandwidth', 'subBandwidthScale',
  'subNumHarmonics', 'subMagType',
  'subHarmonic1', 'subHarmonic2', 'subHarmonic3', 'subHarmonic4', 'subHarmonic5', 'subHarmonic6',
  // PADsynth (35-44)
  'padEnable', 'padVolume', 'padPanning',
  'padBandwidth', 'padBandwidthScale',
  'padProfileWidth', 'padProfileStretch',
  'padOctave', 'padDetune', 'padQuality',
  // Global filter (45-54)
  'filterType', 'filterCutoff', 'filterResonance',
  'filterEnvAmount', 'filterVelocity',
  'filterAttack', 'filterDecay', 'filterSustain', 'filterRelease',
  'filterKeyTrack',
  // Amp envelope (55-58)
  'ampAttack', 'ampDecay', 'ampSustain', 'ampRelease',
  // Effects (59-69)
  'reverbWet', 'reverbSize', 'reverbDamp',
  'chorusWet', 'chorusRate', 'chorusDepth',
  'distortionWet', 'distortionDrive', 'distortionType',
  'eqLow', 'eqHigh',
];

export class ZynAddSubFXSynthEngine implements DevilboxSynth {
  readonly name = 'ZynAddSubFXSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: ZynAddSubFXConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<ZynAddSubFXConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_ZYNADDSUBFX, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!ZynAddSubFXSynthEngine.isWorkletLoaded) {
        if (!ZynAddSubFXSynthEngine.workletLoadPromise) {
          ZynAddSubFXSynthEngine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}zynaddsubfx/ZynAddSubFX.worklet.js`
          );
        }
        await ZynAddSubFXSynthEngine.workletLoadPromise;
        ZynAddSubFXSynthEngine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}zynaddsubfx/ZynAddSubFX.wasm`),
        fetch(`${baseUrl}zynaddsubfx/ZynAddSubFX.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load ZynAddSubFX.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load ZynAddSubFX.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}zynaddsubfx/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      this._worklet = new AudioWorkletNode(rawContext, 'zynaddsubfx-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          this.sendConfig(this.config);
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('ZynAddSubFX error:', event.data.error);
        }
      };

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
      console.error('Failed to initialize ZynAddSubFX:', error);
      throw error;
    }
  }

  private sendConfig(config: ZynAddSubFXConfig): void {
    if (!this._worklet || !this.isInitialized) return;
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const value = config[CONFIG_KEYS[i]];
      if (value !== undefined) {
        this._worklet.port.postMessage({ type: 'setParam', index: i, value });
      }
    }
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
    const vel = Math.round((velocity ?? 0.8) * 127);
    if (!this.isInitialized || !this._worklet) {
      this.pendingNotes.push({ note, velocity: vel });
      return this;
    }
    this._worklet.port.postMessage({ type: 'noteOn', note, velocity: vel });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet || !this.isInitialized) return this;
    if (frequency !== undefined) {
      const note = typeof frequency === 'string' ? noteToMidi(frequency) : Math.round(12 * Math.log2(frequency / 440) + 69);
      this._worklet.port.postMessage({ type: 'noteOff', note });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  set(param: string, value: number): void {
    const index = CONFIG_KEYS.indexOf(param as keyof ZynAddSubFXConfig);
    if (index >= 0) {
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
    const preset = ZYNADDSUBFX_PRESETS[name];
    if (preset) {
      this.config = { ...preset };
      this.sendConfig(this.config);
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

export class ZynAddSubFXSynthImpl extends ZynAddSubFXSynthEngine {
  async init(): Promise<void> {
    return this.ensureInitialized();
  }

  applyConfig(config: Partial<ZynAddSubFXConfig>): void {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number') {
        this.set(key, value);
      }
    }
  }
}
