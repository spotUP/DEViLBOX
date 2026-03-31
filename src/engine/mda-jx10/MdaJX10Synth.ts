/**
 * MdaJX10Synth.ts - MDA JX-10 (Roland JX-8P inspired) WASM synthesizer for DEViLBOX
 *
 * Features:
 * - 8-voice polyphonic dual-oscillator subtractive synth
 * - Bandlimited sinc-loop sawtooth oscillators
 * - State-variable filter with soft saturation
 * - Dual ADSR envelopes (amp + filter)
 * - LFO with vibrato/PWM
 * - Glide/portamento, mono/poly/legato modes
 * - 64 factory presets
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

/** Parameter indices matching the C++ mdaJX10 NPARAMS=24 */
export const JX10Param = {
  OSC_MIX: 0,
  OSC_TUNE: 1,
  OSC_FINE: 2,
  GLIDE: 3,
  GLIDE_RATE: 4,
  GLIDE_BEND: 5,
  VCF_FREQ: 6,
  VCF_RESO: 7,
  VCF_ENV: 8,
  VCF_LFO: 9,
  VCF_VEL: 10,
  VCF_ATT: 11,
  VCF_DEC: 12,
  VCF_SUS: 13,
  VCF_REL: 14,
  ENV_ATT: 15,
  ENV_DEC: 16,
  ENV_SUS: 17,
  ENV_REL: 18,
  LFO_RATE: 19,
  VIBRATO: 20,
  NOISE: 21,
  OCTAVE: 22,
  TUNING: 23,
} as const;

export const JX10_PARAM_NAMES: Record<number, string> = {
  0: 'OSC Mix',
  1: 'OSC Tune',
  2: 'OSC Fine',
  3: 'Glide Mode',
  4: 'Glide Rate',
  5: 'Glide Bend',
  6: 'VCF Freq',
  7: 'VCF Reso',
  8: 'VCF Env',
  9: 'VCF LFO',
  10: 'VCF Vel',
  11: 'VCF Attack',
  12: 'VCF Decay',
  13: 'VCF Sustain',
  14: 'VCF Release',
  15: 'ENV Attack',
  16: 'ENV Decay',
  17: 'ENV Sustain',
  18: 'ENV Release',
  19: 'LFO Rate',
  20: 'Vibrato',
  21: 'Noise',
  22: 'Octave',
  23: 'Tuning',
};

/** All parameters are 0.0-1.0 normalized */
export interface MdaJX10Config {
  oscMix?: number;
  oscTune?: number;
  oscFine?: number;
  glide?: number;
  glideRate?: number;
  glideBend?: number;
  vcfFreq?: number;
  vcfReso?: number;
  vcfEnv?: number;
  vcfLfo?: number;
  vcfVel?: number;
  vcfAtt?: number;
  vcfDec?: number;
  vcfSus?: number;
  vcfRel?: number;
  envAtt?: number;
  envDec?: number;
  envSus?: number;
  envRel?: number;
  lfoRate?: number;
  vibrato?: number;
  noise?: number;
  octave?: number;
  tuning?: number;
}

export const DEFAULT_MDA_JX10: MdaJX10Config = {
  oscMix: 1.0,
  oscTune: 0.37,
  oscFine: 0.25,
  glide: 0.3,
  glideRate: 0.32,
  glideBend: 0.5,
  vcfFreq: 0.9,
  vcfReso: 0.6,
  vcfEnv: 0.12,
  vcfLfo: 0.0,
  vcfVel: 0.5,
  vcfAtt: 0.9,
  vcfDec: 0.89,
  vcfSus: 0.9,
  vcfRel: 0.73,
  envAtt: 0.0,
  envDec: 0.5,
  envSus: 1.0,
  envRel: 0.71,
  lfoRate: 0.81,
  vibrato: 0.65,
  noise: 0.0,
  octave: 0.5,
  tuning: 0.5,
};

