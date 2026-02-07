/**
 * TB-303 Factory Presets
 * Authentic acid bass presets optimized for the new 4-pole diode ladder engine
 */

import type { InstrumentConfig } from '@typedefs/instrument';

export const TB303_PRESETS: Omit<InstrumentConfig, 'id'>[] = [
  // === DEFAULT JC303/DB303 PRESET ===
  // Based on db303-default-preset.xml
  // This is the recommended starting point for JC303/DB303
  {
    type: 'synth' as const,
    name: 'JC303 Default',
    synthType: 'TB303',
    tb303: {
      engineType: 'jc303',
      oscillator: {
        type: 'sawtooth',
        pulseWidth: 0,      // 0% (sawtooth)
        subOscGain: 0,      // Off
        subOscBlend: 100,   // Full blend when enabled
      },
      filter: {
        cutoff: 1000,       // ~1000 Hz (0.5 normalized)
        resonance: 50,      // 50% (0.5 normalized)
      },
      filterEnvelope: {
        envMod: 50,         // 50% (0.5 normalized)
        decay: 300,         // ~300ms (0.5 normalized on log scale)
      },
      accent: {
        amount: 50,         // 50% (0.5 normalized)
      },
      slide: {
        time: 51,           // ~51ms (0.17 normalized)
        mode: 'exponential',
      },
      // Devil Fish parameters from default preset
      devilFish: {
        enabled: true,
        normalDecay: 16.4,              // 0.164 * 100
        accentDecay: 0.6,                // 0.006 * 100
        softAttack: 0,                   // 0 * 100
        accentSoftAttack: 10,            // 0.1 * 100
        passbandCompensation: 9,         // 0.09 * 100
        resTracking: 74.3,               // 0.743 * 100
        filterSelect: 255,               // 255 (full)
        diodeCharacter: 1,               // 1.0 = authentic
        duffingAmount: 3,                // 0.03 * 100
        lpBpMix: 0,                      // 0% bandpass
        stageNLAmount: 0,                // 0% nonlinearity
        ensembleAmount: 0,               // 0% ensemble
        oversamplingOrder: 2,            // 4x oversampling
        filterTracking: 0,               // 0% tracking
        filterFM: 0,                     // 0% filter FM
        // Required defaults for other Devil Fish parameters
        accentSweepEnabled: true,
        sweepSpeed: 'normal',
        highResonance: false,
        muffler: 'soft',
        vegDecay: 1230,
        vegSustain: 0,
      },
      // LFO (all off by default)
      lfo: {
        waveform: 0,       // Sine
        rate: 0,           // Off
        contour: 0,        // No contour
        pitchDepth: 0,     // No pitch mod
        pwmDepth: 0,       // No PWM mod
        filterDepth: 0,    // No filter mod
      },
      // Effects (all off by default)
      chorus: {
        enabled: false,
        mode: 0,           // Mode 1 (normalized 0)
        mix: 50,           // 50% (0.5 normalized)
      },
      phaser: {
        enabled: false,
        rate: 50,          // 50% (0.5 normalized)
        depth: 70,         // 70% (0.7 normalized as "width")
        feedback: 0,       // 0% (0 normalized)
        mix: 0,            // 0% (0 normalized)
      },
      delay: {
        enabled: false,
        time: 300,         // 3 = 300ms (assuming 100ms per unit)
        feedback: 30,      // 30% (0.3 normalized)
        tone: 50,          // 50% (0.5 normalized)
        mix: 0,            // 0% (0 normalized)
        stereo: 50,        // 50% (0.5 normalized as "spread")
      },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },

  // === DITTYTOY REFERENCE PRESET ===
  // Source: https://dittytoy.net/ditty/0029103012
  // Settings: cutoff=0.26, res=0.67, envmod=0.13, decay=0.78, overdrive=0.73
  {
    type: 'synth' as const,
    name: 'DT303 (Dittytoy)',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 600,
        resonance: 67,
      },
      filterEnvelope: {
        envMod: 13,
        decay: 2300,
      },
      accent: { amount: 85 },
      slide: { time: 60, mode: 'exponential' },
      overdrive: {
        amount: 73,
        modelIndex: 0,
        drive: 73,
        dryWet: 100,
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },

  // === CLASSIC PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Classic',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 800,
        resonance: 65,
      },
      filterEnvelope: {
        envMod: 60,
        decay: 200,
      },
      accent: { amount: 70 },
      slide: { time: 60, mode: 'exponential' },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Squelchy',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1200,
        resonance: 82, // High res for squelch
      },
      filterEnvelope: {
        envMod: 85, // Deep sweep
        decay: 350,
      },
      accent: { amount: 90 },
      slide: { time: 55, mode: 'exponential' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Deep Sub',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 350, // Low cutoff for sub
        resonance: 35,
      },
      filterEnvelope: {
        envMod: 25, // Subtle envelope
        decay: 120,
      },
      accent: { amount: 45 },
      slide: { time: 100, mode: 'exponential' },
    },
    effects: [],
    volume: -4,
    pan: 0,
  },

  // === SQUARE WAVE PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Square',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'square' },
      filter: {
        cutoff: 900,
        resonance: 68,
      },
      filterEnvelope: {
        envMod: 55,
        decay: 180,
      },
      accent: { amount: 65 },
      slide: { time: 50, mode: 'exponential' },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Hollow',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'square' },
      filter: {
        cutoff: 600,
        resonance: 50,
      },
      filterEnvelope: {
        envMod: 40,
        decay: 250,
      },
      accent: { amount: 55 },
      slide: { time: 80, mode: 'exponential' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },

  // === AGGRESSIVE PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Screamer',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 2000,
        resonance: 88, // Near self-oscillation
      },
      filterEnvelope: {
        envMod: 95, // Maximum sweep
        decay: 450,
      },
      accent: { amount: 100 },
      slide: { time: 35, mode: 'exponential' },
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
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Acid Bite',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1400,
        resonance: 78,
      },
      filterEnvelope: {
        envMod: 80,
        decay: 280,
      },
      accent: { amount: 95 }, // Strong accent
      slide: { time: 45, mode: 'exponential' },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },

  // === EXPERIMENTAL PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Bubbly',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1600,
        resonance: 75,
      },
      filterEnvelope: {
        envMod: 70,
        decay: 70, // Fast decay for bubbles
      },
      accent: { amount: 80 },
      slide: { time: 25, mode: 'exponential' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Self-Osc',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1200,
        resonance: 92, // High but not full self-oscillation
      },
      filterEnvelope: {
        envMod: 75,
        decay: 350,
      },
      accent: { amount: 70 },
      slide: { time: 80, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 350,
        accentDecay: 250,
        vegDecay: 800,
        vegSustain: 10,
        softAttack: 0.3,
        filterTracking: 120, // Filter follows notes for melodic self-oscillation
        filterFM: 0,
        sweepSpeed: 'normal',
        accentSweepEnabled: true,
        highResonance: true,
        muffler: 'off',
      },
    },
    effects: [],
    volume: -12, // Lower volume due to resonance
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Whistler',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1800,
        resonance: 90, // High resonance for whistle but not overwhelming
      },
      filterEnvelope: {
        envMod: 90,
        decay: 500,
      },
      accent: { amount: 85 },
      slide: { time: 120, mode: 'exponential' }, // Long slides
      devilFish: {
        enabled: true,
        normalDecay: 500,
        accentDecay: 400,
        vegDecay: 1200,
        vegSustain: 20,
        softAttack: 3,
        filterTracking: 150, // Strong tracking for melodic whistle
        filterFM: 10,
        sweepSpeed: 'slow',
        accentSweepEnabled: true,
        highResonance: true,
        muffler: 'off',
      },
    },
    effects: [],
    volume: -14,
    pan: 0,
  },

  // === MINIMAL / TECH PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Plastikman',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 550,
        resonance: 52,
      },
      filterEnvelope: {
        envMod: 40,
        decay: 200,
      },
      accent: { amount: 55 },
      slide: { time: 90, mode: 'exponential' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Minimal',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 700,
        resonance: 45,
      },
      filterEnvelope: {
        envMod: 35,
        decay: 150,
      },
      accent: { amount: 40 },
      slide: { time: 70, mode: 'exponential' },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },

  // === LONG DECAY PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Slow Acid',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1000,
        resonance: 72,
      },
      filterEnvelope: {
        envMod: 65,
        decay: 800, // Long decay
      },
      accent: { amount: 75 },
      slide: { time: 100, mode: 'exponential' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: '303 Dreamy',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1300,
        resonance: 60,
      },
      filterEnvelope: {
        envMod: 55,
        decay: 1200, // Very long decay
      },
      accent: { amount: 50 },
      slide: { time: 150, mode: 'exponential' },
    },
    effects: [
      {
        id: 'delay-1',
        category: 'tonejs',
        type: 'Delay',
        enabled: true,
        wet: 25,
        parameters: { delayTime: 0.3, feedback: 0.35 },
      },
    ],
    volume: -10,
    pan: 0,
  },

  // === SPECIAL PRESETS ===
  {
    type: 'synth' as const,
    name: '303 Rubber',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'square' },
      filter: {
        cutoff: 450,
        resonance: 80,
      },
      filterEnvelope: {
        envMod: 70,
        decay: 100,
      },
      accent: { amount: 85 },
      slide: { time: 40, mode: 'exponential' },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },

  // === DEVIL FISH MOD PRESETS ===
  // Based on Robin Whittle's Devil Fish modifications
  {
    type: 'synth' as const,
    name: 'DF Classic',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 900,
        resonance: 70,
      },
      filterEnvelope: {
        envMod: 55,
        decay: 250,
      },
      accent: { amount: 75 },
      slide: { time: 50, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 300,
        accentDecay: 150,
        vegDecay: 2500,
        vegSustain: 0,
        softAttack: 2,
        filterTracking: 0,
        filterFM: 0,
        sweepSpeed: 'normal',
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'off',
      },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Infinite Drone',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 600,
        resonance: 55,
      },
      filterEnvelope: {
        envMod: 30,
        decay: 400,
      },
      accent: { amount: 50 },
      slide: { time: 120, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 800,
        accentDecay: 600,
        vegDecay: 3000,
        vegSustain: 100, // Infinite sustain
        softAttack: 15,
        filterTracking: 50,
        filterFM: 10,
        sweepSpeed: 'slow',
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'soft',
      },
    },
    effects: [
      {
        id: 'reverb-drone',
        category: 'tonejs',
        type: 'Reverb',
        enabled: true,
        wet: 40,
        parameters: { decay: 4, preDelay: 0.02 },
      },
    ],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Chaos Engine',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1400,
        resonance: 80,
      },
      filterEnvelope: {
        envMod: 75,
        decay: 350,
      },
      accent: { amount: 95 },
      slide: { time: 30, mode: 'exponential' },
      overdrive: {
        amount: 55,
        modelIndex: 0,
        drive: 55,
        dryWet: 100,
      },
      devilFish: {
        enabled: true,
        normalDecay: 200,
        accentDecay: 100,
        vegDecay: 500,
        vegSustain: 15,
        softAttack: 0.5,
        filterTracking: 60,
        filterFM: 50, // Moderate FM for chaos without glitching
        sweepSpeed: 'fast',
        accentSweepEnabled: true,
        highResonance: false, // Disable to prevent overwhelming self-oscillation
        muffler: 'soft', // Soft instead of hard for less harshness
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Whistler',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1600,
        resonance: 92,
      },
      filterEnvelope: {
        envMod: 70,
        decay: 500,
      },
      accent: { amount: 80 },
      slide: { time: 100, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 400,
        accentDecay: 300,
        vegDecay: 1500,
        vegSustain: 30,
        softAttack: 5,
        filterTracking: 150, // Over-tracking
        filterFM: 25,
        sweepSpeed: 'slow',
        accentSweepEnabled: true,
        highResonance: true, // Self-oscillation enabled
        muffler: 'off',
      },
    },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Muffled Punch',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 800,
        resonance: 60,
      },
      filterEnvelope: {
        envMod: 65,
        decay: 150,
      },
      accent: { amount: 90 },
      slide: { time: 45, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 100,
        accentDecay: 80,
        vegDecay: 200, // Short VEG for punch
        vegSustain: 0,
        softAttack: 0.5, // Very fast attack
        filterTracking: 30,
        filterFM: 15,
        sweepSpeed: 'fast',
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'soft', // Soft muffler for warmth
      },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },

  // === MORE DEVIL FISH PRESETS ===
  {
    type: 'synth' as const,
    name: 'DF Acid Low',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'square' },
      filter: {
        cutoff: 400,
        resonance: 72,
      },
      filterEnvelope: {
        envMod: 50,
        decay: 300,
      },
      accent: { amount: 80 },
      slide: { time: 80, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 250,
        accentDecay: 120,
        vegDecay: 800,
        vegSustain: 15,
        softAttack: 1.5,
        filterTracking: 40,
        filterFM: 20,
        sweepSpeed: 'fast',
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'off',
      },
    },
    effects: [],
    volume: -6,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Resonant Sweep',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1200,
        resonance: 88,
      },
      filterEnvelope: {
        envMod: 90,
        decay: 600,
      },
      accent: { amount: 95 },
      slide: { time: 60, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 500,
        accentDecay: 400,
        vegDecay: 1200,
        vegSustain: 10,
        softAttack: 3,
        filterTracking: 100,
        filterFM: 35,
        sweepSpeed: 'slow',
        accentSweepEnabled: true,
        highResonance: true,
        muffler: 'off',
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Soft Pad',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 700,
        resonance: 40,
      },
      filterEnvelope: {
        envMod: 20,
        decay: 800,
      },
      accent: { amount: 30 },
      slide: { time: 200, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 1500,
        accentDecay: 1200,
        vegDecay: 3000,
        vegSustain: 80, // High sustain for pad
        softAttack: 25, // Slow attack
        filterTracking: 60,
        filterFM: 5,
        sweepSpeed: 'slow',
        accentSweepEnabled: false,
        highResonance: false,
        muffler: 'soft',
      },
    },
    effects: [
      {
        id: 'reverb-pad',
        category: 'tonejs',
        type: 'Reverb',
        enabled: true,
        wet: 50,
        parameters: { decay: 6, preDelay: 0.05 },
      },
    ],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Hardstyle',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1800,
        resonance: 75,
      },
      filterEnvelope: {
        envMod: 85,
        decay: 80,
      },
      accent: { amount: 100 },
      slide: { time: 25, mode: 'exponential' },
      overdrive: {
        amount: 60,
        modelIndex: 0,
        drive: 60,
        dryWet: 100,
      },
      devilFish: {
        enabled: true,
        normalDecay: 60,
        accentDecay: 40,
        vegDecay: 150,
        vegSustain: 0,
        softAttack: 0.3, // Instant attack
        filterTracking: 50,
        filterFM: 45,
        sweepSpeed: 'fast',
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'hard',
      },
    },
    effects: [],
    volume: -10,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Singing Filter',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 2200,
        resonance: 95,
      },
      filterEnvelope: {
        envMod: 60,
        decay: 700,
      },
      accent: { amount: 70 },
      slide: { time: 150, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 600,
        accentDecay: 500,
        vegDecay: 2000,
        vegSustain: 50,
        softAttack: 8,
        filterTracking: 180, // Strong tracking for singing
        filterFM: 15,
        sweepSpeed: 'normal',
        accentSweepEnabled: true,
        highResonance: true, // Self-oscillation
        muffler: 'off',
      },
    },
    effects: [],
    volume: -14,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Gritty Bass',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'square' },
      filter: {
        cutoff: 500,
        resonance: 65,
      },
      filterEnvelope: {
        envMod: 45,
        decay: 200,
      },
      accent: { amount: 85 },
      slide: { time: 70, mode: 'exponential' },
      overdrive: {
        amount: 40,
        modelIndex: 0,
        drive: 40,
        dryWet: 100,
      },
      devilFish: {
        enabled: true,
        normalDecay: 180,
        accentDecay: 100,
        vegDecay: 400,
        vegSustain: 5,
        softAttack: 1,
        filterTracking: 25,
        filterFM: 55, // Adds grit
        sweepSpeed: 'fast',
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'hard',
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Bubbly Acid',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 1500,
        resonance: 78,
      },
      filterEnvelope: {
        envMod: 75,
        decay: 50, // Very fast for bubbles
      },
      accent: { amount: 90 },
      slide: { time: 20, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 40,
        accentDecay: 30,
        vegDecay: 100,
        vegSustain: 0,
        softAttack: 0.5,
        filterTracking: 70,
        filterFM: 30,
        sweepSpeed: 'fast',
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'off',
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Ambient Drone',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 900,
        resonance: 50,
      },
      filterEnvelope: {
        envMod: 25,
        decay: 1500,
      },
      accent: { amount: 35 },
      slide: { time: 300, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 2500,
        accentDecay: 2000,
        vegDecay: 3000,
        vegSustain: 95, // Near-infinite sustain
        softAttack: 30, // Very slow attack
        filterTracking: 80,
        filterFM: 8,
        sweepSpeed: 'slow',
        accentSweepEnabled: false,
        highResonance: false,
        muffler: 'soft',
      },
    },
    effects: [
      {
        id: 'reverb-ambient',
        category: 'tonejs',
        type: 'Reverb',
        enabled: true,
        wet: 65,
        parameters: { decay: 8, preDelay: 0.1 },
      },
      {
        id: 'delay-ambient',
        category: 'tonejs',
        type: 'PingPongDelay',
        enabled: true,
        wet: 35,
        parameters: { delayTime: 0.5, feedback: 0.55 },
      },
    ],
    volume: -12,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Techno Stab',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 2000,
        resonance: 70,
      },
      filterEnvelope: {
        envMod: 70,
        decay: 100,
      },
      accent: { amount: 100 },
      slide: { time: 30, mode: 'exponential' },
      devilFish: {
        enabled: true,
        normalDecay: 80,
        accentDecay: 50,
        vegDecay: 180,
        vegSustain: 0,
        softAttack: 0.3,
        filterTracking: 45,
        filterFM: 40,
        sweepSpeed: 'fast',
        accentSweepEnabled: true,
        highResonance: false,
        muffler: 'soft',
      },
    },
    effects: [],
    volume: -8,
    pan: 0,
  },
  {
    type: 'synth' as const,
    name: 'DF Screaming Lead',
    synthType: 'TB303',
    tb303: {
      oscillator: { type: 'sawtooth' },
      filter: {
        cutoff: 3000,
        resonance: 90,
      },
      filterEnvelope: {
        envMod: 95,
        decay: 400,
      },
      accent: { amount: 100 },
      slide: { time: 50, mode: 'exponential' },
      overdrive: {
        amount: 50,
        modelIndex: 0,
        drive: 50,
        dryWet: 100,
      },
      devilFish: {
        enabled: true,
        normalDecay: 350,
        accentDecay: 250,
        vegDecay: 800,
        vegSustain: 25,
        softAttack: 2,
        filterTracking: 150,
        filterFM: 60,
        sweepSpeed: 'normal',
        accentSweepEnabled: true,
        highResonance: true,
        muffler: 'off',
      },
    },
    effects: [],
    volume: -14,
    pan: 0,
  },
];
