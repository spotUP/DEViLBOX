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

export interface MoniqueConfig {
  // Master (0-4)
  volume?: number;          // 0-1
  glide?: number;           // 0-1
  octaveOffset?: number;    // -2 to 2
  noteOffset?: number;      // 0-12
  sync?: number;            // 0-1 toggle

  // Oscillators (5-16)
  osc1Wave?: number;        // 0-3 (sine/saw/square/noise)
  osc1Octave?: number;      // -36 to 36 semitones (tune)
  osc1FmPower?: number;     // 0-1 (fm_amount)
  osc1Sync?: number;        // 0-1 toggle
  osc2Wave?: number;
  osc2Octave?: number;
  osc2FmPower?: number;
  osc2Sync?: number;
  osc3Wave?: number;
  osc3Octave?: number;
  osc3FmPower?: number;
  osc3Sync?: number;

  // FM Osc (17-20)
  fmFreq?: number;          // 0-1 (was fmFreq)
  fmShape?: number;         // 0-1 (was fmPhase — actually FM_SHAPE in C++)
  fmSwing?: number;         // 0-1
  masterShift?: number;     // 0-1

  // Filter 1 (21-27)
  filter1Type?: number;     // 1-7
  filter1Cutoff?: number;   // 0-1
  filter1Resonance?: number;// 0-1
  filter1Distortion?: number;
  filter1Output?: number;   // 0-1
  filter1Pan?: number;      // -1 to 1
  filter1ModMix?: number;   // -1 to 1 (adsr_lfo_mix)
  // Filter 2 (28-34)
  filter2Type?: number;
  filter2Cutoff?: number;
  filter2Resonance?: number;
  filter2Distortion?: number;
  filter2Output?: number;
  filter2Pan?: number;
  filter2ModMix?: number;
  // Filter 3 (35-41)
  filter3Type?: number;
  filter3Cutoff?: number;
  filter3Resonance?: number;
  filter3Distortion?: number;
  filter3Output?: number;
  filter3Pan?: number;
  filter3ModMix?: number;

  // Filter input routing (87-95)
  filter1Input0?: number;   // 0-1
  filter1Input1?: number;
  filter1Input2?: number;
  filter2Input0?: number;
  filter2Input1?: number;
  filter2Input2?: number;
  filter3Input0?: number;
  filter3Input1?: number;
  filter3Input2?: number;

  // Envelope 1 — Filter 1 (42-47)
  env1Attack?: number;      // 0-1
  env1Decay?: number;
  env1Sustain?: number;
  env1SusTime?: number;     // sustain_time (was Retrigger)
  env1Release?: number;
  env1Shape?: number;       // -1 to 1
  // Envelope 2 — Filter 2 (48-53)
  env2Attack?: number;
  env2Decay?: number;
  env2Sustain?: number;
  env2SusTime?: number;
  env2Release?: number;
  env2Shape?: number;
  // Envelope 3 — Filter 3 (54-59)
  env3Attack?: number;
  env3Decay?: number;
  env3Sustain?: number;
  env3SusTime?: number;
  env3Release?: number;
  env3Shape?: number;
  // Envelope 4 — Main output (60-65)
  env4Attack?: number;
  env4Decay?: number;
  env4Sustain?: number;
  env4SusTime?: number;
  env4Release?: number;
  env4Shape?: number;

  // LFOs (66-74)
  lfo1Speed?: number;       // 0-16 int
  lfo1Wave?: number;        // 0-1
  lfo1Phase?: number;       // 0-1
  lfo2Speed?: number;
  lfo2Wave?: number;
  lfo2Phase?: number;
  lfo3Speed?: number;
  lfo3Wave?: number;
  lfo3Phase?: number;

  // MFOs (75-86)
  mfo1Speed?: number;
  mfo1Wave?: number;
  mfo1Phase?: number;
  mfo2Speed?: number;
  mfo2Wave?: number;
  mfo2Phase?: number;
  mfo3Speed?: number;
  mfo3Wave?: number;
  mfo3Phase?: number;
  mfo4Speed?: number;
  mfo4Wave?: number;
  mfo4Phase?: number;

