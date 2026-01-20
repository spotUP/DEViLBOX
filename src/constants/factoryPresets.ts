/**
 * Factory Presets - 36+ ready-to-use instrument presets
 * Organized by category: Bass, Leads, Pads, Drums, FX
 */

import type { InstrumentConfig } from '@typedefs/instrument';
import { TB303_PRESETS } from './tb303Presets';

const PRESET_DEFAULTS = {
  effects: [],
  volume: -12,
  pan: 0,
};

// ============================================================================
// BASS PRESETS (12)
// ============================================================================

export const BASS_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  // TB-303 Acid Bass & Devil Fish Presets (imported from canonical source)
  ...TB303_PRESETS,

  // Non-303 Bass (4 presets)
  {
    name: '808 Sub',
    synthType: 'MonoSynth',
    oscillator: { type: 'sine', detune: 0, octave: -1 },
    envelope: { attack: 5, decay: 500, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 200, Q: 1, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -8,
  },
  {
    name: 'Reese Bass',
    synthType: 'DuoSynth',
    oscillator: { type: 'sawtooth', detune: 15, octave: 0 },
    envelope: { attack: 10, decay: 500, sustain: 0, release: 200 },
    filter: { type: 'lowpass', frequency: 800, Q: 3, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'House Pluck',
    synthType: 'PluckSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 500, sustain: 0, release: 500 },
    filter: { type: 'lowpass', frequency: 2000, Q: 1, rolloff: -12 },
    ...PRESET_DEFAULTS,
    volume: -8,
  },
  {
    name: 'Wobble Bass',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 5, decay: 400, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 1000, Q: 8, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
];

// ============================================================================
// LEAD PRESETS (8)
// ============================================================================

export const LEAD_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  {
    name: 'Supersaw Lead',
    synthType: 'DuoSynth',
    oscillator: { type: 'sawtooth', detune: 20, octave: 0 },
    envelope: { attack: 20, decay: 400, sustain: 0, release: 300 },
    filter: { type: 'lowpass', frequency: 3000, Q: 2, rolloff: -24 },
    ...PRESET_DEFAULTS,
  },
  {
    name: 'Acid Lead',
    synthType: 'MonoSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 10, decay: 350, sustain: 0, release: 200 },
    filter: { type: 'lowpass', frequency: 2000, Q: 5, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'FM Stab',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 4000, Q: 3, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'Sync Lead',
    synthType: 'Synth',
    oscillator: { type: 'sawtooth', detune: 5, octave: 0 },
    envelope: { attack: 10, decay: 450, sustain: 0, release: 300 },
    filter: { type: 'lowpass', frequency: 2500, Q: 3, rolloff: -24 },
    ...PRESET_DEFAULTS,
  },
  {
    name: 'Chip Lead',
    synthType: 'Synth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 250, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 3000, Q: 1, rolloff: -12 },
    ...PRESET_DEFAULTS,
    volume: -8,
  },
  {
    name: 'Trance Pluck',
    synthType: 'PluckSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 300 },
    filter: { type: 'lowpass', frequency: 4000, Q: 2, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'Detuned Lead',
    synthType: 'DuoSynth',
    oscillator: { type: 'sawtooth', detune: 25, octave: 0 },
    envelope: { attack: 30, decay: 450, sustain: 0, release: 400 },
    filter: { type: 'lowpass', frequency: 2800, Q: 2, rolloff: -24 },
    ...PRESET_DEFAULTS,
  },
  {
    name: 'Filtered Lead',
    synthType: 'MonoSynth',
    oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
    envelope: { attack: 20, decay: 400, sustain: 0, release: 300 },
    filter: { type: 'bandpass', frequency: 2000, Q: 10, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
];

// ============================================================================
// PAD PRESETS (4)
// ============================================================================

export const PAD_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  {
    name: 'Ambient Pad',
    synthType: 'Synth',
    oscillator: { type: 'sine', detune: 3, octave: 0 },
    envelope: { attack: 800, decay: 2000, sustain: 0, release: 1500 },
    filter: { type: 'lowpass', frequency: 1500, Q: 1, rolloff: -12 },
    ...PRESET_DEFAULTS,
    volume: -14,
  },
  {
    name: 'Dark Pad',
    synthType: 'DuoSynth',
    oscillator: { type: 'triangle', detune: 8, octave: 0 },
    envelope: { attack: 1000, decay: 2500, sustain: 0, release: 2000 },
    filter: { type: 'lowpass', frequency: 800, Q: 2, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -16,
  },
  {
    name: 'String Pad',
    synthType: 'Synth',
    oscillator: { type: 'sawtooth', detune: 5, octave: 0 },
    envelope: { attack: 500, decay: 1800, sustain: 0, release: 1200 },
    filter: { type: 'lowpass', frequency: 2000, Q: 1.5, rolloff: -12 },
    ...PRESET_DEFAULTS,
    volume: -14,
  },
  {
    name: 'Noise Sweep',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 300, decay: 1500, sustain: 0, release: 1000 },
    filter: { type: 'bandpass', frequency: 1000, Q: 5, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -18,
  },
];

// ============================================================================
// DRUM PRESETS (8)
// ============================================================================

export const DRUM_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  {
    name: '808 Kick',
    synthType: 'MembraneSynth',
    oscillator: { type: 'sine', detune: 0, octave: -2 },
    envelope: { attack: 1, decay: 500, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 100, Q: 1, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -6,
  },
  {
    name: '909 Kick',
    synthType: 'MembraneSynth',
    oscillator: { type: 'sine', detune: 0, octave: -2 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 50 },
    filter: { type: 'lowpass', frequency: 80, Q: 2, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -6,
  },
  {
    name: 'Hardcore Kick',
    synthType: 'MembraneSynth',
    oscillator: { type: 'sine', detune: 0, octave: -2 },
    envelope: { attack: 1, decay: 150, sustain: 0, release: 20 },
    filter: { type: 'lowpass', frequency: 120, Q: 3, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -4,
  },
  {
    name: 'DnB Snare',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 1, decay: 200, sustain: 0, release: 100 },
    filter: { type: 'highpass', frequency: 300, Q: 1, rolloff: -12 },
    ...PRESET_DEFAULTS,
    volume: -8,
  },
  {
    name: 'Clap',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 1, decay: 150, sustain: 0, release: 50 },
    filter: { type: 'bandpass', frequency: 1000, Q: 2, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'Closed Hat',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 50, sustain: 0, release: 20 },
    filter: { type: 'highpass', frequency: 8000, Q: 1, rolloff: -12 },
    ...PRESET_DEFAULTS,
  },
  {
    name: 'Open Hat',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 200 },
    filter: { type: 'highpass', frequency: 7000, Q: 1, rolloff: -12 },
    ...PRESET_DEFAULTS,
  },
  {
    name: 'Crash',
    synthType: 'MetalSynth',
    oscillator: { type: 'square', detune: 0, octave: 0 },
    envelope: { attack: 10, decay: 1500, sustain: 0, release: 1000 },
    filter: { type: 'highpass', frequency: 6000, Q: 1, rolloff: -12 },
    ...PRESET_DEFAULTS,
    volume: -14,
  },
];

// ============================================================================
// CHIPTUNE PRESETS (12) - 8-bit style with arpeggio patterns
// ============================================================================

export const CHIP_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  // Classic chiptune leads with arpeggios
  {
    name: 'NES Major Lead',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 250, sustain: 0, release: 150 },
      vibrato: { speed: 5, depth: 15, delay: 200 },
      arpeggio: { enabled: true, speed: 15, pattern: [0, 4, 7, 12] },
    },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'C64 Minor Arp',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 25 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 300, sustain: 0, release: 200 },
      vibrato: { speed: 4, depth: 10, delay: 300 },
      arpeggio: { enabled: true, speed: 12, pattern: [0, 3, 7, 12] },
    },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'SID Dim7 Pad',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 50, decay: 600, sustain: 0, release: 500 },
      vibrato: { speed: 3, depth: 8, delay: 100 },
      arpeggio: { enabled: true, speed: 8, pattern: [0, 3, 6, 9] },
    },
    ...PRESET_DEFAULTS,
  },
  {
    name: 'Gameboy Sus4',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse2',
      pulse: { duty: 12.5 },
      bitDepth: 4,
      sampleRate: 16384,
      envelope: { attack: 1, decay: 200, sustain: 0, release: 100 },
      vibrato: { speed: 6, depth: 20, delay: 150 },
      arpeggio: { enabled: true, speed: 18, pattern: [0, 5, 7] },
    },
    ...PRESET_DEFAULTS,
    volume: -8,
  },
  {
    name: 'Atari Dom7',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 4,
      sampleRate: 15720,
      envelope: { attack: 1, decay: 300, sustain: 0, release: 200 },
      vibrato: { speed: 0, depth: 0, delay: 0 },
      arpeggio: { enabled: true, speed: 20, pattern: [0, 4, 7, 10] },
    },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'Amiga Power Oct',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'triangle',
      bitDepth: 8,
      sampleRate: 28867,
      envelope: { attack: 5, decay: 300, sustain: 0, release: 250 },
      vibrato: { speed: 4, depth: 12, delay: 200 },
      arpeggio: { enabled: true, speed: 14, pattern: [0, 7, 12] },
    },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'Fast Maj9 Stab',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 25 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 150, sustain: 0, release: 80 },
      vibrato: { speed: 0, depth: 0, delay: 0 },
      arpeggio: { enabled: true, speed: 30, pattern: [0, 4, 7, 11, 14] },
    },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'Slow Min7 Sweep',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 100, decay: 800, sustain: 0, release: 600 },
      vibrato: { speed: 3, depth: 15, delay: 500 },
      arpeggio: { enabled: true, speed: 4, pattern: [0, 3, 7, 10] },
    },
    ...PRESET_DEFAULTS,
  },
  // Non-arpeggio chip sounds
  {
    name: 'Chip Square Lead',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse1',
      pulse: { duty: 50 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 5, decay: 300, sustain: 0, release: 200 },
      vibrato: { speed: 6, depth: 15, delay: 200 },
      arpeggio: { enabled: false, speed: 15, pattern: [0, 4, 7] },
    },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'Triangle Bass',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'triangle',
      bitDepth: 4,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 400, sustain: 0, release: 150 },
      vibrato: { speed: 0, depth: 0, delay: 0 },
      arpeggio: { enabled: false, speed: 15, pattern: [0, 12] },
    },
    ...PRESET_DEFAULTS,
    volume: -6,
  },
  {
    name: 'Noise Snare',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'noise',
      bitDepth: 1,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 100, sustain: 0, release: 50 },
      vibrato: { speed: 0, depth: 0, delay: 0 },
      arpeggio: { enabled: false, speed: 15, pattern: [0] },
    },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
  {
    name: 'Octave Jump',
    synthType: 'ChipSynth',
    chipSynth: {
      channel: 'pulse2',
      pulse: { duty: 25 },
      bitDepth: 8,
      sampleRate: 22050,
      envelope: { attack: 1, decay: 250, sustain: 0, release: 150 },
      vibrato: { speed: 5, depth: 10, delay: 250 },
      arpeggio: { enabled: true, speed: 10, pattern: [0, 12, 24] },
    },
    ...PRESET_DEFAULTS,
    volume: -10,
  },
];