export const JX10_PRESETS: Record<string, MdaJX10Config> = {
  // All 52 original MDA JX-10 factory programs
  '5th Sweep Pad': { oscMix: 1.0, oscTune: 0.37, oscFine: 0.25, glide: 0.3, glideRate: 0.32, glideBend: 0.5, vcfFreq: 0.9, vcfReso: 0.6, vcfEnv: 0.12, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.9, vcfDec: 0.89, vcfSus: 0.9, vcfRel: 0.73, envAtt: 0.0, envDec: 0.5, envSus: 1.0, envRel: 0.71, lfoRate: 0.81, vibrato: 0.65, noise: 0.0, octave: 0.5, tuning: 0.5 },
  'Echo Pad [SA]': { oscMix: 0.88, oscTune: 0.51, oscFine: 0.5, glide: 0.0, glideRate: 0.49, glideBend: 0.5, vcfFreq: 0.46, vcfReso: 0.76, vcfEnv: 0.69, vcfLfo: 0.1, vcfVel: 0.69, vcfAtt: 1.0, vcfDec: 0.86, vcfSus: 0.76, vcfRel: 0.57, envAtt: 0.3, envDec: 0.8, envSus: 0.68, envRel: 0.66, lfoRate: 0.79, vibrato: 0.13, noise: 0.25, octave: 0.45, tuning: 0.5 },
  'Space Chimes [SA]': { oscMix: 0.88, oscTune: 0.51, oscFine: 0.5, glide: 0.16, glideRate: 0.49, glideBend: 0.5, vcfFreq: 0.49, vcfReso: 0.82, vcfEnv: 0.66, vcfLfo: 0.08, vcfVel: 0.89, vcfAtt: 0.85, vcfDec: 0.69, vcfSus: 0.76, vcfRel: 0.47, envAtt: 0.12, envDec: 0.22, envSus: 0.55, envRel: 0.66, lfoRate: 0.89, vibrato: 0.34, noise: 0.0, octave: 1.0, tuning: 0.5 },
  'Solid Backing': { oscMix: 1.0, oscTune: 0.26, oscFine: 0.14, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.3, vcfReso: 0.25, vcfEnv: 0.7, vcfLfo: 0.0, vcfVel: 0.63, vcfAtt: 0.0, vcfDec: 0.35, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.0, envDec: 0.5, envSus: 1.0, envRel: 0.3, lfoRate: 0.81, vibrato: 0.5, noise: 0.5, octave: 0.5, tuning: 0.5 },
  'Velocity Backing [SA]': { oscMix: 0.41, oscTune: 0.5, oscFine: 0.79, glide: 0.0, glideRate: 0.08, glideBend: 0.32, vcfFreq: 0.49, vcfReso: 0.01, vcfEnv: 0.34, vcfLfo: 0.0, vcfVel: 0.93, vcfAtt: 0.61, vcfDec: 0.87, vcfSus: 1.0, vcfRel: 0.93, envAtt: 0.11, envDec: 0.48, envSus: 0.98, envRel: 0.32, lfoRate: 0.81, vibrato: 0.5, noise: 0.0, octave: 0.5, tuning: 0.5 },
  'Rubber Backing [ZF]': { oscMix: 0.29, oscTune: 0.76, oscFine: 0.26, glide: 0.0, glideRate: 0.18, glideBend: 0.76, vcfFreq: 0.35, vcfReso: 0.15, vcfEnv: 0.77, vcfLfo: 0.14, vcfVel: 0.54, vcfAtt: 0.0, vcfDec: 0.42, vcfSus: 0.13, vcfRel: 0.21, envAtt: 0.0, envDec: 0.56, envSus: 0.0, envRel: 0.32, lfoRate: 0.2, vibrato: 0.58, noise: 0.22, octave: 0.53, tuning: 0.5 },
  '808 State Lead': { oscMix: 1.0, oscTune: 0.65, oscFine: 0.24, glide: 0.4, glideRate: 0.34, glideBend: 0.85, vcfFreq: 0.65, vcfReso: 0.63, vcfEnv: 0.75, vcfLfo: 0.16, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.3, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.17, envDec: 0.5, envSus: 1.0, envRel: 0.03, lfoRate: 0.81, vibrato: 0.5, noise: 0.0, octave: 0.68, tuning: 0.5 },
  'Mono Glide': { oscMix: 0.0, oscTune: 0.25, oscFine: 0.5, glide: 1.0, glideRate: 0.46, glideBend: 0.5, vcfFreq: 0.51, vcfReso: 0.0, vcfEnv: 0.5, vcfLfo: 0.0, vcfVel: 0.0, vcfAtt: 0.0, vcfDec: 0.3, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.37, envDec: 0.5, envSus: 1.0, envRel: 0.38, lfoRate: 0.81, vibrato: 0.62, noise: 0.0, octave: 0.5, tuning: 0.5 },
  'Detuned Techno Lead': { oscMix: 0.84, oscTune: 0.51, oscFine: 0.15, glide: 0.45, glideRate: 0.41, glideBend: 0.42, vcfFreq: 0.54, vcfReso: 0.01, vcfEnv: 0.58, vcfLfo: 0.21, vcfVel: 0.67, vcfAtt: 0.0, vcfDec: 0.09, vcfSus: 1.0, vcfRel: 0.25, envAtt: 0.2, envDec: 0.85, envSus: 1.0, envRel: 0.3, lfoRate: 0.83, vibrato: 0.09, noise: 0.4, octave: 0.49, tuning: 0.5 },
  'Hard Lead [SA]': { oscMix: 0.71, oscTune: 0.75, oscFine: 0.53, glide: 0.18, glideRate: 0.24, glideBend: 1.0, vcfFreq: 0.56, vcfReso: 0.52, vcfEnv: 0.69, vcfLfo: 0.19, vcfVel: 0.7, vcfAtt: 1.0, vcfDec: 0.14, vcfSus: 0.65, vcfRel: 0.95, envAtt: 0.07, envDec: 0.91, envSus: 1.0, envRel: 0.15, lfoRate: 0.84, vibrato: 0.33, noise: 0.0, octave: 0.49, tuning: 0.5 },
  'Bubble': { oscMix: 0.0, oscTune: 0.25, oscFine: 0.43, glide: 0.0, glideRate: 0.71, glideBend: 0.48, vcfFreq: 0.23, vcfReso: 0.77, vcfEnv: 0.8, vcfLfo: 0.32, vcfVel: 0.63, vcfAtt: 0.4, vcfDec: 0.18, vcfSus: 0.66, vcfRel: 0.14, envAtt: 0.0, envDec: 0.38, envSus: 0.65, envRel: 0.16, lfoRate: 0.48, vibrato: 0.5, noise: 0.0, octave: 0.67, tuning: 0.5 },
  'Monosynth': { oscMix: 0.62, oscTune: 0.26, oscFine: 0.51, glide: 0.79, glideRate: 0.35, glideBend: 0.54, vcfFreq: 0.64, vcfReso: 0.39, vcfEnv: 0.51, vcfLfo: 0.65, vcfVel: 0.0, vcfAtt: 0.07, vcfDec: 0.52, vcfSus: 0.24, vcfRel: 0.84, envAtt: 0.13, envDec: 0.3, envSus: 0.76, envRel: 0.21, lfoRate: 0.58, vibrato: 0.3, noise: 0.0, octave: 0.36, tuning: 0.5 },
  'Moogcury Lite': { oscMix: 0.81, oscTune: 1.0, oscFine: 0.21, glide: 0.78, glideRate: 0.15, glideBend: 0.35, vcfFreq: 0.39, vcfReso: 0.17, vcfEnv: 0.69, vcfLfo: 0.4, vcfVel: 0.62, vcfAtt: 0.0, vcfDec: 0.47, vcfSus: 0.19, vcfRel: 0.37, envAtt: 0.0, envDec: 0.5, envSus: 0.2, envRel: 0.33, lfoRate: 0.38, vibrato: 0.53, noise: 0.0, octave: 0.12, tuning: 0.5 },
  'Gangsta Whine': { oscMix: 0.0, oscTune: 0.51, oscFine: 0.52, glide: 0.96, glideRate: 0.44, glideBend: 0.5, vcfFreq: 0.41, vcfReso: 0.46, vcfEnv: 0.5, vcfLfo: 0.0, vcfVel: 0.0, vcfAtt: 0.0, vcfDec: 0.0, vcfSus: 1.0, vcfRel: 0.25, envAtt: 0.15, envDec: 0.5, envSus: 1.0, envRel: 0.32, lfoRate: 0.81, vibrato: 0.49, noise: 0.0, octave: 0.83, tuning: 0.5 },
  'Higher Synth [ZF]': { oscMix: 0.48, oscTune: 0.51, oscFine: 0.22, glide: 0.0, glideRate: 0.0, glideBend: 0.5, vcfFreq: 0.5, vcfReso: 0.47, vcfEnv: 0.73, vcfLfo: 0.3, vcfVel: 0.8, vcfAtt: 0.0, vcfDec: 0.1, vcfSus: 0.0, vcfRel: 0.07, envAtt: 0.0, envDec: 0.42, envSus: 0.0, envRel: 0.22, lfoRate: 0.21, vibrato: 0.59, noise: 0.16, octave: 0.98, tuning: 0.5 },
  '303 Saw Bass': { oscMix: 0.0, oscTune: 0.51, oscFine: 0.5, glide: 0.83, glideRate: 0.49, glideBend: 0.5, vcfFreq: 0.55, vcfReso: 0.75, vcfEnv: 0.69, vcfLfo: 0.35, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.56, vcfSus: 0.0, vcfRel: 0.56, envAtt: 0.0, envDec: 0.8, envSus: 1.0, envRel: 0.24, lfoRate: 0.26, vibrato: 0.49, noise: 0.0, octave: 0.07, tuning: 0.5 },
  '303 Square Bass': { oscMix: 0.75, oscTune: 0.51, oscFine: 0.5, glide: 0.83, glideRate: 0.49, glideBend: 0.5, vcfFreq: 0.55, vcfReso: 0.75, vcfEnv: 0.69, vcfLfo: 0.35, vcfVel: 0.5, vcfAtt: 0.14, vcfDec: 0.49, vcfSus: 0.0, vcfRel: 0.39, envAtt: 0.0, envDec: 0.8, envSus: 1.0, envRel: 0.24, lfoRate: 0.26, vibrato: 0.49, noise: 0.0, octave: 0.07, tuning: 0.5 },
  'Analog Bass': { oscMix: 1.0, oscTune: 0.25, oscFine: 0.2, glide: 0.81, glideRate: 0.19, glideBend: 0.5, vcfFreq: 0.3, vcfReso: 0.51, vcfEnv: 0.85, vcfLfo: 0.09, vcfVel: 0.0, vcfAtt: 0.0, vcfDec: 0.88, vcfSus: 0.0, vcfRel: 0.21, envAtt: 0.0, envDec: 0.5, envSus: 1.0, envRel: 0.46, lfoRate: 0.81, vibrato: 0.5, noise: 0.0, octave: 0.27, tuning: 0.5 },
  'Analog Bass 2': { oscMix: 1.0, oscTune: 0.25, oscFine: 0.2, glide: 0.72, glideRate: 0.19, glideBend: 0.86, vcfFreq: 0.48, vcfReso: 0.43, vcfEnv: 0.94, vcfLfo: 0.0, vcfVel: 0.8, vcfAtt: 0.0, vcfDec: 0.0, vcfSus: 0.0, vcfRel: 0.0, envAtt: 0.0, envDec: 0.61, envSus: 1.0, envRel: 0.32, lfoRate: 0.81, vibrato: 0.5, noise: 0.0, octave: 0.27, tuning: 0.5 },
  'Low Pulses': { oscMix: 0.97, oscTune: 0.26, oscFine: 0.3, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.8, vcfReso: 0.4, vcfEnv: 0.52, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.77, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.0, envDec: 0.5, envSus: 1.0, envRel: 0.3, lfoRate: 0.81, vibrato: 0.16, noise: 0.0, octave: 0.0, tuning: 0.5 },
  'Sine Infra-Bass': { oscMix: 0.0, oscTune: 0.25, oscFine: 0.5, glide: 0.65, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.33, vcfReso: 0.76, vcfEnv: 0.53, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.3, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.0, envDec: 0.55, envSus: 0.25, envRel: 0.3, lfoRate: 0.81, vibrato: 0.52, noise: 0.0, octave: 0.14, tuning: 0.5 },
  'Wobble Bass [SA]': { oscMix: 1.0, oscTune: 0.26, oscFine: 0.22, glide: 0.64, glideRate: 0.82, glideBend: 0.59, vcfFreq: 0.72, vcfReso: 0.47, vcfEnv: 0.34, vcfLfo: 0.34, vcfVel: 0.82, vcfAtt: 0.2, vcfDec: 0.69, vcfSus: 1.0, vcfRel: 0.15, envAtt: 0.09, envDec: 0.5, envSus: 1.0, envRel: 0.07, lfoRate: 0.81, vibrato: 0.46, noise: 0.0, octave: 0.24, tuning: 0.5 },
  'Squelch Bass': { oscMix: 1.0, oscTune: 0.26, oscFine: 0.22, glide: 0.71, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.67, vcfReso: 0.7, vcfEnv: 0.26, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.48, vcfDec: 0.69, vcfSus: 1.0, vcfRel: 0.15, envAtt: 0.0, envDec: 0.5, envSus: 1.0, envRel: 0.07, lfoRate: 0.81, vibrato: 0.46, noise: 0.0, octave: 0.24, tuning: 0.5 },
  'Rubber Bass [ZF]': { oscMix: 0.49, oscTune: 0.25, oscFine: 0.66, glide: 0.81, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.36, vcfReso: 0.15, vcfEnv: 0.75, vcfLfo: 0.2, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.38, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.0, envDec: 0.6, envSus: 1.0, envRel: 0.22, lfoRate: 0.19, vibrato: 0.5, noise: 0.0, octave: 0.17, tuning: 0.5 },
  'Soft Pick Bass': { oscMix: 0.37, oscTune: 0.51, oscFine: 0.77, glide: 0.71, glideRate: 0.22, glideBend: 0.5, vcfFreq: 0.33, vcfReso: 0.47, vcfEnv: 0.71, vcfLfo: 0.16, vcfVel: 0.59, vcfAtt: 0.0, vcfDec: 0.0, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.04, envDec: 0.58, envSus: 0.0, envRel: 0.22, lfoRate: 0.15, vibrato: 0.44, noise: 0.33, octave: 0.15, tuning: 0.5 },
  'Fretless Bass': { oscMix: 0.5, oscTune: 0.51, oscFine: 0.17, glide: 0.8, glideRate: 0.34, glideBend: 0.5, vcfFreq: 0.51, vcfReso: 0.0, vcfEnv: 0.58, vcfLfo: 0.0, vcfVel: 0.67, vcfAtt: 0.0, vcfDec: 0.09, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.2, envDec: 0.85, envSus: 0.0, envRel: 0.3, lfoRate: 0.81, vibrato: 0.7, noise: 0.0, octave: 0.0, tuning: 0.5 },
  'Whistler': { oscMix: 0.23, oscTune: 0.51, oscFine: 0.38, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.33, vcfReso: 1.0, vcfEnv: 0.5, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.29, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.68, envDec: 0.39, envSus: 0.58, envRel: 0.36, lfoRate: 0.81, vibrato: 0.64, noise: 0.38, octave: 0.92, tuning: 0.5 },
  'Very Soft Pad': { oscMix: 0.39, oscTune: 0.51, oscFine: 0.27, glide: 0.38, glideRate: 0.12, glideBend: 0.5, vcfFreq: 0.35, vcfReso: 0.78, vcfEnv: 0.5, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.3, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.35, envDec: 0.5, envSus: 0.8, envRel: 0.7, lfoRate: 0.81, vibrato: 0.5, noise: 0.0, octave: 0.5, tuning: 0.5 },
  'Pizzicato': { oscMix: 0.0, oscTune: 0.25, oscFine: 0.5, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.23, vcfReso: 0.2, vcfEnv: 0.75, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.22, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.0, envDec: 0.47, envSus: 0.0, envRel: 0.3, lfoRate: 0.81, vibrato: 0.5, noise: 0.8, octave: 0.5, tuning: 0.5 },
  'Synth Strings': { oscMix: 1.0, oscTune: 0.51, oscFine: 0.24, glide: 0.0, glideRate: 0.0, glideBend: 0.35, vcfFreq: 0.42, vcfReso: 0.26, vcfEnv: 0.75, vcfLfo: 0.14, vcfVel: 0.69, vcfAtt: 0.0, vcfDec: 0.67, vcfSus: 0.55, vcfRel: 0.97, envAtt: 0.82, envDec: 0.7, envSus: 1.0, envRel: 0.42, lfoRate: 0.84, vibrato: 0.67, noise: 0.3, octave: 0.47, tuning: 0.5 },
  'Synth Strings 2': { oscMix: 0.75, oscTune: 0.51, oscFine: 0.29, glide: 0.0, glideRate: 0.49, glideBend: 0.5, vcfFreq: 0.55, vcfReso: 0.16, vcfEnv: 0.69, vcfLfo: 0.08, vcfVel: 0.2, vcfAtt: 0.76, vcfDec: 0.29, vcfSus: 0.76, vcfRel: 1.0, envAtt: 0.46, envDec: 0.8, envSus: 1.0, envRel: 0.39, lfoRate: 0.79, vibrato: 0.27, noise: 0.0, octave: 0.68, tuning: 0.5 },
  'Leslie Organ': { oscMix: 0.0, oscTune: 0.5, oscFine: 0.53, glide: 0.0, glideRate: 0.13, glideBend: 0.39, vcfFreq: 0.38, vcfReso: 0.74, vcfEnv: 0.54, vcfLfo: 0.2, vcfVel: 0.0, vcfAtt: 0.0, vcfDec: 0.55, vcfSus: 0.52, vcfRel: 0.31, envAtt: 0.0, envDec: 0.17, envSus: 0.73, envRel: 0.28, lfoRate: 0.87, vibrato: 0.24, noise: 0.0, octave: 0.29, tuning: 0.5 },
  'Click Organ': { oscMix: 0.5, oscTune: 0.77, oscFine: 0.52, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.44, vcfReso: 0.5, vcfEnv: 0.65, vcfLfo: 0.16, vcfVel: 0.0, vcfAtt: 0.0, vcfDec: 0.0, vcfSus: 0.18, vcfRel: 0.0, envAtt: 0.0, envDec: 0.75, envSus: 0.8, envRel: 0.0, lfoRate: 0.81, vibrato: 0.49, noise: 0.0, octave: 0.44, tuning: 0.5 },
  'Hard Organ': { oscMix: 0.89, oscTune: 0.91, oscFine: 0.37, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.51, vcfReso: 0.62, vcfEnv: 0.54, vcfLfo: 0.0, vcfVel: 0.0, vcfAtt: 0.0, vcfDec: 0.37, vcfSus: 0.0, vcfRel: 1.0, envAtt: 0.04, envDec: 0.08, envSus: 0.72, envRel: 0.04, lfoRate: 0.77, vibrato: 0.49, noise: 0.0, octave: 0.58, tuning: 0.5 },
  'Bass Clarinet': { oscMix: 1.0, oscTune: 0.51, oscFine: 0.51, glide: 0.37, glideRate: 0.0, glideBend: 0.5, vcfFreq: 0.51, vcfReso: 0.1, vcfEnv: 0.5, vcfLfo: 0.11, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.0, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.35, envDec: 0.65, envSus: 0.65, envRel: 0.32, lfoRate: 0.79, vibrato: 0.49, noise: 0.2, octave: 0.35, tuning: 0.5 },
  'Trumpet': { oscMix: 0.0, oscTune: 0.51, oscFine: 0.51, glide: 0.82, glideRate: 0.06, glideBend: 0.5, vcfFreq: 0.57, vcfReso: 0.0, vcfEnv: 0.32, vcfLfo: 0.15, vcfVel: 0.5, vcfAtt: 0.21, vcfDec: 0.15, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.24, envDec: 0.6, envSus: 0.8, envRel: 0.1, lfoRate: 0.75, vibrato: 0.55, noise: 0.25, octave: 0.69, tuning: 0.5 },
  'Soft Horn': { oscMix: 0.12, oscTune: 0.9, oscFine: 0.67, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.5, vcfReso: 0.21, vcfEnv: 0.29, vcfLfo: 0.12, vcfVel: 0.6, vcfAtt: 0.0, vcfDec: 0.35, vcfSus: 0.36, vcfRel: 0.25, envAtt: 0.08, envDec: 0.5, envSus: 1.0, envRel: 0.27, lfoRate: 0.83, vibrato: 0.51, noise: 0.1, octave: 0.25, tuning: 0.5 },
  'Brass Section': { oscMix: 0.43, oscTune: 0.76, oscFine: 0.23, glide: 0.0, glideRate: 0.28, glideBend: 0.36, vcfFreq: 0.5, vcfReso: 0.0, vcfEnv: 0.59, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.24, vcfDec: 0.16, vcfSus: 0.91, vcfRel: 0.08, envAtt: 0.17, envDec: 0.5, envSus: 0.8, envRel: 0.45, lfoRate: 0.81, vibrato: 0.5, noise: 0.0, octave: 0.58, tuning: 0.5 },
  'Synth Brass': { oscMix: 0.4, oscTune: 0.51, oscFine: 0.25, glide: 0.0, glideRate: 0.3, glideBend: 0.28, vcfFreq: 0.39, vcfReso: 0.15, vcfEnv: 0.75, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.39, vcfDec: 0.3, vcfSus: 0.82, vcfRel: 0.25, envAtt: 0.33, envDec: 0.74, envSus: 0.76, envRel: 0.41, lfoRate: 0.81, vibrato: 0.47, noise: 0.23, octave: 0.5, tuning: 0.5 },
  'Detuned Syn Brass [ZF]': { oscMix: 0.68, oscTune: 0.5, oscFine: 0.93, glide: 0.0, glideRate: 0.31, glideBend: 0.62, vcfFreq: 0.26, vcfReso: 0.07, vcfEnv: 0.85, vcfLfo: 0.0, vcfVel: 0.66, vcfAtt: 0.0, vcfDec: 0.83, vcfSus: 0.0, vcfRel: 0.05, envAtt: 0.0, envDec: 0.75, envSus: 0.54, envRel: 0.32, lfoRate: 0.76, vibrato: 0.37, noise: 0.29, octave: 0.56, tuning: 0.5 },
  'Power PWM': { oscMix: 1.0, oscTune: 0.27, oscFine: 0.22, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.82, vcfReso: 0.13, vcfEnv: 0.75, vcfLfo: 0.0, vcfVel: 0.0, vcfAtt: 0.24, vcfDec: 0.3, vcfSus: 0.88, vcfRel: 0.34, envAtt: 0.0, envDec: 0.5, envSus: 1.0, envRel: 0.48, lfoRate: 0.71, vibrato: 0.37, noise: 0.0, octave: 0.35, tuning: 0.5 },
  'Water Velocity [SA]': { oscMix: 0.76, oscTune: 0.51, oscFine: 0.35, glide: 0.0, glideRate: 0.49, glideBend: 0.5, vcfFreq: 0.87, vcfReso: 0.67, vcfEnv: 1.0, vcfLfo: 0.32, vcfVel: 0.09, vcfAtt: 0.95, vcfDec: 0.56, vcfSus: 0.72, vcfRel: 1.0, envAtt: 0.04, envDec: 0.76, envSus: 0.11, envRel: 0.46, lfoRate: 0.88, vibrato: 0.72, noise: 0.0, octave: 0.38, tuning: 0.5 },
  'Ghost [SA]': { oscMix: 0.75, oscTune: 0.51, oscFine: 0.24, glide: 0.45, glideRate: 0.16, glideBend: 0.48, vcfFreq: 0.38, vcfReso: 0.58, vcfEnv: 0.75, vcfLfo: 0.16, vcfVel: 0.81, vcfAtt: 0.0, vcfDec: 0.3, vcfSus: 0.4, vcfRel: 0.31, envAtt: 0.37, envDec: 0.5, envSus: 1.0, envRel: 0.54, lfoRate: 0.85, vibrato: 0.83, noise: 0.43, octave: 0.46, tuning: 0.5 },
  'Soft E.Piano': { oscMix: 0.31, oscTune: 0.51, oscFine: 0.43, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.34, vcfReso: 0.26, vcfEnv: 0.53, vcfLfo: 0.0, vcfVel: 0.63, vcfAtt: 0.0, vcfDec: 0.22, vcfSus: 0.0, vcfRel: 0.39, envAtt: 0.0, envDec: 0.8, envSus: 0.0, envRel: 0.44, lfoRate: 0.81, vibrato: 0.51, noise: 0.0, octave: 0.5, tuning: 0.5 },
  'Thumb Piano': { oscMix: 0.72, oscTune: 0.82, oscFine: 1.0, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.37, vcfReso: 0.47, vcfEnv: 0.54, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.0, vcfDec: 0.45, vcfSus: 0.0, vcfRel: 0.39, envAtt: 0.0, envDec: 0.39, envSus: 0.0, envRel: 0.48, lfoRate: 0.81, vibrato: 0.6, noise: 0.0, octave: 0.71, tuning: 0.5 },
  'Steel Drums [ZF]': { oscMix: 0.81, oscTune: 0.76, oscFine: 0.19, glide: 0.0, glideRate: 0.18, glideBend: 0.7, vcfFreq: 0.4, vcfReso: 0.3, vcfEnv: 0.54, vcfLfo: 0.17, vcfVel: 0.4, vcfAtt: 0.0, vcfDec: 0.42, vcfSus: 0.23, vcfRel: 0.47, envAtt: 0.12, envDec: 0.48, envSus: 0.0, envRel: 0.49, lfoRate: 0.53, vibrato: 0.36, noise: 0.34, octave: 0.56, tuning: 0.5 },
  'Car Horn': { oscMix: 0.57, oscTune: 0.49, oscFine: 0.31, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.46, vcfReso: 0.0, vcfEnv: 0.68, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.46, vcfDec: 0.3, vcfSus: 1.0, vcfRel: 0.23, envAtt: 0.3, envDec: 0.5, envSus: 1.0, envRel: 0.31, lfoRate: 1.0, vibrato: 0.38, noise: 0.0, octave: 0.5, tuning: 0.5 },
  'Helicopter': { oscMix: 0.0, oscTune: 0.25, oscFine: 0.5, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.08, vcfReso: 0.36, vcfEnv: 0.69, vcfLfo: 1.0, vcfVel: 0.5, vcfAtt: 1.0, vcfDec: 1.0, vcfSus: 0.0, vcfRel: 1.0, envAtt: 0.96, envDec: 0.5, envSus: 1.0, envRel: 0.92, lfoRate: 0.97, vibrato: 0.5, noise: 1.0, octave: 0.0, tuning: 0.5 },
  'Arctic Wind': { oscMix: 0.0, oscTune: 0.25, oscFine: 0.5, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.16, vcfReso: 0.85, vcfEnv: 0.5, vcfLfo: 0.28, vcfVel: 0.5, vcfAtt: 0.37, vcfDec: 0.3, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.89, envDec: 0.5, envSus: 1.0, envRel: 0.89, lfoRate: 0.24, vibrato: 0.5, noise: 1.0, octave: 1.0, tuning: 0.5 },
  'Thip': { oscMix: 1.0, oscTune: 0.37, oscFine: 0.51, glide: 0.0, glideRate: 0.35, glideBend: 0.5, vcfFreq: 0.0, vcfReso: 1.0, vcfEnv: 0.97, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.02, vcfDec: 0.2, vcfSus: 0.0, vcfRel: 0.2, envAtt: 0.0, envDec: 0.46, envSus: 0.0, envRel: 0.3, lfoRate: 0.81, vibrato: 0.5, noise: 0.78, octave: 0.48, tuning: 0.5 },
  'Synth Tom': { oscMix: 0.0, oscTune: 0.25, oscFine: 0.5, glide: 0.0, glideRate: 0.76, glideBend: 0.94, vcfFreq: 0.3, vcfReso: 0.33, vcfEnv: 0.76, vcfLfo: 0.0, vcfVel: 0.68, vcfAtt: 0.0, vcfDec: 0.59, vcfSus: 0.0, vcfRel: 0.59, envAtt: 0.1, envDec: 0.5, envSus: 0.0, envRel: 0.5, lfoRate: 0.81, vibrato: 0.5, noise: 0.7, octave: 0.0, tuning: 0.5 },
  'Squelchy Frog': { oscMix: 0.5, oscTune: 0.41, oscFine: 0.23, glide: 0.45, glideRate: 0.77, glideBend: 0.0, vcfFreq: 0.4, vcfReso: 0.65, vcfEnv: 0.95, vcfLfo: 0.0, vcfVel: 0.5, vcfAtt: 0.33, vcfDec: 0.5, vcfSus: 0.0, vcfRel: 0.25, envAtt: 0.0, envDec: 0.7, envSus: 0.65, envRel: 0.18, lfoRate: 0.32, vibrato: 1.0, noise: 0.0, octave: 0.06, tuning: 0.5 },
};