  // Effects (96-103)
  distortion?: number;      // 0-1
  shape?: number;           // 0-1 distortion shape
  delay?: number;
  delayPan?: number;
  reverbRoom?: number;      // 0-1
  reverbMix?: number;
  chorusMod?: number;
  effectBypass?: number;    // 0-1 toggle

  // Morph (104-107)
  morph1?: number;
  morph2?: number;
  morph3?: number;
  morph4?: number;

  // Arp (108-111)
  arpOn?: number;
  arpSequencer?: number;
  arpSpeed?: number;
  arpShuffle?: number;

  // EQ (112-119)
  eqBand1?: number;
  eqBand2?: number;
  eqBand3?: number;
  eqBand4?: number;
  eqBand5?: number;
  eqBand6?: number;
  eqBand7?: number;
  eqBypass?: number;        // 0-1 toggle
}

// Matches C++ PARAM_DEFAULTS in MoniqueSynth.cpp exactly
export const DEFAULT_MONIQUE: MoniqueConfig = {
  // Master
  volume: 0.9, glide: 0.05, octaveOffset: 0, noteOffset: 0, sync: 1,
  // Osc1 (SAW default)
  osc1Wave: 1, osc1Octave: 0, osc1FmPower: 0, osc1Sync: 0,
  // Osc2
  osc2Wave: 0, osc2Octave: 0, osc2FmPower: 0, osc2Sync: 1,
  // Osc3
  osc3Wave: 0, osc3Octave: 0, osc3FmPower: 0, osc3Sync: 1,
  // FM Osc
  fmFreq: 0, fmShape: 0, fmSwing: 0, masterShift: 0,
  // Filter1
  filter1Type: 1, filter1Cutoff: 0.2, filter1Resonance: 0.3,
  filter1Distortion: 0, filter1Output: 0.75, filter1Pan: 0, filter1ModMix: -0.9,
  // Filter2
  filter2Type: 1, filter2Cutoff: 0.2, filter2Resonance: 0.3,
  filter2Distortion: 0, filter2Output: 0.75, filter2Pan: 0, filter2ModMix: -0.9,
  // Filter3
  filter3Type: 1, filter3Cutoff: 0.2, filter3Resonance: 0.3,
  filter3Distortion: 0, filter3Output: 0.75, filter3Pan: 0, filter3ModMix: -0.9,
  // FiltEnv1-3
  env1Attack: 0.05, env1Decay: 0.02, env1Sustain: 0.9, env1SusTime: 1, env1Release: 0.2, env1Shape: 0,
  env2Attack: 0.05, env2Decay: 0.02, env2Sustain: 0.9, env2SusTime: 1, env2Release: 0.2, env2Shape: 0,
  env3Attack: 0.05, env3Decay: 0.02, env3Sustain: 0.9, env3SusTime: 1, env3Release: 0.2, env3Shape: 0,
  // Env main output
  env4Attack: 0.05, env4Decay: 0.02, env4Sustain: 0.9, env4SusTime: 1, env4Release: 0.2, env4Shape: 0,
  // LFOs
  lfo1Speed: 4, lfo1Wave: 0, lfo1Phase: 0,
  lfo2Speed: 4, lfo2Wave: 0, lfo2Phase: 0,
  lfo3Speed: 4, lfo3Wave: 0, lfo3Phase: 0,
  // MFOs
  mfo1Speed: 4, mfo1Wave: 0, mfo1Phase: 0,
  mfo2Speed: 4, mfo2Wave: 0, mfo2Phase: 0,
  mfo3Speed: 4, mfo3Wave: 0, mfo3Phase: 0,
  mfo4Speed: 4, mfo4Wave: 0, mfo4Phase: 0,
  // Routing (Osc1→Filter1 = 1, rest = 0)
  filter1Input0: 1, filter1Input1: 0, filter1Input2: 0,
  filter2Input0: 0, filter2Input1: 0, filter2Input2: 0,
  filter3Input0: 0, filter3Input1: 0, filter3Input2: 0,
  // FX
  distortion: 0.6, shape: 0.05, delay: 0, delayPan: 0,
  reverbRoom: 0.333, reverbMix: 0.75, chorusMod: 0.333, effectBypass: 1,
  // Morph
  morph1: 0, morph2: 0, morph3: 0, morph4: 0,
  // Arp
  arpOn: 0, arpSequencer: 0, arpSpeed: 0, arpShuffle: 0,
  // EQ
  eqBand1: 0.5, eqBand2: 0.5, eqBand3: 0.5, eqBand4: 0.5,
  eqBand5: 0.5, eqBand6: 0.5, eqBand7: 0.5, eqBypass: 1,
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
    distortion: 0.4, glide: 0.6,
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
    glide: 0.3,    volume: 0.7,
  },
  'FM Pluck': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 0, osc1FmPower: 0.7,
    osc2Wave: 0, osc2FmPower: 0.5, osc2Octave: 12,
    fmFreq: 0.6, fmSwing: 0.3,
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
    reverbRoom: 0.6, reverbMix: 0.4,    volume: 0.65,
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
    chorusMod: 0.3,    distortion: 0.15, volume: 0.85,
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
    glide: 0.2,    delay: 0.3, delayPan: 0.7,
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
    reverbRoom: 0.9, reverbMix: 0.6,    delay: 0.4, delayPan: 0.6,
    volume: 0.6,
  },
  'Metallic Bell': {
    ...DEFAULT_MONIQUE,
    osc1Wave: 0, osc1FmPower: 0.8, osc1Octave: 12,
    osc2Wave: 0, osc2FmPower: 0.6, osc2Octave: 19,
    fmFreq: 0.8, fmSwing: 0.5,
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
    glide: 0.5,    chorusMod: 0.5,    distortion: 0.3, volume: 0.75,
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
    glide: 0.4,    distortion: 0.6, volume: 0.7,
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
    fmFreq: 0.7, fmSwing: 0.3,
    filter1Type: 1, filter1Cutoff: 0.7, filter1Resonance: 0.2,
    filter1Output: 1, filter1Input0: 0.8, filter1Input1: 0.6, filter1Input2: 0.4,
    env1Attack: 0.001, env1Decay: 0.6, env1Sustain: 0.0, env1Release: 0.8,
    env4Attack: 0.001, env4Decay: 0.8, env4Sustain: 0.0, env4Release: 1.0,
    reverbRoom: 0.7, reverbMix: 0.4,    volume: 0.7,
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
    chorusMod: 0.3,    volume: 0.8,
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
    reverbRoom: 0.9, reverbMix: 0.6,    chorusMod: 0.4,    volume: 0.7,
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
    glide: 1.0,    volume: 0.7,
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
// Must match the enum MoniqueParams in MoniqueSynth.cpp exactly (0-119).
const PARAM_INDEX: Record<string, number> = {
  // Master (0-4)
  volume: 0, glide: 1, octaveOffset: 2, noteOffset: 3, sync: 4,
  // Osc1 (5-8)
  osc1Wave: 5, osc1Octave: 6, osc1FmPower: 7, osc1Sync: 8,
  // Osc2 (9-12)
  osc2Wave: 9, osc2Octave: 10, osc2FmPower: 11, osc2Sync: 12,
  // Osc3 (13-16)
  osc3Wave: 13, osc3Octave: 14, osc3FmPower: 15, osc3Sync: 16,
  // FM Osc (17-20)
  fmFreq: 17, fmShape: 18, fmSwing: 19, masterShift: 20,
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
  env1SusTime: 45, env1Release: 46, env1Shape: 47,
  // FiltEnv2 (48-53)
  env2Attack: 48, env2Decay: 49, env2Sustain: 50,
  env2SusTime: 51, env2Release: 52, env2Shape: 53,
  // FiltEnv3 (54-59)
  env3Attack: 54, env3Decay: 55, env3Sustain: 56,
  env3SusTime: 57, env3Release: 58, env3Shape: 59,
  // Env — main output (60-65)
  env4Attack: 60, env4Decay: 61, env4Sustain: 62,
  env4SusTime: 63, env4Release: 64, env4Shape: 65,
  // LFOs (66-74)
  lfo1Speed: 66, lfo1Wave: 67, lfo1Phase: 68,
  lfo2Speed: 69, lfo2Wave: 70, lfo2Phase: 71,
  lfo3Speed: 72, lfo3Wave: 73, lfo3Phase: 74,
  // MFOs (75-86)
  mfo1Speed: 75, mfo1Wave: 76, mfo1Phase: 77,
  mfo2Speed: 78, mfo2Wave: 79, mfo2Phase: 80,
  mfo3Speed: 81, mfo3Wave: 82, mfo3Phase: 83,
  mfo4Speed: 84, mfo4Wave: 85, mfo4Phase: 86,
  // Routing — filter input levels (87-95)
  filter1Input0: 87, filter1Input1: 88, filter1Input2: 89,
  filter2Input0: 90, filter2Input1: 91, filter2Input2: 92,
  filter3Input0: 93, filter3Input1: 94, filter3Input2: 95,
  // FX (96-103)
  distortion: 96, shape: 97, delay: 98, delayPan: 99,
  reverbRoom: 100, reverbMix: 101, chorusMod: 102, effectBypass: 103,
  // Morph (104-107)
  morph1: 104, morph2: 105, morph3: 106, morph4: 107,
  // Arp (108-111)
  arpOn: 108, arpSequencer: 109, arpSpeed: 110, arpShuffle: 111,
  // EQ (112-119)
  eqBand1: 112, eqBand2: 113, eqBand3: 114, eqBand4: 115,
  eqBand5: 116, eqBand6: 117, eqBand7: 118, eqBypass: 119,
};

export class MoniqueSynthEngine implements DevilboxSynth {
  readonly name = 'MoniqueSynthEngine';
  readonly output: GainNode;

  private _worklet: AudioWorkletNode | null = null;
  private config: MoniqueConfig;
  private _pendingConfig: MoniqueConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];
  private _currentNote = -1;

  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private _initPromise: Promise<void>;

  constructor(config: Partial<MoniqueConfig> = {}) {
    this.output = getDevilboxAudioContext().createGain();
    // Store the desired config but keep internal state empty so the first
    // applyConfig() on worklet-ready sends ALL params to override WASM factory defaults.
    this._pendingConfig = { ...DEFAULT_MONIQUE, ...config };
    this.config = {} as MoniqueConfig;
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
          // this.config starts empty so applyConfig sends ALL params on first call
          this.applyConfig(this._pendingConfig);
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
    const prev = this.config as Record<string, number | undefined>;
    const next = config as Record<string, number | undefined>;
    for (const [key, index] of Object.entries(PARAM_INDEX)) {
      const value = next[key];
      if (value !== undefined && value !== prev[key]) {
        this._worklet.port.postMessage({ type: 'setParam', index, value });
      }
    }
    this.config = { ...config };
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

  // Monique is monophonic — release whatever is playing.
  // Accepts both (time) and (note, time) signatures for compatibility with ToneEngine.
  triggerRelease(_noteOrTime?: number | string, _time?: number): this {
    if (!this._worklet || !this.isInitialized) {
      // Clear pending notes to prevent stuck notes when noteOff arrives before init
      this.pendingNotes = [];
      return this;
    }
    // Send noteOff for tracked note if known, otherwise allNotesOff
    if (this._currentNote >= 0) {
      this._worklet.port.postMessage({ type: 'noteOff', note: this._currentNote });
    }
    this._worklet.port.postMessage({ type: 'allNotesOff' });
    this._currentNote = -1;
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
      this.applyConfig({ ...preset });
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
