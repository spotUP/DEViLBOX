/**
 * TB-303 Factory Presets
 * All values are 0-1 normalized matching db303.pages.dev app defaults (ne object).
 *
 * IMPORTANT: All presets MUST include devilFish config with at minimum:
 *   enabled, oversamplingOrder, filterSelect, passbandCompensation, resTracking
 * Without these, the WASM engine's filter character is undefined.
 *
 * tb303.volume should be 1.0 (WASM internal volume, 0-1 normalized).
 * Top-level volume is in dB — use 0 for unity level.
 */

import type { InstrumentPreset } from '@typedefs/instrument';

/** Shared Devil Fish defaults matching db303-local/default-preset.xml
 *  (the reference app loads this XML on init via loadDefaults → fetch("presets/default-preset.xml"))
 */
const DF_DEFAULTS = {
  enabled: true,
  oversamplingOrder: 2 as const,  // 4x oversampling — MUST be set (type: 0|1|2|3|4)
  filterSelect: 0,                // 0=DiodeLadder (only valid: 0 or 5=Korg). Reference init uses 0.
  normalDecay: 0.164,             // default-preset.xml: 0.164
  accentDecay: 0.006,             // default-preset.xml: 0.006 — CRITICAL for acid screams
  softAttack: 0,                  // default-preset.xml: 0
  accentSoftAttack: 0.1,          // default-preset.xml: 0.1
  passbandCompensation: 0.09,     // default-preset.xml: 0.09. App inverts → WASM 0.91
  resTracking: 0.257,             // default-preset.xml: 0.743 (inverted on read: 1-0.743=0.257). App inverts → WASM 0.743
  filterInputDrive: 0.169,        // default-preset.xml: 0.169 (subtle warmth)
  diodeCharacter: 1,              // default-preset.xml: 1 (nonlinear character)
  duffingAmount: 0.03,            // default-preset.xml: 0.03 (subtle saturation)
  filterFmDepth: 0,
  lpBpMix: 0,
  filterTracking: 0,
  stageNLAmount: 0,
  ensembleAmount: 0,
  accentSweepEnabled: true,
  sweepSpeed: 'normal' as const,
  highResonance: false,
  muffler: 'off' as const,
  vegDecay: 0.5,
  vegSustain: 0,
};

