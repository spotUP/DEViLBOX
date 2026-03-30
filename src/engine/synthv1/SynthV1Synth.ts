/**
 * SynthV1Synth.ts — SynthV1 4-oscillator polyphonic subtractive synth engine
 *
 * Two identical synth "pages" (DCO+DCF+DCA+LFO each) plus effects.
 * ~100 parameters total: page1 (0-39), page2 (40-79), effects (80-99).
 * All values normalized 0-1 unless noted (some are bipolar -1..1 or discrete).
 */

import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';

// Parameter index map — per-page offsets (add page*40 for page 2)
export const SV1 = {
  // DCO (page-relative +0..+9)
  DCO_SHAPE1: 0, DCO_WIDTH1: 1, DCO_SHAPE2: 2, DCO_WIDTH2: 3,
  DCO_OCTAVE: 4, DCO_TUNING: 5, DCO_GLIDE: 6, DCO_SYNC: 7,
  DCO_BALANCE: 8, DCO_RINGMOD: 9,
  // DCF (+10..+19)
  DCF_CUTOFF: 10, DCF_RESO: 11, DCF_TYPE: 12, DCF_SLOPE: 13,
  DCF_ENVELOPE: 14, DCF_ATTACK: 15, DCF_DECAY: 16, DCF_SUSTAIN: 17,
  DCF_RELEASE: 18, DCF_KEYFOLLOW: 19,
  // DCA (+20..+24)
  DCA_VOLUME: 20, DCA_ATTACK: 21, DCA_DECAY: 22, DCA_SUSTAIN: 23, DCA_RELEASE: 24,
  // LFO (+25..+33)
  LFO_BPM: 25, LFO_SHAPE: 26, LFO_WIDTH: 27, LFO_PITCH: 28,
  LFO_CUTOFF: 29, LFO_RESO: 30, LFO_PANNING: 31, LFO_VOLUME: 32, LFO_SYNC: 33,
  // Misc per-page (+34..+39)
  DCO_DETUNE: 34, DCO_PHASE: 35, DCO_PANNING: 36,
  DCO_VELOCITY: 37, DCF_VELOCITY: 38, DCA_VELOCITY: 39,
  // Effects (absolute 80-99)
  CHORUS_WET: 80, CHORUS_DELAY: 81, CHORUS_FEEDBACK: 82, CHORUS_RATE: 83, CHORUS_MOD: 84,
  FLANGER_WET: 85, FLANGER_DELAY: 86, FLANGER_FEEDBACK: 87, FLANGER_DAFT: 88,
  PHASER_WET: 89, PHASER_RATE: 90, PHASER_FEEDBACK: 91, PHASER_DEPTH: 92, PHASER_DAFT: 93,
  DELAY_WET: 94, DELAY_DELAY: 95, DELAY_FEEDBACK: 96, DELAY_BPM: 97,
  REVERB_WET: 98, REVERB_ROOM: 99,
} as const;

/** Flat config — keys map 1:1 to WASM param indices via CONFIG_KEYS array */
export interface SynthV1Config {
  // Page 1 DCO (0-9)
  dco1Shape1: number; dco1Width1: number; dco1Shape2: number; dco1Width2: number;
  dco1Octave: number; dco1Tuning: number; dco1Glide: number; dco1Sync: number;
  dco1Balance: number; dco1RingMod: number;
  // Page 1 DCF (10-19)
  dcf1Cutoff: number; dcf1Reso: number; dcf1Type: number; dcf1Slope: number;
  dcf1Envelope: number; dcf1Attack: number; dcf1Decay: number; dcf1Sustain: number;
  dcf1Release: number; dcf1KeyFollow: number;
  // Page 1 DCA (20-24)
  dca1Volume: number; dca1Attack: number; dca1Decay: number; dca1Sustain: number; dca1Release: number;
  // Page 1 LFO (25-33)
  lfo1Bpm: number; lfo1Shape: number; lfo1Width: number; lfo1Pitch: number;
  lfo1Cutoff: number; lfo1Reso: number; lfo1Panning: number; lfo1Volume: number; lfo1Sync: number;
  // Page 1 Misc (34-39)
  dco1Detune: number; dco1Phase: number; dco1Panning: number;
  dco1Velocity: number; dcf1Velocity: number; dca1Velocity: number;