// ============================================================================
// FX PRESETS (4)
// ============================================================================

export const FX_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  {
    name: 'Riser',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 2000, decay: 100, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 200, Q: 5, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -16,
  },
  {
    name: 'Downlifter',
    synthType: 'MonoSynth',
    oscillator: { type: 'sawtooth', detune: 0, octave: 0 },
    envelope: { attack: 10, decay: 2000, sustain: 0, release: 100 },
    filter: { type: 'lowpass', frequency: 5000, Q: 3, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -14,
  },
  {
    name: 'Impact',
    synthType: 'NoiseSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 }, // NoiseSynth doesn't use waveform type
    envelope: { attack: 1, decay: 500, sustain: 0, release: 200 },
    filter: { type: 'lowpass', frequency: 300, Q: 2, rolloff: -24 },
    ...PRESET_DEFAULTS,
    volume: -8,
  },
  {
    name: 'Laser Zap',
    synthType: 'FMSynth',
    oscillator: { type: 'sine', detune: 0, octave: 0 },
    envelope: { attack: 1, decay: 300, sustain: 0, release: 100 },
    filter: { type: 'bandpass', frequency: 2000, Q: 10, rolloff: -24 },
    ...PRESET_DEFAULTS,
  },
];

// ============================================================================
// COMBINED FACTORY PRESETS
// ============================================================================

export const FACTORY_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  ...BASS_PRESETS,
  ...LEAD_PRESETS,
  ...PAD_PRESETS,
  ...DRUM_PRESETS,
  ...CHIP_PRESETS,
  ...FX_PRESETS,
];

// Preset categories for browsing
export const PRESET_CATEGORIES = {
  Bass: BASS_PRESETS,
  Leads: LEAD_PRESETS,
  Pads: PAD_PRESETS,
  Drums: DRUM_PRESETS,
  Chip: CHIP_PRESETS,
  FX: FX_PRESETS,
};

export type PresetCategory = keyof typeof PRESET_CATEGORIES;
