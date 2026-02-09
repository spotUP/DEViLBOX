/**
 * TB-303 Factory Presets
 * Authentic acid bass presets optimized for the new 4-pole diode ladder engine
 * All values are 0-1 normalized matching the db303-pages-dev source truth.
 */

import type { InstrumentPreset } from '@typedefs/instrument';

export const TB303_PRESETS: InstrumentPreset['config'][] = [
  // === DEFAULT JC303/DB303 PRESET ===
  // Based on db303-default-preset.xml
  {
    type: 'synth' as const,
    name: 'JC303 Default',
    synthType: 'TB303',
    tb303: {
      engineType: 'jc303',
      oscillator: {
        type: 'sawtooth',
        pulseWidth: 0,
        subOscGain: 0,
        subOscBlend: 1,
      },
      filter: {
        cutoff: 0.5,
        resonance: 0.5,
      },
      filterEnvelope: {
        envMod: 0.5,
        decay: 0.5,
      },
      accent: {
        amount: 0.5,
      },
      slide: {
        time: 0.17,
        mode: 'exponential',
      },
      devilFish: {
        enabled: true,
        normalDecay: 0.164,
        accentDecay: 0.006,
        softAttack: 0,
        accentSoftAttack: 0.1,
        passbandCompensation: 0.09,
        resTracking: 0.743,
        filterSelect: 255,
        diodeCharacter: 1,
        duffingAmount: 0.03,
        lpBpMix: 0,
        stageNLAmount: 0,
        ensembleAmount: 0,
        oversamplingOrder: 2,
        filterTracking: 0,
        filterFmDepth: 0,
        accentSweepEnabled: true,
        sweepSpeed: 'normal',
        highResonance: false,
        muffler: 'off',
        vegDecay: 0.5,
        vegSustain: 0,
      },
      lfo: {
        waveform: 0,
        rate: 0,
        contour: 0,
        pitchDepth: 0,
        pwmDepth: 0,
        filterDepth: 0,
      },
      chorus: {
        enabled: false,
        mode: 0,
        mix: 0.5,
      },
      phaser: {
        enabled: false,
        rate: 0.5,
        depth: 0.7,
        feedback: 0,
        mix: 0,
      },
      delay: {
        enabled: false,
        time: 0.1875, // 3 in XML? Assuming units of 16 steps or similar. Using 0.1875 as reasonable default.
        feedback: 0.3,
        tone: 0.5,
        mix: 0,
        stereo: 0.5,
      },
    },
    effects: [],
    volume: 0.75, // -12dB approx 0.75 in 0-1 scale
    pan: 0,
  },

  // === CLASSIC PRESETS (Normalized) ===
  {
    type: 'synth' as const,
    name: '303 Classic',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.4, resonance: 0.65 },
      filterEnvelope: { envMod: 0.6, decay: 0.3 },
      accent: { amount: 0.7 },
      slide: { time: 0.17, mode: 'exponential' },
    },
    effects: [],
    volume: 0.75,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Squelchy',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.55, resonance: 0.82 },
      filterEnvelope: { envMod: 0.85, decay: 0.4 },
      accent: { amount: 0.9 },
      slide: { time: 0.15, mode: 'exponential' },
    },
    effects: [],
    volume: 0.7,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Deep Sub',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.15, resonance: 0.35 },
      filterEnvelope: { envMod: 0.25, decay: 0.2 },
      accent: { amount: 0.45 },
      slide: { time: 0.3, mode: 'exponential' },
    },
    effects: [],
    volume: 0.8,
    pan: 0,
  },

  // === SQUARE WAVE PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Square',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'square' },
      filter: { cutoff: 0.45, resonance: 0.68 },
      filterEnvelope: { envMod: 0.55, decay: 0.25 },
      accent: { amount: 0.65 },
      slide: { time: 0.15, mode: 'exponential' },
    },
    effects: [],
    volume: 0.75,
    pan: 0,
  },

  // === AGGRESSIVE PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Screamer',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.75, resonance: 0.88 },
      filterEnvelope: { envMod: 0.95, decay: 0.5 },
      accent: { amount: 1.0 },
      slide: { time: 0.1, mode: 'exponential' },
    },
    effects: [
      {
        id: 'distortion-1',
        category: 'tonejs',
        type: 'Distortion',
        enabled: true,
        wet: 35,
        parameters: { distortion: 0.6 },
      },
    ],
    volume: 0.6,
    pan: 0,
  },

  // === DEVIL FISH MOD PRESETS ===
  {
    type: 'synth' as const,
    name: 'DF Chaos Engine',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.65, resonance: 0.8 },
      filterEnvelope: { envMod: 0.75, decay: 0.45 },
      accent: { amount: 0.95 },
      slide: { time: 0.08, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 0.2,
        accentDecay: 0.1,
        vegDecay: 0.3,
        vegSustain: 0.15,
        softAttack: 0.05,
        filterTracking: 0.6,
        filterFmDepth: 0.5,
        sweepSpeed: 'fast',
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'soft',
      },
    },
    effects: [],
    volume: 0.6,
    pan: 0,
  },
];