  // Page 2 DCO (40-49)
  dco2Shape1: number; dco2Width1: number; dco2Shape2: number; dco2Width2: number;
  dco2Octave: number; dco2Tuning: number; dco2Glide: number; dco2Sync: number;
  dco2Balance: number; dco2RingMod: number;
  // Page 2 DCF (50-59)
  dcf2Cutoff: number; dcf2Reso: number; dcf2Type: number; dcf2Slope: number;
  dcf2Envelope: number; dcf2Attack: number; dcf2Decay: number; dcf2Sustain: number;
  dcf2Release: number; dcf2KeyFollow: number;
  // Page 2 DCA (60-64)
  dca2Volume: number; dca2Attack: number; dca2Decay: number; dca2Sustain: number; dca2Release: number;
  // Page 2 LFO (65-73)
  lfo2Bpm: number; lfo2Shape: number; lfo2Width: number; lfo2Pitch: number;
  lfo2Cutoff: number; lfo2Reso: number; lfo2Panning: number; lfo2Volume: number; lfo2Sync: number;
  // Page 2 Misc (74-79)
  dco2Detune: number; dco2Phase: number; dco2Panning: number;
  dco2Velocity: number; dcf2Velocity: number; dca2Velocity: number;

  // Effects (80-99)
  chorusWet: number; chorusDelay: number; chorusFeedback: number; chorusRate: number; chorusMod: number;
  flangerWet: number; flangerDelay: number; flangerFeedback: number; flangerDaft: number;
  phaserWet: number; phaserRate: number; phaserFeedback: number; phaserDepth: number; phaserDaft: number;
  delayWet: number; delayDelay: number; delayFeedback: number; delayBpm: number;
  reverbWet: number; reverbRoom: number;
}

/** Ordered list of config keys — index matches WASM param index */
export const CONFIG_KEYS: (keyof SynthV1Config)[] = [
  // Page 1 (0-39)
  'dco1Shape1', 'dco1Width1', 'dco1Shape2', 'dco1Width2',
  'dco1Octave', 'dco1Tuning', 'dco1Glide', 'dco1Sync',
  'dco1Balance', 'dco1RingMod',
  'dcf1Cutoff', 'dcf1Reso', 'dcf1Type', 'dcf1Slope',
  'dcf1Envelope', 'dcf1Attack', 'dcf1Decay', 'dcf1Sustain',
  'dcf1Release', 'dcf1KeyFollow',
  'dca1Volume', 'dca1Attack', 'dca1Decay', 'dca1Sustain', 'dca1Release',
  'lfo1Bpm', 'lfo1Shape', 'lfo1Width', 'lfo1Pitch',
  'lfo1Cutoff', 'lfo1Reso', 'lfo1Panning', 'lfo1Volume', 'lfo1Sync',
  'dco1Detune', 'dco1Phase', 'dco1Panning',
  'dco1Velocity', 'dcf1Velocity', 'dca1Velocity',
  // Page 2 (40-79)
  'dco2Shape1', 'dco2Width1', 'dco2Shape2', 'dco2Width2',
  'dco2Octave', 'dco2Tuning', 'dco2Glide', 'dco2Sync',
  'dco2Balance', 'dco2RingMod',
  'dcf2Cutoff', 'dcf2Reso', 'dcf2Type', 'dcf2Slope',
  'dcf2Envelope', 'dcf2Attack', 'dcf2Decay', 'dcf2Sustain',
  'dcf2Release', 'dcf2KeyFollow',
  'dca2Volume', 'dca2Attack', 'dca2Decay', 'dca2Sustain', 'dca2Release',
  'lfo2Bpm', 'lfo2Shape', 'lfo2Width', 'lfo2Pitch',
  'lfo2Cutoff', 'lfo2Reso', 'lfo2Panning', 'lfo2Volume', 'lfo2Sync',
  'dco2Detune', 'dco2Phase', 'dco2Panning',
  'dco2Velocity', 'dcf2Velocity', 'dca2Velocity',
  // Effects (80-99)
  'chorusWet', 'chorusDelay', 'chorusFeedback', 'chorusRate', 'chorusMod',
  'flangerWet', 'flangerDelay', 'flangerFeedback', 'flangerDaft',
  'phaserWet', 'phaserRate', 'phaserFeedback', 'phaserDepth', 'phaserDaft',
  'delayWet', 'delayDelay', 'delayFeedback', 'delayBpm',
  'reverbWet', 'reverbRoom',
];

