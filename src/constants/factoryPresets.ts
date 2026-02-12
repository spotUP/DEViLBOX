/**
 * Factory Presets - 36+ ready-to-use instrument presets
 * Organized by category: Bass, Leads, Pads, Drums, FX
 * Includes all TB-303 presets from tb303Presets.ts
 */

import type { InstrumentPreset } from '@typedefs/instrument';
import { VOWEL_FORMANTS } from '@typedefs/instrument';
import { TB303_PRESETS } from './tb303Presets';
import { FURNACE_PRESETS } from './furnacePresets';
import { DUB_SIREN_PRESETS } from './dubSirenPresets';
import { SPACE_LASER_PRESETS } from './spaceLaserPresets';
import { V2_PRESETS, V2_PRESET_KICK, V2_PRESET_SNARE, V2_PRESET_HAT } from './v2Presets';
import { SYNARE_PRESETS } from './synarePresets';
import { DRUMNIBUS_PRESETS as DRUMNIBUS_KIT_PRESETS } from './drumnibusPresets';
import { V2_FACTORY_PRESETS } from './v2FactoryPresets';
import { SAM_PRESETS } from './samPresets';
import { MAME_CHIP_PRESETS } from './mameChipPresets';
import { DEXED_FACTORY_PRESETS, OBXD_FACTORY_PRESETS } from './jucePresets';
import { FURNACE_CHIP_PRESETS } from './furnaceChipPresets';
import { SAMPLE_PACK_PRESETS, WAVETABLE_PACK_PRESETS } from './samplePresets';
import { BUZZMACHINE_FACTORY_PRESETS } from './buzzmachineFactoryPresets';
import { MAKK_FACTORY_PRESETS } from './makkPresets';

// BASS PRESETS (18)


