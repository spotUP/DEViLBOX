import type { InstrumentPreset } from '../../types/instrument';
import { TB303_PRESETS } from '../tb303Presets';
import { DUB_SIREN_PRESETS } from '../dubSirenPresets';

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