export const SYNTHV1_PARAM_NAMES: Record<number, string> = {};
CONFIG_KEYS.forEach((k, i) => {
  // Convert camelCase to spaced: dco1Shape1 → "DCO1 Shape1"
  const name = k.replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
  SYNTHV1_PARAM_NAMES[i] = name;
});

const PAGE1_DEFAULTS = {
  dcoShape1: 1, dcoWidth1: 0.5, dcoShape2: 0, dcoWidth2: 0.5,
  dcoOctave: 0, dcoTuning: 0, dcoGlide: 0, dcoSync: 0,
  dcoBalance: 0, dcoRingMod: 0,
  dcfCutoff: 0.75, dcfReso: 0.2, dcfType: 0, dcfSlope: 0,
  dcfEnvelope: 0.5, dcfAttack: 0, dcfDecay: 0.3, dcfSustain: 0.6,
  dcfRelease: 0.3, dcfKeyFollow: 0.5,
  dcaVolume: 0.8, dcaAttack: 0, dcaDecay: 0.3, dcaSustain: 0.8, dcaRelease: 0.3,
  lfoBpm: 0.3, lfoShape: 0, lfoWidth: 0.5, lfoPitch: 0,
  lfoCutoff: 0, lfoReso: 0, lfoPanning: 0, lfoVolume: 0, lfoSync: 0,
  dcoDetune: 0.1, dcoPhase: 0, dcoPanning: 0,
  dcoVelocity: 0.5, dcfVelocity: 0.5, dcaVelocity: 0.5,
};

function pageDefaults(page: 1 | 2): Record<string, number> {
  const prefix = page === 1 ? '1' : '2';
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(PAGE1_DEFAULTS)) {
    const key = k.replace(/^(dco|dcf|dca|lfo)/, `$1${prefix}`);
    out[key] = v;
  }
  return out;
}

export const DEFAULT_SYNTHV1: SynthV1Config = {
  ...pageDefaults(1),
  ...pageDefaults(2),
  // Page 2 quieter by default
  dca2Volume: 0,
  // Effects off
  chorusWet: 0, chorusDelay: 0.3, chorusFeedback: 0, chorusRate: 0.3, chorusMod: 0.5,
  flangerWet: 0, flangerDelay: 0.3, flangerFeedback: 0, flangerDaft: 0,
  phaserWet: 0, phaserRate: 0.3, phaserFeedback: 0, phaserDepth: 0.5, phaserDaft: 0,
  delayWet: 0, delayDelay: 0.4, delayFeedback: 0.3, delayBpm: 0.5,
  reverbWet: 0, reverbRoom: 0.5,
} as SynthV1Config;