export const BASS_PRESETS: InstrumentPreset['config'][] = [
  // Wobble Bass
  {
    type: 'synth' as const,
    name: 'Classic Wobble',
    synthType: 'WobbleBass',
    wobbleBass: {
      mode: 'classic',
      osc1: { type: 'sawtooth', octave: -1, detune: 0, level: 100 },
      osc2: { type: 'sawtooth', octave: -1, detune: 7, level: 80 },
      sub: { enabled: true, octave: -2, level: 60 },
      fm: { enabled: false, amount: 30, ratio: 2, envelope: 50 },
      unison: { voices: 4, detune: 15, stereoSpread: 50 },
      filter: { type: 'lowpass', cutoff: 800, resonance: 60, rolloff: -24, drive: 30, keyTracking: 0 },
      filterEnvelope: { amount: 70, attack: 5, decay: 300, sustain: 20, release: 200 },
      wobbleLFO: { enabled: true, sync: '1/4', rate: 4, shape: 'sine', amount: 80, pitchAmount: 0, fmAmount: 0, phase: 0, retrigger: true },
      envelope: { attack: 5, decay: 200, sustain: 80, release: 300 },
      distortion: { enabled: true, type: 'soft', drive: 40, tone: 70 },
      formant: { enabled: false, vowel: 'A', morph: 0, lfoAmount: 0 },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Growl Bass',
    synthType: 'WobbleBass',
    wobbleBass: {
      mode: 'growl',
      osc1: { type: 'sawtooth', octave: -2, detune: 0, level: 100 },
      osc2: { type: 'square', octave: -2, detune: 5, level: 70 },
      sub: { enabled: true, octave: -2, level: 80 },
      fm: { enabled: true, amount: 40, ratio: 1, envelope: 60 },
      unison: { voices: 2, detune: 10, stereoSpread: 30 },
      filter: { type: 'bandpass', cutoff: 600, resonance: 40, rolloff: -12, drive: 50, keyTracking: 20 },
      filterEnvelope: { amount: 50, attack: 10, decay: 400, sustain: 40, release: 200 },
      wobbleLFO: { enabled: true, sync: '1/8', rate: 4, shape: 'saw', amount: 60, pitchAmount: 0, fmAmount: 30, phase: 0, retrigger: true },
      envelope: { attack: 5, decay: 300, sustain: 60, release: 200 },
      distortion: { enabled: true, type: 'hard', drive: 60, tone: 50 },
      formant: { enabled: true, vowel: 'O', morph: 50, lfoAmount: 40 },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Reese Wobble',
    synthType: 'WobbleBass',
    wobbleBass: {
      mode: 'reese',
      osc1: { type: 'sawtooth', octave: -1, detune: -10, level: 90 },
      osc2: { type: 'sawtooth', octave: -1, detune: 10, level: 90 },
      sub: { enabled: true, octave: -2, level: 70 },
      fm: { enabled: false, amount: 0, ratio: 1, envelope: 0 },
      unison: { voices: 6, detune: 25, stereoSpread: 80 },
      filter: { type: 'lowpass', cutoff: 1200, resonance: 30, rolloff: -24, drive: 20, keyTracking: 0 },
      filterEnvelope: { amount: 0, attack: 0, decay: 0, sustain: 0, release: 0 },
      wobbleLFO: { enabled: true, sync: '1/2', rate: 1, shape: 'triangle', amount: 50, pitchAmount: 0, fmAmount: 0, phase: 0, retrigger: false },
      envelope: { attack: 20, decay: 500, sustain: 100, release: 800 },
      distortion: { enabled: true, type: 'soft', drive: 30, tone: 60 },
      formant: { enabled: false, vowel: 'A', morph: 0, lfoAmount: 0 },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  // FM Bass
  {
    type: 'synth' as const,
    name: 'FM Pluck Bass',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: -1 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 100 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  // Duo Bass
  {
    type: 'synth' as const,
    name: 'Duo Fat Bass',
    synthType: 'DuoSynth',
    oscillator: { type: 'sawtooth', detune: 5, octave: -1 },
    envelope: { attack: 10, decay: 400, sustain: 0.4, release: 200 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  // Basic Bass
  {
    type: 'synth' as const,
    name: 'Sine Sub',
    synthType: 'Synth',
    oscillator: { type: 'sine', detune: 0, octave: -1 },
    envelope: { attack: 5, decay: 500, sustain: 0, release: 100 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  // TB-303 presets are provided by TB303_PRESETS (spread below) with proper
  // 0-1 normalized values and devilFish configs matching db303.pages.dev defaults.

  // Non-303 Bass (4 presets)
  {
    type: 'synth' as const,
    name: '808 Sub',
    synthType: 'MonoSynth',
    oscillator: { type: 'sine', detune: 0, octave: -1 },
    envelope: { attack: 5, decay: 500, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 200, Q: 1, rolloff: -24 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Reese Bass',
    synthType: 'DuoSynth',
    oscillator: { type: 'sawtooth', detune: 15, octave: 0 },
    envelope: { attack: 10, decay: 500, sustain: 0, release: 200 },
    filter: { type: 'lowpass', frequency: 800, Q: 3, rolloff: -24 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'House Pluck',
    synthType: 'PluckSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 500, sustain: 0, release: 500 },
    filter: { type: 'lowpass', frequency: 2000, Q: 1, rolloff: -12 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Wobble Bass',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 5, decay: 400, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 1000, Q: 8, rolloff: -24 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Duo Sub Bass',
    synthType: 'DuoSynth',
    oscillator: { type: 'triangle', detune: 0, octave: -1 },
    envelope: { attack: 5, decay: 200, sustain: 1, release: 100 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'ESQ-1 Bass',
    synthType: 'MAMEDOC',
    effects: [],
    volume: -8,
    pan: 0,
  },

  // === TB-303 PRESETS (from tb303Presets.ts) ===
  // All comprehensive TB-303 presets including acidbox, dittytoy references, etc.
  ...TB303_PRESETS,
  
  // === DUB SIREN PRESETS ===
  ...DUB_SIREN_PRESETS,
];

// ============================================================================
// LEAD PRESETS (15)
// ============================================================================

export const LEAD_PRESETS: InstrumentPreset['config'][] = [
  // Pluck Synth
  {
    type: 'synth' as const,
    name: 'Trance Pluck',
    synthType: 'PluckSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 300 },
    filter: { type: 'lowpass', frequency: 4000, Q: 2, rolloff: -24 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Pluck Keys',
    synthType: 'PluckSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 500, sustain: 0, release: 500 },
    filter: { type: 'lowpass', frequency: 2500, Q: 1, rolloff: -12 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Guitar Pluck',
    synthType: 'PluckSynth',
    oscillator: { type: 'sawtooth', detune: 0, octave: -1 },
    envelope: { attack: 5, decay: 200, sustain: 0, release: 100 },
    filter: { type: 'highpass', frequency: 200, Q: 1, rolloff: -12 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  // AM Synth
  {
    type: 'synth' as const,
    name: 'AM Bell',
    synthType: 'AMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 500 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'AM Sci-Fi',
    synthType: 'AMSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 50, decay: 500, sustain: 0.5, release: 1000 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  // FM Synth
  {
    type: 'synth' as const,
    name: 'FM Electric Piano',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 500, sustain: 0.2, release: 500 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  // Duo Synth
  {
    type: 'synth' as const,
    name: 'Duo Saw Lead',
    synthType: 'DuoSynth',
    oscillator: { type: 'sawtooth', detune: 10, octave: 0 },
    envelope: { attack: 10, decay: 200, sustain: 0.5, release: 200 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  // Basic Synth
  {
    type: 'synth' as const,
    name: 'Square Lead',
    synthType: 'Synth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 5, decay: 100, sustain: 0.8, release: 100 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Supersaw Lead',
    synthType: 'DuoSynth',
    oscillator: { type: 'sawtooth', detune: 20, octave: 0 },
    envelope: { attack: 20, decay: 400, sustain: 0, release: 300 },
    filter: { type: 'lowpass', frequency: 3000, Q: 2, rolloff: -24 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Acid Lead',
    synthType: 'MonoSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 10, decay: 350, sustain: 0, release: 200 },
    filter: { type: 'lowpass', frequency: 2000, Q: 5, rolloff: -24 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'FM Stab',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 4000, Q: 3, rolloff: -24 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Sync Lead',
    synthType: 'Synth',
    oscillator: { type: 'sawtooth', detune: 5, octave: 0 },
    envelope: { attack: 10, decay: 450, sustain: 0, release: 300 },
    filter: { type: 'lowpass', frequency: 2500, Q: 3, rolloff: -24 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Chip Lead',
    synthType: 'Synth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 250, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 3000, Q: 1, rolloff: -12 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Trance Pluck',
    synthType: 'PluckSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 300 },
    filter: { type: 'lowpass', frequency: 4000, Q: 2, rolloff: -24 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Detuned Lead',
    synthType: 'DuoSynth',
    oscillator: { type: 'sawtooth', detune: 25, octave: 0 },
    envelope: { attack: 30, decay: 450, sustain: 0, release: 400 },
    filter: { type: 'lowpass', frequency: 2800, Q: 2, rolloff: -24 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Filtered Lead',
    synthType: 'MonoSynth',
    oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
    envelope: { attack: 20, decay: 400, sustain: 0, release: 300 },
    filter: { type: 'bandpass', frequency: 2000, Q: 10, rolloff: -24 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'AM Tremolo Lead',
    synthType: 'AMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 10, decay: 300, sustain: 0.5, release: 200 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'FM Bell Lead',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 1 },
    envelope: { attack: 1, decay: 1000, sustain: 0, release: 800 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Harp Pluck',
    synthType: 'PluckSynth',
    oscillator: { type: 'sine', detune: 0, octave: 1 },
    envelope: { attack: 1, decay: 800, sustain: 0, release: 500 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Nylon Guitar',
    synthType: 'PluckSynth',
    oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 1200, sustain: 0, release: 1000 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'PWM Solo Lead',
    synthType: 'PWMSynth',
    pwmSynth: {
      pulseWidth: 20,
      pwmDepth: 40,
      pwmRate: 1.5,
      pwmWaveform: 'sine',
      oscillators: 2,
      detune: 5,
      envelope: { attack: 10, decay: 300, sustain: 0.6, release: 200 },
      filter: { type: 'lowpass', cutoff: 3000, resonance: 30, envelopeAmount: 20, keyTracking: 50 },
      filterEnvelope: { attack: 5, decay: 400, sustain: 0.2, release: 100 },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Poly Brass',
    synthType: 'PolySynth',
    polySynth: {
      voiceCount: 6,
      voiceType: 'Synth',
      stealMode: 'oldest',
      oscillator: { type: 'sawtooth', detune: 5, octave: 0 },
      envelope: { attack: 50, decay: 400, sustain: 0.7, release: 200 },
      filter: { type: 'lowpass', frequency: 2000, Q: 1, rolloff: -12 },
      portamento: 0,
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'SuperSaw Lead',
    synthType: 'SuperSaw',
    superSaw: {
      voices: 7,
      detune: 40,
      mix: 70,
      stereoSpread: 80,
      envelope: { attack: 10, decay: 300, sustain: 50, release: 200 },
      filter: { type: 'lowpass', cutoff: 5000, resonance: 20, envelopeAmount: 50 },
      filterEnvelope: { attack: 5, decay: 400, sustain: 0, release: 100 },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Robot Talk',
    synthType: 'FormantSynth',
    formantSynth: {
      vowel: 'E',
      vowelMorph: { target: 'U', amount: 80, rate: 2, mode: 'manual' },
      oscillator: { type: 'square' },
      formants: { ...VOWEL_FORMANTS.E, bandwidth: 120 },
      envelope: { attack: 5, decay: 200, sustain: 0.5, release: 100 },
      brightness: 80,
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
];

// ============================================================================
// PAD PRESETS (4)
// ============================================================================

export const PAD_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'Ambient Pad',
    synthType: 'Synth',
    oscillator: { type: 'sine', detune: 3, octave: 0 },
    envelope: { attack: 800, decay: 2000, sustain: 0, release: 1500 },
    filter: { type: 'lowpass', frequency: 1500, Q: 1, rolloff: -12 },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Dark Pad',
    synthType: 'DuoSynth',
    oscillator: { type: 'triangle', detune: 8, octave: 0 },
    envelope: { attack: 1000, decay: 2500, sustain: 0, release: 2000 },
    filter: { type: 'lowpass', frequency: 800, Q: 2, rolloff: -24 },
    effects: [],
    volume: -16,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'String Pad',
    synthType: 'Synth',
    oscillator: { type: 'sawtooth', detune: 5, octave: 0 },
    envelope: { attack: 500, decay: 1800, sustain: 0, release: 1200 },
    filter: { type: 'lowpass', frequency: 2000, Q: 1.5, rolloff: -12 },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Noise Sweep',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 300, decay: 1500, sustain: 0, release: 1000 },
    filter: { type: 'bandpass', frequency: 1000, Q: 5, rolloff: -24 },
    effects: [],
    volume: -18,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'AM Atmospheric',
    synthType: 'AMSynth',
    oscillator: { type: 'sine', detune: 5, octave: 0 },
    envelope: { attack: 1500, decay: 3000, sustain: 0.8, release: 2000 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Wavetable Evolving Pad',
    synthType: 'Wavetable',
    wavetable: {
      wavetableId: 'evolve-1',
      morphPosition: 0,
      morphModSource: 'lfo',
      morphModAmount: 80,
      morphLFORate: 0.1,
      unison: { voices: 4, detune: 12, stereoSpread: 60 },
      envelope: { attack: 1000, decay: 2000, sustain: 0.7, release: 1500 },
      filter: { type: 'lowpass', cutoff: 1500, resonance: 20, envelopeAmount: 30 },
      filterEnvelope: { attack: 2000, decay: 1000, sustain: 0.5, release: 1000 },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Poly Soft Strings',
    synthType: 'PolySynth',
    polySynth: {
      voiceCount: 8,
      voiceType: 'Synth',
      stealMode: 'oldest',
      oscillator: { type: 'sawtooth', detune: 10, octave: 0 },
      envelope: { attack: 500, decay: 1000, sustain: 0.8, release: 1200 },
      filter: { type: 'lowpass', frequency: 2000, Q: 1, rolloff: -12 },
      portamento: 0,
    },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'PWM Strings',
    synthType: 'PWMSynth',
    pwmSynth: {
      pulseWidth: 50,
      pwmDepth: 30,
      pwmRate: 0.5,
      pwmWaveform: 'sine',
      oscillators: 3,
      detune: 12,
      envelope: { attack: 800, decay: 1500, sustain: 0.9, release: 1500 },
      filter: { type: 'lowpass', cutoff: 1200, resonance: 15, envelopeAmount: 0, keyTracking: 30 },
      filterEnvelope: { attack: 10, decay: 500, sustain: 1, release: 100 },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Solina Ensemble',
    synthType: 'StringMachine',
    stringMachine: {
      sections: { violin: 100, viola: 80, cello: 60, bass: 40 },
      ensemble: { depth: 70, rate: 2.5, voices: 4 },
      attack: 300,
      release: 1500,
      brightness: 50,
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Ethereal Choir',
    synthType: 'FormantSynth',
    formantSynth: {
      vowel: 'A',
      vowelMorph: { target: 'O', amount: 50, rate: 0.2, mode: 'lfo' },
      oscillator: { type: 'sawtooth' },
      formants: { ...VOWEL_FORMANTS.A, bandwidth: 80 },
      envelope: { attack: 1000, decay: 2000, sustain: 0.8, release: 2000 },
      brightness: 60,
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'VFX Digital Pad',
    synthType: 'MAMEVFX',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Wavetable Morph Pad',
    synthType: 'Wavetable',
    wavetable: {
      wavetableId: 'morph-2',
      morphPosition: 50,
      morphModSource: 'lfo',
      morphModAmount: 40,
      morphLFORate: 0.2,
      unison: { voices: 6, detune: 20, stereoSpread: 90 },
      envelope: { attack: 1200, decay: 2500, sustain: 0.8, release: 2000 },
      filter: { type: 'lowpass', cutoff: 2000, resonance: 10, envelopeAmount: 0 },
      filterEnvelope: { attack: 10, decay: 500, sustain: 1, release: 100 },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'PWM Soft Pad',
    synthType: 'PWMSynth',
    pwmSynth: {
      pulseWidth: 50,
      pwmDepth: 20,
      pwmRate: 0.3,
      pwmWaveform: 'sine',
      oscillators: 2,
      detune: 8,
      envelope: { attack: 1500, decay: 2000, sustain: 0.9, release: 2000 },
      filter: { type: 'lowpass', cutoff: 800, resonance: 5, envelopeAmount: 0, keyTracking: 20 },
      filterEnvelope: { attack: 10, decay: 500, sustain: 1, release: 100 },
    },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Granular Cloud',
    synthType: 'GranularSynth',
    granular: {
      sampleUrl: '', // To be loaded by user
      grainSize: 0.1,
      grainOverlap: 0.05,
      detune: 5,
      playbackRate: 1,
      randomPitch: 0,
      randomPosition: 0,
      scanPosition: 0,
      scanSpeed: 0,
      density: 1,
      reverse: false,
      envelope: { attack: 10, release: 100 },
      filter: { type: 'lowpass', cutoff: 2000, resonance: 1 },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
];

// ============================================================================
// DRUM PRESETS (8)
// ============================================================================

export const DRUM_PRESETS: InstrumentPreset['config'][] = [
  V2_PRESET_KICK,
  V2_PRESET_SNARE,
  V2_PRESET_HAT,
  // Membrane Synth Kicks
  {
    type: 'synth' as const,
    name: '808 Kick',
    synthType: 'MembraneSynth',
    oscillator: { type: 'sine', detune: 0, octave: -2 },
    envelope: { attack: 1, decay: 500, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 100, Q: 1, rolloff: -24 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Kick',
    synthType: 'MembraneSynth',
    oscillator: { type: 'sine', detune: 0, octave: -2 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 50 },
    filter: { type: 'lowpass', frequency: 80, Q: 2, rolloff: -24 },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Hardcore Kick',
    synthType: 'MembraneSynth',
    oscillator: { type: 'sine', detune: 0, octave: -2 },
    envelope: { attack: 1, decay: 150, sustain: 0, release: 20 },
    filter: { type: 'lowpass', frequency: 120, Q: 3, rolloff: -24 },
    effects: [],
    volume: -4,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DnB Snare',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 1, decay: 200, sustain: 0, release: 100 },
    filter: { type: 'highpass', frequency: 300, Q: 1, rolloff: -12 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Clap',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 1, decay: 150, sustain: 0, release: 50 },
    filter: { type: 'bandpass', frequency: 1000, Q: 2, rolloff: -24 },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Closed Hat',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 50, sustain: 0, release: 20 },
    filter: { type: 'highpass', frequency: 8000, Q: 1, rolloff: -12 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Open Hat',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 200 },
    filter: { type: 'highpass', frequency: 7000, Q: 1, rolloff: -12 },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Crash',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 10, decay: 1500, sustain: 0, release: 1000 },
    filter: { type: 'highpass', frequency: 6000, Q: 1, rolloff: -12 },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Synth Low Tom',
    synthType: 'MembraneSynth',
    oscillator: { type: 'sine', detune: 0, octave: -1 },
    envelope: { attack: 1, decay: 400, sustain: 0, release: 100 },
    effects: [],
    volume: -8,
    pan: -20,
  },
  {
    type: 'synth' as const,
    name: 'Synth Mid Tom',
    synthType: 'MembraneSynth',
    oscillator: { type: 'sine', detune: 0, octave: -1 },
    envelope: { attack: 1, decay: 350, sustain: 0, release: 80 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Synth Hi Tom',
    synthType: 'MembraneSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 60 },
    effects: [],
    volume: -8,
    pan: 20,
  },
  
  // === SYNARE PRESETS ===
  ...SYNARE_PRESETS,
];

// ============================================================================
// CHIPTUNE PRESETS (12) - 8-bit style with arpeggio patterns
// ============================================================================

export const CHIP_PRESETS: InstrumentPreset['config'][] = [
  // Classic chiptune leads with arpeggios
  {
    type: 'synth' as const,
    name: 'NES Major Lead',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 250, sustain: 0, release: 150 },
      vibrato: { speed: 5, depth: 15, delay: 200 },
      arpeggio: { enabled: true, speed: 15, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }, { noteOffset: 12 }], mode: 'loop' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'C64 Minor Arp',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 25 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 300, sustain: 0, release: 200 },
      vibrato: { speed: 4, depth: 10, delay: 300 },
      arpeggio: { enabled: true, speed: 12, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 3 }, { noteOffset: 7 }, { noteOffset: 12 }], mode: 'loop' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'SID Dim7 Pad',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 50, decay: 600, sustain: 0, release: 500 },
      vibrato: { speed: 3, depth: 8, delay: 100 },
      arpeggio: { enabled: true, speed: 8, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 3 }, { noteOffset: 6 }, { noteOffset: 9 }], mode: 'loop' },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Gameboy Sus4',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse2',
      pulse: { duty: 12.5 },
      bitDepth: 4,
      sampleRate: 16384,
      envelope: { attack: 1, decay: 200, sustain: 0, release: 100 },
      vibrato: { speed: 6, depth: 20, delay: 150 },
      arpeggio: { enabled: true, speed: 18, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 5 }, { noteOffset: 7 }], mode: 'loop' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Atari Dom7',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 4,
      sampleRate: 15720,
      envelope: { attack: 1, decay: 300, sustain: 0, release: 200 },
      vibrato: { speed: 0, depth: 0, delay: 0 },
      arpeggio: { enabled: true, speed: 20, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }, { noteOffset: 10 }], mode: 'loop' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Amiga Power Oct',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'triangle',
      bitDepth: 8,
      sampleRate: 28867,
      envelope: { attack: 5, decay: 300, sustain: 0, release: 250 },
      vibrato: { speed: 4, depth: 12, delay: 200 },
      arpeggio: { enabled: true, speed: 14, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 7 }, { noteOffset: 12 }], mode: 'loop' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Fast Maj9 Stab',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 25 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 150, sustain: 0, release: 80 },
      vibrato: { speed: 0, depth: 0, delay: 0 },
      arpeggio: { enabled: true, speed: 30, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }, { noteOffset: 11 }, { noteOffset: 14 }], mode: 'loop' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Slow Min7 Sweep',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 100, decay: 800, sustain: 0, release: 600 },
      vibrato: { speed: 3, depth: 15, delay: 500 },
      arpeggio: { enabled: true, speed: 4, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 3 }, { noteOffset: 7 }, { noteOffset: 10 }], mode: 'loop' },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  // Non-arpeggio chip sounds
  {
    type: 'synth' as const,
    name: 'Chip Square Lead',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 5, decay: 300, sustain: 0, release: 200 },
      vibrato: { speed: 6, depth: 15, delay: 200 },
      arpeggio: { enabled: false, speed: 15, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 4 }, { noteOffset: 7 }], mode: 'loop' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Triangle Bass',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'triangle',
      bitDepth: 4,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 400, sustain: 0, release: 150 },
      vibrato: { speed: 0, depth: 0, delay: 0 },
      arpeggio: { enabled: false, speed: 15, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 12 }], mode: 'loop' },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Noise Snare',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'noise',
      bitDepth: 1,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 100, sustain: 0, release: 50 },
      vibrato: { speed: 0, depth: 0, delay: 0 },
      arpeggio: { enabled: false, speed: 15, speedUnit: 'hz', steps: [{ noteOffset: 0 }], mode: 'loop' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Octave Jump',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse2',
      pulse: { duty: 25 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 250, sustain: 0, release: 150 },
      vibrato: { speed: 5, depth: 10, delay: 250 },
      arpeggio: { enabled: true, speed: 10, speedUnit: 'hz', steps: [{ noteOffset: 0 }, { noteOffset: 12 }, { noteOffset: 24 }], mode: 'loop' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
];

// ============================================================================
// TR-909 PRESETS (11) - Authentic Roland TR-909 drum machine sounds
// Based on er-99 web emulator analysis with accurate synthesis parameters
// ============================================================================

export const TR909_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: '909 Kick',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'kick',
      kick: {
        pitch: 80,              // 909: 80Hz base frequency
        pitchDecay: 50,         // Legacy parameter
        tone: 50,               // Click/noise amount
        toneDecay: 20,          // 909: 20ms noise decay
        decay: 300,             // 909: 300ms body decay
        drive: 50,              // 909: moderate saturation
        envAmount: 2.5,         // 909: 2.5x pitch envelope multiplier
        envDuration: 50,        // 909: 50ms pitch envelope
        filterFreq: 3000,       // 909: 3000Hz lowpass
      },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Snare',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'snare',
      snare: {
        pitch: 220,             // 909: 220Hz body frequency
        tone: 25,               // 909: 25% body/snap balance
        toneDecay: 250,         // 909: 250ms noise decay
        snappy: 70,             // Noise amount
        decay: 100,             // 909: 100ms body decay
        envAmount: 4.0,         // 909: 4.0x aggressive pitch envelope
        envDuration: 10,        // 909: 10ms very fast pitch drop
        filterType: 'notch',    // 909: notch filter characteristic
        filterFreq: 1000,       // 909: 1000Hz notch
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Clap',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'clap',
      clap: {
        tone: 55,               // ~2200Hz bandpass
        decay: 80,              // 909: 80ms overall decay
        toneDecay: 250,         // 909: 250ms individual burst decay
        spread: 10,             // 909: 10ms burst spacing (creates the clap texture)
        filterFreqs: [900, 1200], // 909: serial bandpass filters
        modulatorFreq: 40,      // 909: 40Hz sawtooth modulator
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Rim',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'rimshot',
      rimshot: {
        decay: 30,              // 909: 30ms (very short, punchy)
        filterFreqs: [220, 500, 950], // 909: parallel resonant bandpass
        filterQ: 10.5,          // 909: very high Q for metallic resonance
        saturation: 3.0,        // 909: heavy saturation for punch
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Low Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      tom: {
        pitch: 100,             // 909: 100Hz (with +100Hz offset)
        decay: 200,             // 909: 200ms
        tone: 5,                // 909: 5% noise
        toneDecay: 100,         // 909: 100ms noise decay
        envAmount: 2.0,         // 909: 2.0x pitch envelope
        envDuration: 100,       // 909: 100ms pitch envelope
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Mid Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      tom: {
        pitch: 200,             // 909: 200Hz (with -50Hz offset)
        decay: 200,             // 909: 200ms
        tone: 5,                // 909: 5% noise
        toneDecay: 100,         // 909: 100ms noise decay
        envAmount: 2.0,         // 909: 2.0x pitch envelope
        envDuration: 100,       // 909: 100ms pitch envelope
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Hi Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      tom: {
        pitch: 300,             // 909: 300Hz (with -80Hz offset)
        decay: 200,             // 909: 200ms
        tone: 5,                // 909: 5% noise
        toneDecay: 100,         // 909: 100ms noise decay
        envAmount: 2.0,         // 909: 2.0x pitch envelope
        envDuration: 100,       // 909: 100ms pitch envelope
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Closed Hat',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'hihat',
      hihat: {
        tone: 60,
        decay: 50,              // Short decay for closed
        metallic: 65,
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Open Hat',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'hihat',
      hihat: {
        tone: 55,
        decay: 350,             // Longer decay for open
        metallic: 60,
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Ride',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 800, sustain: 0.1, release: 500 },
    filter: { type: 'highpass', frequency: 5000, Q: 1, rolloff: -12 },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '909 Crash',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 5, decay: 2000, sustain: 0.05, release: 1500 },
    filter: { type: 'highpass', frequency: 4000, Q: 1, rolloff: -12 },
    effects: [],
    volume: -14,
    pan: 0,
  },
];

// ============================================================================
// TR-808 PRESETS (16) - Classic Roland TR-808 drum machine sounds
// Based on io-808 web emulator - 100% synthesized (no samples)
// Key characteristics:
// - Kick: 48Hz sine with pitch sweep (98Hz->48Hz), soft clipping
// - Snare: Dual oscillators (238Hz + 476Hz) + highpass filtered noise
// - Clap: Bandpass filtered noise with sawtooth envelope for reverb effect
// - Hi-Hat: 6 square oscillators at inharmonic freqs through bandpass
// - Toms/Congas: Pure sine with optional pink noise
// - Cowbell: Dual squares (540Hz + 800Hz) through 2640Hz bandpass
// - Clave: Triangle + sine through bandpass with distortion
// - Rimshot: Similar to clave with different filter topology
// - Maracas: Highpass filtered white noise
// - Cymbal: 6-oscillator bank with 3-band filtering
// ============================================================================

export const TR808_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: '808 Kick',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'kick',
      machineType: '808',
      kick: {
        pitch: 48,              // 808: 48Hz base frequency
        pitchDecay: 110,        // 808: 110ms attack phase
        tone: 50,               // Filter cutoff control (200-300Hz)
        toneDecay: 20,          // Click decay
        decay: 200,             // 808: 50-300ms (user controlled)
        drive: 60,              // 808: soft clipping at 0.6 drive
        envAmount: 2.0,         // 808: pitch sweeps from ~98Hz to 48Hz
        envDuration: 110,       // 808: 110ms attack for pitch envelope
        filterFreq: 250,        // 808: ~200-300Hz lowpass (tone controlled)
      },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Snare',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'snare',
      machineType: '808',
      snare: {
        pitch: 238,             // 808: 238Hz low oscillator
        pitchHigh: 476,         // 808: 476Hz high oscillator (harmonic)
        tone: 50,               // Snappy parameter controls noise/body mix
        toneDecay: 75,          // 808: 75ms noise decay
        snappy: 50,             // Noise amount (controlled by snappy knob)
        decay: 100,             // 808: ~100ms amplitude decay
        envAmount: 1.0,         // 808: no pitch envelope (flat)
        envDuration: 100,       // 808: 100ms
        filterType: 'highpass', // 808: highpass on noise
        filterFreq: 1300,       // 808: 800-1800Hz highpass (tone controlled)
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Clap',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'clap',
      machineType: '808',
      clap: {
        tone: 50,               // 808: 1000Hz bandpass
        decay: 115,             // 808: 115ms reverb tail decay
        toneDecay: 200,         // 808: sawtooth envelope repeating
        spread: 100,            // 808: 100ms sawtooth spacing (creates reverb)
        filterFreqs: [1000, 1000], // 808: single 1000Hz bandpass
        modulatorFreq: 10,      // Slower modulation than 909
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Rimshot',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'rimshot',
      machineType: '808',
      rimshot: {
        decay: 40,              // 808: 40ms
        filterFreqs: [480, 1750, 2450], // 808: different from 909
        filterQ: 5,             // 808: lower Q than 909
        saturation: 2.5,        // 808: swing VCA distortion
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Clave',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'clave',
      machineType: '808',
      clave: {
        decay: 40,              // 808: 40ms
        pitch: 2450,            // 808: 2450Hz triangle
        pitchSecondary: 1750,   // 808: 1750Hz sine
        filterFreq: 2450,       // 808: 2450Hz bandpass
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Cowbell',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'cowbell',
      machineType: '808',
      cowbell: {
        decay: 400,             // 808: 15ms short + 400ms exponential tail
        filterFreq: 2640,       // 808: 2640Hz bandpass
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Maracas',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'maracas',
      machineType: '808',
      maracas: {
        decay: 30,              // 808: 30ms quick shake
        filterFreq: 5000,       // 808: 5000Hz highpass
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Low Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      machineType: '808',
      tom: {
        pitch: 90,              // 808: 80-100Hz range
        decay: 200,             // 808: 180-200ms
        tone: 20,               // 808: pink noise at 0.2 amplitude
        toneDecay: 155,         // 808: 100-155ms noise decay
        envAmount: 1.0,         // 808: minimal pitch sweep
        envDuration: 100,       // 808: 100ms
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Mid Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      machineType: '808',
      tom: {
        pitch: 140,             // 808: 120-160Hz range
        decay: 190,             // 808: slightly shorter
        tone: 20,               // 808: pink noise
        toneDecay: 130,         // 808: noise decay
        envAmount: 1.0,         // 808: minimal pitch sweep
        envDuration: 100,       // 808: 100ms
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Hi Tom',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'tom',
      machineType: '808',
      tom: {
        pitch: 190,             // 808: 165-220Hz range
        decay: 180,             // 808: 180ms
        tone: 20,               // 808: pink noise
        toneDecay: 100,         // 808: noise decay
        envAmount: 1.0,         // 808: minimal pitch sweep
        envDuration: 100,       // 808: 100ms
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Low Conga',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'conga',
      machineType: '808',
      conga: {
        pitch: 190,             // 808: 165-220Hz range
        decay: 180,             // 808: 180ms
        tuning: 50,             // Mid-range tuning
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Mid Conga',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'conga',
      machineType: '808',
      conga: {
        pitch: 280,             // 808: 250-310Hz range
        decay: 180,             // 808: 180ms
        tuning: 50,             // Mid-range tuning
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Hi Conga',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'conga',
      machineType: '808',
      conga: {
        pitch: 410,             // 808: 370-455Hz range
        decay: 180,             // 808: 180ms
        tuning: 50,             // Mid-range tuning
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Closed Hat',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'hihat',
      machineType: '808',
      hihat: {
        tone: 50,               // Dark/bright balance
        decay: 50,              // 808: 50ms (closed - muted)
        metallic: 50,           // 6-oscillator metallic character
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Open Hat',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'hihat',
      machineType: '808',
      hihat: {
        tone: 50,               // Dark/bright balance
        decay: 270,             // 808: 90-450ms (decay × 3.6 + 90)
        metallic: 50,           // 6-oscillator metallic character
      },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '808 Cymbal',
    synthType: 'DrumMachine',
    drumMachine: {
      drumType: 'cymbal',
      machineType: '808',
      cymbal: {
        tone: 50,               // Low/high band balance
        decay: 3000,            // 808: 700-6800ms variable
      },
    },
    effects: [],
    volume: -14,
    pan: 0,
  },
];

// ============================================================================
// FX PRESETS (4)
// ============================================================================

export const FX_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'Riser',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 2000, decay: 100, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 200, Q: 5, rolloff: -24 },
    effects: [],
    volume: -16,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Downlifter',
    synthType: 'MonoSynth',
    oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
    envelope: { attack: 10, decay: 2000, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 5000, Q: 3, rolloff: -24 },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Impact',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 1, decay: 500, sustain: 0, release: 200 },
    filter: { type: 'lowpass', frequency: 300, Q: 2, rolloff: -24 },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Laser Zap',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 100 },
    filter: { type: 'bandpass', frequency: 2000, Q: 10, rolloff: -24 },
    effects: [],
    volume: -12,
    pan: 0,
  },
];

export const WAM_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'Web Audio Module (WAM)',
    synthType: 'WAM',
    wam: { moduleUrl: '', pluginState: null },
    effects: [],
    volume: -12,
    pan: 0,
  }
];

// ============================================================================
// TR-505 PRESETS (16) - Roland TR-505 sample-based drum machine
// Classic 12-bit digital drum sounds from 1986
// ============================================================================

export const TR505_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: '505 Kick',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-kick.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '505 Snare',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-snare.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '505 Clap',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-clap.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '505 Closed Hat',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-hihat-closed.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '505 Open Hat',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-hihat-open.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '505 Rim',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-rim.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '505 Low Tom',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-tom-l.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: -30,
  },
  {
    type: 'synth' as const,
    name: '505 Mid Tom',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-tom-m.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '505 High Tom',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-tom-h.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 30,
  },
  {
    type: 'synth' as const,
    name: '505 Crash',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-crash.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -10,
    pan: -20,
  },
  {
    type: 'synth' as const,
    name: '505 Ride',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-ride.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -10,
    pan: 20,
  },
  {
    type: 'synth' as const,
    name: '505 Low Cowbell',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-cowb-l.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '505 High Cowbell',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-cowb-h.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '505 Low Conga',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-conga-l.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: -20,
  },
  {
    type: 'synth' as const,
    name: '505 High Conga',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-conga-h.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 20,
  },
  {
    type: 'synth' as const,
    name: '505 Timbale',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr505/tr505-timbal.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
];

// ============================================================================
// TR-707 PRESETS (15) - Roland TR-707 sample-based drum machine
// Classic digital drum sounds from 1985 with rumble variants
// ============================================================================

export const TR707_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: '707 Kick',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-kick.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '707 Kick Rumble',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-kick-rumble.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '707 Snare',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-snare.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '707 Clap',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-clap.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '707 Closed Hat',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-hihat-closed.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '707 Open Hat',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-hihat-open.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '707 Rim',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-rim.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '707 Low Tom',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-tom-l.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: -30,
  },
  {
    type: 'synth' as const,
    name: '707 Low Tom Rumble',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-tom-l-rumble.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: -30,
  },
  {
    type: 'synth' as const,
    name: '707 Mid Tom',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-tom-m.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '707 High Tom',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-tom-h.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 30,
  },
  {
    type: 'synth' as const,
    name: '707 Cowbell',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-cowbell.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '707 Crash',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-crash.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -10,
    pan: -20,
  },
  {
    type: 'synth' as const,
    name: '707 Ride',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-ride.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -10,
    pan: 20,
  },
  {
    type: 'synth' as const,
    name: '707 Tambourine',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/tr707/tr707-tambourine.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
];

// ============================================================================
// DRUMNIBUS SAMPLE PACK - Featured Samples (by Legowelt)
// Full pack available in Sample Packs browser (229 samples)
// ============================================================================

export const DRUMNIBUS_PRESETS: InstrumentPreset['config'][] = [
  // Kicks
  {
    type: 'synth' as const,
    name: 'DN 808 A1200',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/kicks/BD_808A1200.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Electro Kick',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/kicks/BD_Electro1shorter.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN SubThud',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/kicks/BD_SubThud.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Punchtron Kick',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/kicks/BD_Punchtron.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  // Snares
  {
    type: 'synth' as const,
    name: 'DN 808 Snare',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/snares/SD_808A1200.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Analog Noise',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/snares/SD_Analog_Noise1.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Electro 7000',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/snares/SD_electro7000.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Wolf Snare',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/snares/SD_Wolf1.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  // Hi-Hats
  {
    type: 'synth' as const,
    name: 'DN Closed Hat',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/hihats/CH_Digidap.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Open Hat',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/hihats/OH_Digidap.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Analog Hat',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/hihats/OH_AnalogHihat1.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Cymbal',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/hihats/CYM_Synthique.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  // Percussion
  {
    type: 'synth' as const,
    name: 'DN Clap',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/percussion/CLAP_Punchtron.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Clave',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/percussion/CLAVE_Simple.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Tom',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/percussion/TOM_Magnotron.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Lazer',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/percussion/LAZ_R900.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  // FX
  {
    type: 'synth' as const,
    name: 'DN Sonar',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/fx/FX_Sonar.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Laser',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/fx/FX_NomiLaser1.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DN Burst',
    synthType: 'Sampler',
    sample: {
      url: 'data/samples/packs/drumnibus/fx/FX_Burst1.wav',
      baseNote: 'C4',
      detune: 0,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      reverse: false,
      playbackRate: 1,
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
];

// ============================================================================
// MAME CLASSIC PRESETS (8) - Hardware-accurate classic synths
// ============================================================================

export const MAME_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'VFX Digital Pad',
    synthType: 'MAMEVFX',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'VFX Evolving',
    synthType: 'MAMEVFX',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'ESQ-1 Bass',
    synthType: 'MAMEDOC',
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'ESQ-1 Gritty Keys',
    synthType: 'MAMEDOC',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'MKS-20 E.Piano 1',
    synthType: 'MAMERSA',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'RD-1000 Grand',
    synthType: 'MAMERSA',
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'AWM2 Grand Piano',
    synthType: 'MAMESWP30',
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'AWM2 Synth Brass',
    synthType: 'MAMESWP30',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'CZ Brass 1',
    synthType: 'CZ101',
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'CZ Electric Piano',
    synthType: 'CZ101',
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'CZ Synth Bass',
    synthType: 'CZ101',
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'CZ Digital Pad',
    synthType: 'CZ101',
    effects: [],
    volume: -10,
    pan: 0,
  },
];

// ============================================================================
// ORGAN PRESETS (4) - Drawbar organ settings
// ============================================================================

export const ORGAN_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'Jazz Organ',
    synthType: 'Organ',
    organ: {
      drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: true, volume: 60, decay: 'fast', harmonic: 'third' },
      keyClick: 40,
      vibrato: { type: 'C3', depth: 60 },
      rotary: { enabled: true, speed: 'fast' },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Gospel Organ',
    synthType: 'Organ',
    organ: {
      drawbars: [8, 8, 8, 8, 8, 8, 8, 8, 8],
      percussion: { enabled: false, volume: 50, decay: 'slow', harmonic: 'second' },
      keyClick: 20,
      vibrato: { type: 'V3', depth: 40 },
      rotary: { enabled: true, speed: 'slow' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Church Organ',
    synthType: 'Organ',
    organ: {
      drawbars: [8, 0, 8, 0, 8, 0, 0, 8, 8],
      percussion: { enabled: false, volume: 0, decay: 'fast', harmonic: 'third' },
      keyClick: 0,
      vibrato: { type: 'V1', depth: 20 },
      rotary: { enabled: false, speed: 'slow' },
    },
    effects: [],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Rock Organ',
    synthType: 'Organ',
    organ: {
      drawbars: [8, 8, 8, 0, 0, 0, 0, 0, 0],
      percussion: { enabled: false, volume: 0, decay: 'fast', harmonic: 'third' },
      keyClick: 80,
      vibrato: { type: 'C3', depth: 80 },
      rotary: { enabled: true, speed: 'fast' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
];

// ============================================================================
// TRACKER MODULE PRESETS (1)
// ============================================================================

export const MODULE_PRESETS: InstrumentPreset['config'][] = [
  {
    type: 'synth' as const,
    name: 'Generic Module',
    synthType: 'ChiptuneModule',
    effects: [],
    volume: -6,
    pan: 0,
  },
];

// ============================================================================
// COMBINED FACTORY PRESETS
// ============================================================================

export const FACTORY_PRESETS: InstrumentPreset['config'][] = [
  ...BASS_PRESETS,
  ...LEAD_PRESETS,
  ...PAD_PRESETS,
  ...DRUM_PRESETS,
  ...MAME_PRESETS,
  ...MAME_CHIP_PRESETS,
  ...ORGAN_PRESETS,
  ...MODULE_PRESETS,
  ...TR808_PRESETS,
  ...TR909_PRESETS,
  ...TR707_PRESETS,
  ...TR505_PRESETS,
  ...CHIP_PRESETS,
  ...FURNACE_PRESETS,
  ...FURNACE_CHIP_PRESETS,
  ...FX_PRESETS,
  ...WAM_PRESETS,
  ...DUB_SIREN_PRESETS,
  ...SPACE_LASER_PRESETS,
  ...V2_PRESETS,
  ...V2_FACTORY_PRESETS,
  ...SAM_PRESETS,
  ...DRUMNIBUS_PRESETS,
  ...DRUMNIBUS_KIT_PRESETS,
  ...DEXED_FACTORY_PRESETS,
  ...OBXD_FACTORY_PRESETS,
  ...SAMPLE_PACK_PRESETS,
  ...WAVETABLE_PACK_PRESETS,
  ...BUZZMACHINE_FACTORY_PRESETS,
  ...MAKK_FACTORY_PRESETS,
  // Player Init
  {
    type: 'synth' as const,
    name: 'Sample Player',
    synthType: 'Player' as const,
    volume: -6,
    pan: 0,
    effects: [],
  },
];

// Preset categories for browsing
export const PRESET_CATEGORIES = {
  Bass: BASS_PRESETS,
  Leads: LEAD_PRESETS,
  Pads: PAD_PRESETS,
  Drums: DRUM_PRESETS,
  MAME: [...MAME_PRESETS, ...MAME_CHIP_PRESETS],
  Keys: ORGAN_PRESETS,
  Module: MODULE_PRESETS,
  'TR-808': TR808_PRESETS,
  'TR-909': TR909_PRESETS,
  'TR-707': TR707_PRESETS,
  'TR-505': TR505_PRESETS,
  Chip: CHIP_PRESETS,
  Furnace: [...FURNACE_PRESETS, ...FURNACE_CHIP_PRESETS],
  FX: FX_PRESETS,
  WAM: WAM_PRESETS,
  Dub: [...DUB_SIREN_PRESETS, ...SPACE_LASER_PRESETS, ...V2_PRESETS, ...V2_FACTORY_PRESETS, ...SYNARE_PRESETS],
  DubSiren: DUB_SIREN_PRESETS,
  SpaceLaser: SPACE_LASER_PRESETS,
  V2: [...V2_PRESETS, ...V2_FACTORY_PRESETS],
  Sam: SAM_PRESETS,
  Synare: SYNARE_PRESETS,
  Drumnibus: [...DRUMNIBUS_KIT_PRESETS, ...DRUMNIBUS_PRESETS],
  Dexed: DEXED_FACTORY_PRESETS,
  OBXd: OBXD_FACTORY_PRESETS,
  Samples: SAMPLE_PACK_PRESETS,
  Wavetables: WAVETABLE_PACK_PRESETS,
  Buzz: BUZZMACHINE_FACTORY_PRESETS,
  Makk: MAKK_FACTORY_PRESETS,
};

export type PresetCategory = keyof typeof PRESET_CATEGORIES;

/**
 * Get the first available factory preset for a given synth type.
 * Used to auto-initialize new instruments with musically useful settings
 * so they produce sound immediately (e.g. V2 needs patch data, MAME chips need _program).
 */
export function getFirstPresetForSynthType(synthType: string): InstrumentPreset['config'] | null {
  // Search category-specific collections first (preferred: sustaining/melodic presets)
  const categoryPresets = PRESET_CATEGORIES[synthType as keyof typeof PRESET_CATEGORIES];
  if (categoryPresets && categoryPresets.length > 0) {
    return categoryPresets[0];
  }

  // Fall back to main factory presets array
  const fromFactory = FACTORY_PRESETS.find(p => p.synthType === synthType);
  if (fromFactory) return fromFactory;

  // Check collections not included in FACTORY_PRESETS
  const fromTB303 = TB303_PRESETS.find(p => p.synthType === synthType);
  if (fromTB303) return fromTB303 as InstrumentPreset['config'];

  const fromSynare = SYNARE_PRESETS.find(p => p.synthType === synthType);
  if (fromSynare) return fromSynare as InstrumentPreset['config'];

  return null;
}