export const TB303_PRESETS: InstrumentPreset['config'][] = [
  // === DEFAULT PRESET ===
  // Matches db303-local/default-preset.xml (reference loads XML on init)
  {
    type: 'synth' as const,
    name: 'DB303 Default',
    synthType: 'TB303',
    tb303: {
      engineType: 'db303',
      volume: 1.0,
      oscillator: { type: 'sawtooth', pulseWidth: 0, subOscGain: 0, subOscBlend: 1 },
      filter: { cutoff: 0.5, resonance: 0.5 },
      filterEnvelope: { envMod: 0.5, decay: 0.5 },
      accent: { amount: 0.5 },
      slide: { time: 0.17, mode: 'exponential' },
      devilFish: { ...DF_DEFAULTS, normalDecay: 0.5 },
      lfo: { waveform: 0, rate: 0, contour: 0, pitchDepth: 0, pwmDepth: 0, filterDepth: 0 },
      chorus: { enabled: false, mode: 0, mix: 0.5 },
      phaser: { enabled: false, rate: 0.5, depth: 0.7, feedback: 0, mix: 0 },
      delay: { enabled: false, time: 3, feedback: 0.3, tone: 0.5, mix: 0, stereo: 0.5 },
    },
    effects: [],
    volume: 0,
    pan: 0,
  },

  // === CLASSIC PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Classic',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.4, resonance: 0.65 },
      filterEnvelope: { envMod: 0.6, decay: 0.3 },
      accent: { amount: 0.7 },
      slide: { time: 0.17, mode: 'exponential' },
      devilFish: { ...DF_DEFAULTS, normalDecay: 0.3 },
    },
    effects: [],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Squelchy',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.55, resonance: 0.82 },
      filterEnvelope: { envMod: 0.85, decay: 0.4 },
      accent: { amount: 0.9 },
      slide: { time: 0.15, mode: 'exponential' },
      devilFish: {
        ...DF_DEFAULTS,
        filterInputDrive: 0.15,   // Slight drive into filter for grit
        normalDecay: 0.4,         // Match filterEnvelope.decay
      },
    },
    effects: [],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Deep Sub',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.15, resonance: 0.35 },
      filterEnvelope: { envMod: 0.25, decay: 0.2 },
      accent: { amount: 0.45 },
      slide: { time: 0.3, mode: 'exponential' },
      devilFish: { ...DF_DEFAULTS, normalDecay: 0.2 },
    },
    effects: [],
    volume: 0,
    pan: 0,
  },

  // === SQUARE WAVE PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Square',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'square' },
      filter: { cutoff: 0.45, resonance: 0.68 },
      filterEnvelope: { envMod: 0.55, decay: 0.25 },
      accent: { amount: 0.65 },
      slide: { time: 0.15, mode: 'exponential' },
      devilFish: { ...DF_DEFAULTS, normalDecay: 0.25 },
    },
    effects: [],
    volume: 0,
    pan: 0,
  },

  // === AGGRESSIVE PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Screamer',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.35, resonance: 0.92 },       // Low cutoff → envelope sweeps UP = scream
      filterEnvelope: { envMod: 0.95, decay: 0.4 },
      accent: { amount: 1.0 },
      slide: { time: 0.1, mode: 'exponential' },
      devilFish: {
        ...DF_DEFAULTS,
        filterInputDrive: 0.4,    // Drive into filter = saturation before resonance
        duffingAmount: 0.3,       // Nonlinear stiffness adds harmonics
        normalDecay: 0.4,         // Match filterEnvelope.decay
        accentDecay: 0.003,       // ULTRA fast accent decay = acid scream
      },
    },
    effects: [],
    volume: 0,
    pan: 0,
  },

  // === DEVIL FISH MOD PRESETS ===
  {
    type: 'synth' as const,
    name: 'DF Chaos Engine',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.5, resonance: 0.8 },
      filterEnvelope: { envMod: 0.75, decay: 0.45 },
      accent: { amount: 0.95 },
      slide: { time: 0.08, mode: 'exponential' },
      devilFish: {
        ...DF_DEFAULTS,
        normalDecay: 0.45,        // Match filterEnvelope.decay
        accentDecay: 0.015,       // Fast accent decay for chaotic sweeps
        softAttack: 0.05,
        filterTracking: 0.6,
        filterFmDepth: 0.5,       // Filter FM for chaotic modulation
        filterInputDrive: 0.35,   // Drive for saturation
        diodeCharacter: 0.4,      // Moderate diode character
        duffingAmount: 0.5,       // Strong nonlinearity
        sweepSpeed: 'fast' as const,
      },
    },
    effects: [],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Acid Burn',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.4, resonance: 0.88 },
      filterEnvelope: { envMod: 0.9, decay: 0.35 },
      accent: { amount: 0.95 },
      slide: { time: 0.12, mode: 'exponential' },
      devilFish: {
        ...DF_DEFAULTS,
        filterInputDrive: 0.5,    // Heavy drive
        duffingAmount: 0.2,
        normalDecay: 0.35,        // Match filterEnvelope.decay
        accentDecay: 0.005,       // Very fast accent decay for acid burn
      },
    },
    effects: [],
    volume: 0,
    pan: 0,
  },

  // === ACID EFFECT CHAIN PRESETS ===
  {
    type: 'synth' as const,
    name: 'Acid RAT',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.55, resonance: 0.75 },
      filterEnvelope: { envMod: 0.7, decay: 0.35 },
      accent: { amount: 0.85 },
      slide: { time: 0.12, mode: 'exponential' },
      devilFish: {
        ...DF_DEFAULTS,
        filterInputDrive: 0.2,
        normalDecay: 0.35,
      },
    },
    effects: [
      {
        id: 'acid-rat-neural',
        category: 'neural',
        type: 'Neural',
        enabled: true,
        wet: 60,
        parameters: { gain: 0.55 },
        neuralModelIndex: 1,
        neuralModelName: 'ProCo RAT',
      },
      {
        id: 'acid-rat-comp',
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -15, ratio: 4, attack: 0.005, release: 0.15 },
      },
    ],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Acid DS-1',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.5, resonance: 0.7 },
      filterEnvelope: { envMod: 0.65, decay: 0.3 },
      accent: { amount: 0.8 },
      slide: { time: 0.15, mode: 'exponential' },
      devilFish: {
        ...DF_DEFAULTS,
        filterInputDrive: 0.15,
        normalDecay: 0.3,
      },
    },
    effects: [
      {
        id: 'acid-ds1-dist',
        category: 'tonejs',
        type: 'Distortion',
        enabled: true,
        wet: 50,
        parameters: { distortion: 0.5, oversample: '2x' },
      },
      {
        id: 'acid-ds1-eq',
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 0, mid: 3, high: 1 },
      },
      {
        id: 'acid-ds1-comp',
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -15, ratio: 4, attack: 0.005, release: 0.15 },
      },
    ],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Acid Warm',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.45, resonance: 0.6 },
      filterEnvelope: { envMod: 0.5, decay: 0.4 },
      accent: { amount: 0.65 },
      slide: { time: 0.2, mode: 'exponential' },
      devilFish: { ...DF_DEFAULTS, normalDecay: 0.4 },
    },
    effects: [
      {
        id: 'acid-warm-tape',
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 60,
        parameters: { drive: 0.35, tone: 8000 },
      },
      {
        id: 'acid-warm-comp',
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -18, ratio: 3, attack: 0.01, release: 0.2 },
      },
    ],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Acid Dub',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.35, resonance: 0.55 },
      filterEnvelope: { envMod: 0.45, decay: 0.5 },
      accent: { amount: 0.6 },
      slide: { time: 0.25, mode: 'exponential' },
      devilFish: { ...DF_DEFAULTS, normalDecay: 0.5 },
    },
    effects: [
      {
        id: 'acid-dub-tape',
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 30,
        parameters: { drive: 0.2, tone: 10000 },
      },
      {
        id: 'acid-dub-echo',
        category: 'tonejs',
        type: 'SpaceEcho',
        enabled: true,
        wet: 35,
        parameters: { mode: 4, rate: 400, intensity: 0.5, echoVolume: 0.7, reverbVolume: 0.2 },
      },
      {
        id: 'acid-dub-spring',
        category: 'wasm',
        type: 'SpringReverb',
        enabled: true,
        wet: 25,
        parameters: { decay: 0.6, damping: 0.5, tension: 0.4, mix: 0.5, drip: 0.3 },
      },
    ],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Acid Echo',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth', pulseWidth: 1, subOscGain: 0, subOscBlend: 1 },
      filter: { cutoff: 0.5, resonance: 0.5 },
      filterEnvelope: { envMod: 0.5, decay: 0.4 },
      accent: { amount: 0.5 },
      slide: { time: 0.17, mode: 'exponential' },
      devilFish: { ...DF_DEFAULTS, normalDecay: 0.4 },
      delay: { enabled: true, time: 0.3, feedback: 0.3, tone: 0.5, mix: 0.5, stereo: 0.75 },
    },
    effects: [],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Acid Trance',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.6, resonance: 0.72 },
      filterEnvelope: { envMod: 0.75, decay: 0.4 },
      accent: { amount: 0.8 },
      slide: { time: 0.15, mode: 'exponential' },
      devilFish: {
        ...DF_DEFAULTS,
        filterInputDrive: 0.1,
        normalDecay: 0.4,
      },
    },
    effects: [
      {
        id: 'acid-trance-dist',
        category: 'tonejs',
        type: 'Distortion',
        enabled: true,
        wet: 35,
        parameters: { distortion: 0.35 },
      },
      {
        id: 'acid-trance-ppd',
        category: 'tonejs',
        type: 'PingPongDelay',
        enabled: true,
        wet: 25,
        parameters: { time: 0.375, feedback: 0.45 },
      },
      {
        id: 'acid-trance-reverb',
        category: 'tonejs',
        type: 'Reverb',
        enabled: true,
        wet: 30,
        parameters: { decay: 3, preDelay: 0.03 },
      },
    ],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Acid Techno',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.65, resonance: 0.85 },
      filterEnvelope: { envMod: 0.85, decay: 0.35 },
      accent: { amount: 0.9 },
      slide: { time: 0.1, mode: 'exponential' },
      devilFish: {
        ...DF_DEFAULTS,
        filterInputDrive: 0.3,
        diodeCharacter: 0.15,
        normalDecay: 0.35,
      },
    },
    effects: [
      {
        id: 'acid-techno-comp',
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -12, ratio: 6, attack: 0.002, release: 0.1 },
      },
    ],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Acid Industrial',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.45, resonance: 0.85 },
      filterEnvelope: { envMod: 0.9, decay: 0.45 },
      accent: { amount: 0.95 },
      slide: { time: 0.08, mode: 'exponential' },
      devilFish: {
        ...DF_DEFAULTS,
        filterInputDrive: 0.6,    // Heavy drive
        diodeCharacter: 0.5,      // Strong diode character
        duffingAmount: 0.6,       // Aggressive nonlinearity
        normalDecay: 0.45,        // Match filterEnvelope.decay
        accentDecay: 0.008,       // Fast accent decay for industrial aggression
      },
    },
    effects: [
      {
        id: 'acid-ind-comp',
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -10, ratio: 8, attack: 0.001, release: 0.08 },
      },
    ],
    volume: 0,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'Acid Space',
    synthType: 'TB303',
    tb303: {
      volume: 1.0,
      oscillator: { type: 'sawtooth' },
      filter: { cutoff: 0.4, resonance: 0.5 },
      filterEnvelope: { envMod: 0.4, decay: 0.55 },
      accent: { amount: 0.5 },
      slide: { time: 0.3, mode: 'exponential' },
      devilFish: { ...DF_DEFAULTS, normalDecay: 0.55 },
    },
    effects: [
      {
        id: 'acid-space-chorus',
        category: 'tonejs',
        type: 'Chorus',
        enabled: true,
        wet: 25,
        parameters: { frequency: 0.4, depth: 0.4 },
      },
      {
        id: 'acid-space-ppd',
        category: 'tonejs',
        type: 'PingPongDelay',
        enabled: true,
        wet: 35,
        parameters: { time: 0.5, feedback: 0.5 },
      },
      {
        id: 'acid-space-reverb',
        category: 'tonejs',
        type: 'Reverb',
        enabled: true,
        wet: 45,
        parameters: { decay: 5, preDelay: 0.05 },
      },
    ],
    volume: 0,
    pan: 0,
  },
];