export const SYNTHV1_PRESETS: Record<string, Partial<SynthV1Config>> = {
  'Poly Pad': {
    ...DEFAULT_SYNTHV1,
    dco1Shape1: 1, dco1Width1: 0.5, dco1Shape2: 1, dco1Width2: 0.5,
    dco1Detune: 0.25, dco1Balance: 0,
    dcf1Cutoff: 0.6, dcf1Reso: 0.15, dcf1Envelope: 0.3,
    dca1Attack: 0.4, dca1Decay: 0.5, dca1Sustain: 0.85, dca1Release: 0.6,
    dco2Shape1: 1, dco2Width1: 0.5, dco2Shape2: 1, dco2Width2: 0.5,
    dco2Octave: 0, dco2Detune: 0.3, dco2Balance: 0,
    dcf2Cutoff: 0.55, dcf2Reso: 0.1, dcf2Envelope: 0.25,
    dca2Volume: 0.6, dca2Attack: 0.45, dca2Decay: 0.5, dca2Sustain: 0.8, dca2Release: 0.65,
    chorusWet: 0.4, chorusDelay: 0.3, chorusFeedback: 0.2, chorusRate: 0.25, chorusMod: 0.6,
  },
  'Bass Station': {
    ...DEFAULT_SYNTHV1,
    dco1Shape1: 0, dco1Width1: 0.4, dco1Shape2: 1, dco1Width2: 0.5,
    dco1Octave: -1, dco1Balance: -0.3,
    dcf1Cutoff: 0.35, dcf1Reso: 0.4, dcf1Envelope: 0.6, dcf1Type: 0,
    dcf1Attack: 0, dcf1Decay: 0.25, dcf1Sustain: 0.2, dcf1Release: 0.15,
    dca1Volume: 0.9, dca1Attack: 0, dca1Decay: 0.2, dca1Sustain: 0.7, dca1Release: 0.15,
    dca2Volume: 0,
  },
  'Lead Synth': {
    ...DEFAULT_SYNTHV1,
    dco1Shape1: 1, dco1Width1: 0.5, dco1Shape2: 1, dco1Width2: 0.5,
    dco1Detune: 0.15,
    dcf1Cutoff: 0.7, dcf1Reso: 0.3, dcf1Envelope: 0.4,
    dca1Attack: 0.02, dca1Decay: 0.3, dca1Sustain: 0.75, dca1Release: 0.25,
    dco2Shape1: 0, dco2Width1: 0.5, dco2Shape2: 0, dco2Width2: 0.5,
    dco2Detune: 0.2,
    dcf2Cutoff: 0.65, dcf2Reso: 0.25, dcf2Envelope: 0.35,
    dca2Volume: 0.6, dca2Attack: 0.02, dca2Decay: 0.3, dca2Sustain: 0.7, dca2Release: 0.25,
    phaserWet: 0.35, phaserRate: 0.3, phaserFeedback: 0.4, phaserDepth: 0.6, phaserDaft: 0.2,
  },
  'String Machine': {
    ...DEFAULT_SYNTHV1,
    dco1Shape1: 1, dco1Shape2: 1, dco1Detune: 0.35,
    dcf1Cutoff: 0.5, dcf1Reso: 0.1, dcf1Envelope: 0.2,
    dca1Attack: 0.55, dca1Decay: 0.4, dca1Sustain: 0.9, dca1Release: 0.7,
    dco1Panning: -0.4,
    dco2Shape1: 1, dco2Shape2: 1, dco2Octave: 1, dco2Detune: 0.4,
    dcf2Cutoff: 0.55, dcf2Reso: 0.1, dcf2Envelope: 0.15,
    dca2Volume: 0.5, dca2Attack: 0.6, dca2Decay: 0.4, dca2Sustain: 0.85, dca2Release: 0.75,
    dco2Panning: 0.4,
    chorusWet: 0.3, chorusRate: 0.2, chorusMod: 0.5,
    reverbWet: 0.35, reverbRoom: 0.6,
  },
  'FM Bell': {
    ...DEFAULT_SYNTHV1,
    dco1Shape1: 2, dco1Shape2: 2, dco1RingMod: 0.8,
    dco1Octave: 2, dco1Tuning: 0.3,
    dcf1Cutoff: 0.85, dcf1Reso: 0.05, dcf1Envelope: 0.3,
    dcf1Attack: 0, dcf1Decay: 0.5, dcf1Sustain: 0.1, dcf1Release: 0.5,
    dca1Attack: 0, dca1Decay: 0.6, dca1Sustain: 0.05, dca1Release: 0.6,
    dca2Volume: 0,
    reverbWet: 0.45, reverbRoom: 0.7,
  },
  'Analog Strings': {
    ...DEFAULT_SYNTHV1,
    // Page 1: slow saw pad with gentle filter
    dco1Shape1: 1, dco1Width1: 0.5, dco1Shape2: 1, dco1Width2: 0.5,
    dco1Detune: 0.3, dco1Balance: 0.1,
    dcf1Cutoff: 0.45, dcf1Reso: 0.12, dcf1Envelope: 0.25,
    dcf1Attack: 0.5, dcf1Decay: 0.6, dcf1Sustain: 0.7, dcf1Release: 0.6,
    dca1Attack: 0.6, dca1Decay: 0.5, dca1Sustain: 0.9, dca1Release: 0.7,
    dco1Panning: -0.3,
    // Page 2: octave up, complementary detune
    dco2Shape1: 1, dco2Shape2: 1, dco2Octave: 1, dco2Detune: 0.35,
    dcf2Cutoff: 0.5, dcf2Reso: 0.1, dcf2Envelope: 0.2,
    dca2Volume: 0.45, dca2Attack: 0.65, dca2Decay: 0.5, dca2Sustain: 0.85, dca2Release: 0.75,
    dco2Panning: 0.3,
    chorusWet: 0.35, chorusRate: 0.15, chorusMod: 0.55,
    reverbWet: 0.4, reverbRoom: 0.65,
  },
  'Detuned Saws': {
    ...DEFAULT_SYNTHV1,
    // Page 1: fat detuned saw
    dco1Shape1: 1, dco1Width1: 0.5, dco1Shape2: 1, dco1Width2: 0.5,
    dco1Detune: 0.4, dco1Balance: 0,
    dcf1Cutoff: 0.65, dcf1Reso: 0.2, dcf1Envelope: 0.35,
    dcf1Attack: 0.05, dcf1Decay: 0.4, dcf1Sustain: 0.5, dcf1Release: 0.35,
    dca1Attack: 0.05, dca1Decay: 0.3, dca1Sustain: 0.85, dca1Release: 0.35,
    // Page 2: more detune, slightly different filter
    dco2Shape1: 1, dco2Shape2: 1, dco2Detune: 0.45,
    dcf2Cutoff: 0.6, dcf2Reso: 0.18, dcf2Envelope: 0.3,
    dca2Volume: 0.7, dca2Attack: 0.05, dca2Decay: 0.35, dca2Sustain: 0.8, dca2Release: 0.35,
    chorusWet: 0.3, chorusRate: 0.2, chorusMod: 0.5,
  },
  'Brass Ensemble': {
    ...DEFAULT_SYNTHV1,
    // Page 1: saw with medium attack, resonant filter sweep
    dco1Shape1: 1, dco1Width1: 0.5, dco1Shape2: 1, dco1Width2: 0.5,
    dco1Detune: 0.1,
    dcf1Cutoff: 0.3, dcf1Reso: 0.25, dcf1Envelope: 0.7, dcf1Type: 0,
    dcf1Attack: 0.15, dcf1Decay: 0.35, dcf1Sustain: 0.5, dcf1Release: 0.2,
    dca1Attack: 0.12, dca1Decay: 0.3, dca1Sustain: 0.8, dca1Release: 0.2,
    // Page 2: unison octave, slight detune
    dco2Shape1: 1, dco2Shape2: 1, dco2Octave: 0, dco2Detune: 0.15,
    dcf2Cutoff: 0.35, dcf2Reso: 0.2, dcf2Envelope: 0.65,
    dcf2Attack: 0.15, dcf2Decay: 0.35, dcf2Sustain: 0.45, dcf2Release: 0.2,
    dca2Volume: 0.55, dca2Attack: 0.12, dca2Decay: 0.3, dca2Sustain: 0.75, dca2Release: 0.2,
    reverbWet: 0.25, reverbRoom: 0.45,
  },
  'Glass Bell': {
    ...DEFAULT_SYNTHV1,
    // Page 1: sine ring mod, bright percussive
    dco1Shape1: 2, dco1Shape2: 2, dco1RingMod: 0.6,
    dco1Octave: 1, dco1Tuning: 0.35,
    dcf1Cutoff: 0.9, dcf1Reso: 0.08, dcf1Envelope: 0.2,
    dcf1Attack: 0, dcf1Decay: 0.7, dcf1Sustain: 0.05, dcf1Release: 0.7,
    dca1Attack: 0, dca1Decay: 0.75, dca1Sustain: 0.03, dca1Release: 0.75,
    // Page 2: higher octave shimmer
    dco2Shape1: 2, dco2Shape2: 2, dco2Octave: 2, dco2RingMod: 0.4,
    dco2Tuning: 0.55,
    dcf2Cutoff: 0.85, dcf2Reso: 0.05,
    dca2Volume: 0.3, dca2Attack: 0, dca2Decay: 0.6, dca2Sustain: 0.02, dca2Release: 0.6,
    reverbWet: 0.55, reverbRoom: 0.8,
  },
  'Sub Bass': {
    ...DEFAULT_SYNTHV1,
    // Page 1: sine sub, tight envelope
    dco1Shape1: 2, dco1Width1: 0.5, dco1Shape2: 2, dco1Width2: 0.5,
    dco1Octave: -2, dco1Balance: 0,
    dcf1Cutoff: 0.25, dcf1Reso: 0.1, dcf1Envelope: 0.4, dcf1Type: 0,
    dcf1Attack: 0, dcf1Decay: 0.2, dcf1Sustain: 0.3, dcf1Release: 0.1,
    dca1Volume: 0.95, dca1Attack: 0, dca1Decay: 0.15, dca1Sustain: 0.8, dca1Release: 0.1,
    // Page 2: saw layer one octave up for presence
    dco2Shape1: 1, dco2Shape2: 1, dco2Octave: -1, dco2Detune: 0.05,
    dcf2Cutoff: 0.3, dcf2Reso: 0.2, dcf2Envelope: 0.5,
    dcf2Attack: 0, dcf2Decay: 0.2, dcf2Sustain: 0.2, dcf2Release: 0.1,
    dca2Volume: 0.35, dca2Attack: 0, dca2Decay: 0.2, dca2Sustain: 0.6, dca2Release: 0.1,
  },
  'Wobble': {
    ...DEFAULT_SYNTHV1,
    // Page 1: saw with LFO on filter
    dco1Shape1: 1, dco1Width1: 0.5, dco1Shape2: 0, dco1Width2: 0.45,
    dco1Octave: -1, dco1Balance: -0.2,
    dcf1Cutoff: 0.3, dcf1Reso: 0.55, dcf1Envelope: 0.4, dcf1Type: 0,
    dcf1Attack: 0, dcf1Decay: 0.3, dcf1Sustain: 0.3, dcf1Release: 0.15,
    dca1Volume: 0.9, dca1Attack: 0, dca1Decay: 0.2, dca1Sustain: 0.85, dca1Release: 0.15,
    lfo1Shape: 2, lfo1Bpm: 0.4, lfo1Cutoff: 0.6, lfo1Reso: 0.15, lfo1Sync: 1,
    dca2Volume: 0,
  },
  'Ambient Texture': {
    ...DEFAULT_SYNTHV1,
    // Page 1: noise + sine blend, very slow evolving
    dco1Shape1: 3, dco1Width1: 0.5, dco1Shape2: 2, dco1Width2: 0.5,
    dco1Balance: 0.3,
    dcf1Cutoff: 0.35, dcf1Reso: 0.2, dcf1Envelope: 0.15, dcf1Type: 0,
    dcf1Attack: 0.8, dcf1Decay: 0.7, dcf1Sustain: 0.6, dcf1Release: 0.8,
    dca1Attack: 0.9, dca1Decay: 0.6, dca1Sustain: 0.7, dca1Release: 0.9,
    // Page 2: detuned sines, slow sweep
    dco2Shape1: 2, dco2Shape2: 2, dco2Detune: 0.2, dco2Octave: 1,
    dcf2Cutoff: 0.4, dcf2Reso: 0.15, dcf2Envelope: 0.1,
    dcf2Attack: 0.85, dcf2Decay: 0.7, dcf2Sustain: 0.65, dcf2Release: 0.85,
    dca2Volume: 0.4, dca2Attack: 0.95, dca2Decay: 0.6, dca2Sustain: 0.65, dca2Release: 0.9,
    reverbWet: 0.6, reverbRoom: 0.85,
    delayWet: 0.3, delayDelay: 0.4, delayFeedback: 0.45,
  },
  'Vintage Keys': {
    ...DEFAULT_SYNTHV1,
    // Page 1: pulse with medium width for electric piano character
    dco1Shape1: 0, dco1Width1: 0.35, dco1Shape2: 2, dco1Width2: 0.5,
    dco1Balance: -0.4, dco1Octave: 0,
    dcf1Cutoff: 0.55, dcf1Reso: 0.1, dcf1Envelope: 0.35,
    dcf1Attack: 0, dcf1Decay: 0.45, dcf1Sustain: 0.35, dcf1Release: 0.3,
    dca1Attack: 0, dca1Decay: 0.5, dca1Sustain: 0.6, dca1Release: 0.3,
    // Page 2 off
    dca2Volume: 0,
    chorusWet: 0.25, chorusRate: 0.2, chorusMod: 0.4,
    reverbWet: 0.2, reverbRoom: 0.35,
  },
  'Trance Lead': {
    ...DEFAULT_SYNTHV1,
    // Page 1: bright saw lead
    dco1Shape1: 1, dco1Width1: 0.5, dco1Shape2: 1, dco1Width2: 0.5,
    dco1Detune: 0.2,
    dcf1Cutoff: 0.75, dcf1Reso: 0.35, dcf1Envelope: 0.5,
    dcf1Attack: 0.02, dcf1Decay: 0.25, dcf1Sustain: 0.6, dcf1Release: 0.2,
    dca1Attack: 0.01, dca1Decay: 0.2, dca1Sustain: 0.8, dca1Release: 0.2,
    // Page 2: square an octave up for bite
    dco2Shape1: 0, dco2Width1: 0.5, dco2Shape2: 0, dco2Width2: 0.5,
    dco2Octave: 1, dco2Detune: 0.15,
    dcf2Cutoff: 0.7, dcf2Reso: 0.3, dcf2Envelope: 0.45,
    dca2Volume: 0.4, dca2Attack: 0.01, dca2Decay: 0.2, dca2Sustain: 0.7, dca2Release: 0.2,
    delayWet: 0.25, delayDelay: 0.35, delayFeedback: 0.35,
  },
  'Noise Pad': {
    ...DEFAULT_SYNTHV1,
    // Page 1: filtered noise, slow evolving
    dco1Shape1: 3, dco1Width1: 0.5, dco1Shape2: 3, dco1Width2: 0.5,
    dco1Balance: 0,
    dcf1Cutoff: 0.4, dcf1Reso: 0.3, dcf1Envelope: 0.2, dcf1Type: 1,
    dcf1Attack: 0.7, dcf1Decay: 0.6, dcf1Sustain: 0.5, dcf1Release: 0.7,
    dca1Attack: 0.8, dca1Decay: 0.5, dca1Sustain: 0.75, dca1Release: 0.8,
    // Page 2: sine undertone for pitch reference
    dco2Shape1: 2, dco2Shape2: 2, dco2Octave: -1,
    dcf2Cutoff: 0.3, dcf2Reso: 0.05,
    dca2Volume: 0.25, dca2Attack: 0.85, dca2Decay: 0.5, dca2Sustain: 0.7, dca2Release: 0.85,
    reverbWet: 0.55, reverbRoom: 0.75,
    flangerWet: 0.2, flangerDelay: 0.3, flangerFeedback: 0.35, flangerDaft: 0.4,
  },
};