const CONFIG_KEYS: (keyof MdaJX10Config)[] = [
  'oscMix', 'oscTune', 'oscFine', 'glide', 'glideRate', 'glideBend',
  'vcfFreq', 'vcfReso', 'vcfEnv', 'vcfLfo', 'vcfVel',
  'vcfAtt', 'vcfDec', 'vcfSus', 'vcfRel',
  'envAtt', 'envDec', 'envSus', 'envRel',
  'lfoRate', 'vibrato', 'noise', 'octave', 'tuning',
];

export class MdaJX10Synth implements DevilboxSynth {
  readonly name = 'MdaJX10Synth';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: MdaJX10Config;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;

  private _initPromise: Promise<void>;

  constructor(config: Partial<MdaJX10Config> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_MDA_JX10, ...config };
    this._initPromise = this.initialize();
  }

  public async ensureInitialized(): Promise<void> {
    return this._initPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!MdaJX10Synth.isWorkletLoaded) {
        if (!MdaJX10Synth.workletLoadPromise) {
          MdaJX10Synth.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}mda-jx10/MdaJX10.worklet.js`
          );
        }
        await MdaJX10Synth.workletLoadPromise;
        MdaJX10Synth.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}mda-jx10/MdaJX10.wasm`),
        fetch(`${baseUrl}mda-jx10/MdaJX10.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load MdaJX10.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load MdaJX10.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}mda-jx10/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory\s*=\s*wasmExports\[['"][\w]+['"]\])/, '$1;Module["wasmMemory"]=wasmMemory')
        .replace(/new\s+URL\(([^,]+),\s*([^)]+)\)\.href/g, '($2 + $1)');

      this._worklet = new AudioWorkletNode(rawContext, 'mda-jx10-processor', {
        outputChannelCount: [2],
        numberOfOutputs: 1,
      });

      this._worklet.port.onmessage = (event) => {
        if (event.data.type === 'ready') {
          this.isInitialized = true;
          this.applyConfig(this.config);
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet!.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
        } else if (event.data.type === 'error') {
          console.error('MdaJX10 error:', event.data.error);
        }
      };

      this._worklet.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode,
        sampleRate: rawContext.sampleRate,
      });

      this._worklet.connect(this.output);

      try {
        const keepalive = rawContext.createGain();
        keepalive.gain.value = 0;
        this._worklet.connect(keepalive);
        keepalive.connect(rawContext.destination);
      } catch { /* keepalive failed */ }

    } catch (error) {
      console.error('Failed to initialize MdaJX10Synth:', error);
      throw error;
    }
  }

  private applyConfig(config: MdaJX10Config): void {
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
    const index = CONFIG_KEYS.indexOf(param as keyof MdaJX10Config);
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
    const preset = JX10_PRESETS[name];
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