export const DCO_SHAPE_NAMES = ['Pulse', 'Saw', 'Sine', 'Noise'];
export const DCF_TYPE_NAMES = ['LPF', 'BPF', 'HPF', 'BRF'];
export const LFO_SHAPE_NAMES = ['Tri', 'Sine', 'Saw', 'Square', 'S&H'];

export class SynthV1Engine implements DevilboxSynth {
  readonly name = 'SynthV1Engine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: SynthV1Config;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void> | null = null;

  constructor(config: Partial<SynthV1Config> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    this.config = { ...DEFAULT_SYNTHV1, ...config };
  }

  /** Deferred init — called by factory pattern (createSynthV1) */
  async init(): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = this.initialize();
    }
    return this._initPromise;
  }

  public async ensureInitialized(): Promise<void> {
    return this.init();
  }

  private async initialize(): Promise<void> {
    try {
      const rawContext = getDevilboxAudioContext();
      const baseUrl = import.meta.env.BASE_URL || '/';

      if (!SynthV1Engine.isWorkletLoaded) {
        if (!SynthV1Engine.workletLoadPromise) {
          SynthV1Engine.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}synthv1/SynthV1.worklet.js`
          );
        }
        await SynthV1Engine.workletLoadPromise;
        SynthV1Engine.isWorkletLoaded = true;
      }

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(`${baseUrl}synthv1/SynthV1.wasm`),
        fetch(`${baseUrl}synthv1/SynthV1.js`)
      ]);

      if (!wasmResponse.ok) throw new Error(`Failed to load SynthV1.wasm: ${wasmResponse.status}`);
      if (!jsResponse.ok) throw new Error(`Failed to load SynthV1.js: ${jsResponse.status}`);

      const [wasmBinary, jsCodeRaw] = await Promise.all([
        wasmResponse.arrayBuffer(),
        jsResponse.text()
      ]);

      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      const jsCode = urlPolyfill + jsCodeRaw
        .replace(/import\.meta\.url/g, `"${baseUrl}synthv1/"`)
        .replace(/export\s+default\s+\w+;?\s*$/, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      this._worklet = new AudioWorkletNode(rawContext, 'synthv1-processor', {
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
          console.error('SynthV1 error:', event.data.error);
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
      console.error('Failed to initialize SynthV1:', error);
      throw error;
    }
  }

  applyConfig(config: Partial<SynthV1Config>): void {
    Object.assign(this.config, config);
    if (!this._worklet || !this.isInitialized) return;
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const value = this.config[CONFIG_KEYS[i]];
      if (value !== undefined) {
        this._worklet.port.postMessage({ type: 'setParam', index: i, value });
      }
    }
  }

  triggerAttack(frequency: number | string, _time?: number, velocity?: number): this {
    const note = typeof frequency === 'string'
      ? noteToMidi(frequency)
      : Math.round(12 * Math.log2(frequency / 440) + 69);
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
      const note = typeof frequency === 'string'
        ? noteToMidi(frequency)
        : Math.round(12 * Math.log2(frequency / 440) + 69);
      this._worklet.port.postMessage({ type: 'noteOff', note });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  set(param: string, value: number): void {
    const index = CONFIG_KEYS.indexOf(param as keyof SynthV1Config);
    if (index >= 0) {
      (this.config as unknown as Record<string, number>)[param] = value;
      if (this._worklet && this.isInitialized) {
        this._worklet.port.postMessage({ type: 'setParam', index, value });
      }
    }
  }

  get(param: string): number | undefined {
    return (this.config as unknown as Record<string, number | undefined>)[param];
  }

  setPreset(name: string): void {
    const preset = SYNTHV1_PRESETS[name];
    if (preset) {
      this.config = { ...DEFAULT_SYNTHV1, ...preset };
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

/** Alias expected by CommunitySynthFactory */
export { SynthV1Engine as SynthV1SynthImpl };
