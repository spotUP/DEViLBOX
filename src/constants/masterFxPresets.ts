/**
 * Master Effects Presets
 *
 * These are MIX-BUS / MASTERING presets — subtle, cohesive processing
 * that enhances the full mix. They should never drastically alter the
 * character of individual sounds. Think: what a mastering engineer
 * would put across the stereo bus.
 *
 * For creative sound-design presets, see instrumentFxPresets.ts.
 */

import type { EffectConfig } from '@typedefs/instrument';

export interface MasterFxPreset {
  name: string;
  description: string;
  category: 'Clean' | 'Warm' | 'Loud' | 'Wide' | 'Vinyl' | 'Genre' | 'DJ';
  effects: Omit<EffectConfig, 'id'>[];
}

export const MASTER_FX_PRESETS: MasterFxPreset[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CLEAN — Transparent mastering, minimal coloration
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Clean Master',
    description: 'Gentle glue compression + tonal balance — transparent finishing',
    category: 'Clean',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 1, mid: 0, high: 0.5 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -18, ratio: 2.5, attack: 0.01, release: 0.2 },
      },
    ],
  },
  {
    name: 'Transparent',
    description: 'Barely-there bus compression — preserves full dynamics',
    category: 'Clean',
    effects: [
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -12, ratio: 1.5, attack: 0.03, release: 0.3 },
      },
    ],
  },
  {
    name: 'Balanced',
    description: 'EQ sculpting + light compression for a polished, even mix',
    category: 'Clean',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 1.5, mid: -0.5, high: 1 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -16, ratio: 2, attack: 0.015, release: 0.25 },
      },
      {
        category: 'tonejs',
        type: 'StereoWidener',
        enabled: true,
        wet: 100,
        parameters: { width: 0.55 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WARM — Analog-flavored mastering with saturation and tape color
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Analog Warmth',
    description: 'Tape saturation + compression — the sound of a warm analog mix bus',
    category: 'Warm',
    effects: [
      {
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 30,
        parameters: { drive: 35, tone: 10000 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -16, ratio: 3, attack: 0.01, release: 0.2 },
      },
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 1.5, mid: 0, high: -0.5 },
      },
    ],
  },
  {
    name: 'Tape Machine',
    description: 'Tape simulator for subtle wow, saturation, and head-bump warmth',
    category: 'Warm',
    effects: [
      {
        category: 'wasm',
        type: 'TapeSimulator',
        enabled: true,
        wet: 40,
        parameters: { drive: 25, character: 35, bias: 45, shame: 15, hiss: 5, speed: 1 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -18, ratio: 2.5, attack: 0.015, release: 0.25 },
      },
    ],
  },
  {
    name: 'Tube Console',
    description: 'Chebyshev harmonics + EQ shaping — tube mixing desk vibe',
    category: 'Warm',
    effects: [
      {
        category: 'tonejs',
        type: 'Chebyshev',
        enabled: true,
        wet: 12,
        parameters: { order: 2 },
      },
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 2, mid: 0.5, high: -1 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -15, ratio: 3, attack: 0.008, release: 0.18 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOUD — Aggressive bus processing for maximum impact
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Club Ready',
    description: 'Punchy compression with sub boost — loud and dancefloor-ready',
    category: 'Loud',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 3, mid: -1, high: 2 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -14, ratio: 4, attack: 0.005, release: 0.12 },
      },
      {
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 18,
        parameters: { drive: 40, tone: 11000 },
      },
    ],
  },
  {
    name: 'Brick Wall',
    description: 'Hard limiting for maximum loudness — squashed but punchy',
    category: 'Loud',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 2, mid: 0, high: 1 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -8, ratio: 12, attack: 0.001, release: 0.05 },
      },
    ],
  },
  {
    name: 'Pumping',
    description: 'Aggressive sidechain-style compression — obvious pump for EDM',
    category: 'Loud',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 4, mid: -2, high: 1 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -10, ratio: 8, attack: 0.001, release: 0.15 },
      },
      {
        category: 'tonejs',
        type: 'Distortion',
        enabled: true,
        wet: 10,
        parameters: { distortion: 0.1 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WIDE — Stereo enhancement and spatial mastering
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Stereo Wide',
    description: 'Subtle stereo widening + glue compression for an expansive mix',
    category: 'Wide',
    effects: [
      {
        category: 'tonejs',
        type: 'StereoWidener',
        enabled: true,
        wet: 100,
        parameters: { width: 0.7 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -15, ratio: 2.5, attack: 0.015, release: 0.25 },
      },
    ],
  },
  {
    name: 'Room Glue',
    description: 'Short plate reverb to glue the mix in a shared acoustic space',
    category: 'Wide',
    effects: [
      {
        category: 'wasm',
        type: 'MVerb',
        enabled: true,
        wet: 15,
        parameters: { damping: 0.6, density: 0.5, bandwidth: 0.7, decay: 0.3, predelay: 0.0, size: 0.4, gain: 1.0, mix: 0.3, earlyMix: 0.7 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -16, ratio: 2.5, attack: 0.01, release: 0.2 },
      },
    ],
  },
  {
    name: 'Immersive',
    description: 'Plate reverb + widener + chorus shimmer — large, immersive soundstage',
    category: 'Wide',
    effects: [
      {
        category: 'tonejs',
        type: 'Chorus',
        enabled: true,
        wet: 10,
        parameters: { frequency: 0.2, depth: 0.15 },
      },
      {
        category: 'wasm',
        type: 'MVerb',
        enabled: true,
        wet: 12,
        parameters: { damping: 0.5, density: 0.6, bandwidth: 0.6, decay: 0.4, predelay: 0.01, size: 0.6, gain: 1.0, mix: 0.35, earlyMix: 0.6 },
      },
      {
        category: 'tonejs',
        type: 'StereoWidener',
        enabled: true,
        wet: 100,
        parameters: { width: 0.6 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -16, ratio: 2, attack: 0.02, release: 0.25 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VINYL — Analog character and vintage coloration on the bus
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Vinyl Press',
    description: 'ToneArm vinyl simulation — RIAA EQ, rolloff, and subtle crackle on the master',
    category: 'Vinyl',
    effects: [
      {
        category: 'wasm',
        type: 'ToneArm',
        enabled: true,
        wet: 35,
        parameters: { wow: 8, coil: 40, flutter: 5, riaa: 60, stylus: 25, hiss: 10, pops: 8, rpm: 33.333 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -16, ratio: 2.5, attack: 0.015, release: 0.25 },
      },
    ],
  },
  {
    name: 'Dusty Grooves',
    description: 'Vinyl noise + tape warmth — dusty crate-digger character',
    category: 'Vinyl',
    effects: [
      {
        category: 'wasm',
        type: 'VinylNoise',
        enabled: true,
        wet: 25,
        parameters: { hiss: 30, dust: 40, age: 35, speed: 5.5, riaa: 45, stylusResonance: 40, wornStylus: 20, pinch: 25, innerGroove: 15, ghostEcho: 10, dropout: 5, warp: 5, eccentricity: 10 },
      },
      {
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 20,
        parameters: { drive: 30, tone: 9000 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -18, ratio: 2.5, attack: 0.015, release: 0.25 },
      },
    ],
  },
  {
    name: 'Lo-Fi Master',
    description: 'Tape sim + vinyl + gentle rolloff — nostalgic warmth across the whole mix',
    category: 'Vinyl',
    effects: [
      {
        category: 'wasm',
        type: 'TapeSimulator',
        enabled: true,
        wet: 30,
        parameters: { drive: 20, character: 30, bias: 40, shame: 12, hiss: 8, speed: 1 },
      },
      {
        category: 'wasm',
        type: 'ToneArm',
        enabled: true,
        wet: 20,
        parameters: { wow: 10, coil: 35, flutter: 8, riaa: 55, stylus: 20, hiss: 5, pops: 3, rpm: 33.333 },
      },
      {
        category: 'tonejs',
        type: 'Filter',
        enabled: true,
        wet: 100,
        parameters: { frequency: 12000, type: 'lowpass', Q: 0.5 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -18, ratio: 2.5, attack: 0.02, release: 0.3 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GENRE — Mix-bus mastering tuned for specific genres (BPM-synced where useful)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Techno',
    description: 'Hard-hitting sub boost + brick compression + subtle grit',
    category: 'Genre',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 4, mid: -2, high: 1 },
      },
      {
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 15,
        parameters: { drive: 40, tone: 11000 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -12, ratio: 5, attack: 0.003, release: 0.1 },
      },
    ],
  },
  {
    name: 'House',
    description: 'Warm low-end + smooth tops + glue comp — classic house mastering',
    category: 'Genre',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 2, mid: 0.5, high: 1 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -16, ratio: 3, attack: 0.008, release: 0.18 },
      },
      {
        category: 'tonejs',
        type: 'StereoWidener',
        enabled: true,
        wet: 100,
        parameters: { width: 0.5 },
      },
    ],
  },
  {
    name: 'Drum & Bass',
    description: 'Tight transients + sub weight + air — fast and heavy',
    category: 'Genre',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 5, mid: -1, high: 3 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -10, ratio: 5, attack: 0.002, release: 0.08 },
      },
    ],
  },
  {
    name: 'Hip Hop',
    description: 'Fat low-end + warm saturation + controlled dynamics',
    category: 'Genre',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 3, mid: 1, high: 0 },
      },
      {
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 20,
        parameters: { drive: 30, tone: 8000 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -16, ratio: 3.5, attack: 0.01, release: 0.2 },
      },
    ],
  },
  {
    name: 'Dub / Reggae',
    description: 'Heavy subs + warm mids + spring tank glue',
    category: 'Genre',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 5, mid: -1, high: -1 },
      },
      {
        category: 'wasm',
        type: 'SpringReverb',
        enabled: true,
        wet: 10,
        parameters: { decay: 0.3, damping: 0.5, tension: 0.4, mix: 0.25, drip: 0.2, diffusion: 0.6 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -18, ratio: 3, attack: 0.01, release: 0.25 },
      },
    ],
  },
  {
    name: 'Ambient',
    description: 'Spacious plate + gentle compression — ethereal finishing',
    category: 'Genre',
    effects: [
      {
        category: 'wasm',
        type: 'MVerb',
        enabled: true,
        wet: 20,
        parameters: { damping: 0.4, density: 0.7, bandwidth: 0.5, decay: 0.6, predelay: 0.04, size: 0.85, gain: 1.0, mix: 0.4, earlyMix: 0.4 },
      },
      {
        category: 'tonejs',
        type: 'StereoWidener',
        enabled: true,
        wet: 100,
        parameters: { width: 0.6 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -20, ratio: 2, attack: 0.03, release: 0.4 },
      },
    ],
  },
  {
    name: 'Hardstyle',
    description: 'Maximum sub impact + hard limiting + grit — loud and aggressive',
    category: 'Genre',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 5, mid: -1, high: 3 },
      },
      {
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 20,
        parameters: { drive: 50, tone: 12000 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -8, ratio: 8, attack: 0.002, release: 0.08 },
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DJ — Performance-oriented master processing for live DJ sets
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'DJ Booth',
    description: 'Club-standard bus compression + EQ + tape warmth — ready to mix',
    category: 'DJ',
    effects: [
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 2, mid: 0, high: 1 },
      },
      {
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 15,
        parameters: { drive: 30, tone: 11000 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -14, ratio: 3.5, attack: 0.005, release: 0.12 },
      },
    ],
  },
  {
    name: 'Dub Sirens Live',
    description: 'Space Echo + spring reverb on the master — live dub FX send',
    category: 'DJ',
    effects: [
      {
        category: 'tonejs',
        type: 'SpaceEcho',
        enabled: true,
        wet: 35,
        parameters: { mode: 4, rate: 300, intensity: 0.55, echoVolume: 0.75, reverbVolume: 0.2, bpmSync: 1, syncDivision: '1/4' },
      },
      {
        category: 'wasm',
        type: 'SpringReverb',
        enabled: true,
        wet: 20,
        parameters: { decay: 0.5, damping: 0.4, tension: 0.45, mix: 0.3, drip: 0.5, diffusion: 0.6 },
      },
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 4, mid: -1, high: 0 },
      },
    ],
  },
  {
    name: 'Big Room',
    description: 'Plate reverb + wide stereo + punchy comp — festival main stage',
    category: 'DJ',
    effects: [
      {
        category: 'wasm',
        type: 'MVerb',
        enabled: true,
        wet: 12,
        parameters: { damping: 0.5, density: 0.6, bandwidth: 0.7, decay: 0.35, predelay: 0.0, size: 0.5, gain: 1.0, mix: 0.35, earlyMix: 0.7 },
      },
      {
        category: 'tonejs',
        type: 'StereoWidener',
        enabled: true,
        wet: 100,
        parameters: { width: 0.6 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -12, ratio: 4, attack: 0.005, release: 0.12 },
      },
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 3, mid: -1, high: 2 },
      },
    ],
  },
  {
    name: 'Vinyl DJ',
    description: 'ToneArm simulation + warmth — vinyl turntable character on the output',
    category: 'DJ',
    effects: [
      {
        category: 'wasm',
        type: 'ToneArm',
        enabled: true,
        wet: 30,
        parameters: { wow: 6, coil: 35, flutter: 4, riaa: 55, stylus: 20, hiss: 8, pops: 5, rpm: 33.333 },
      },
      {
        category: 'tonejs',
        type: 'TapeSaturation',
        enabled: true,
        wet: 15,
        parameters: { drive: 25, tone: 10000 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -16, ratio: 3, attack: 0.01, release: 0.2 },
      },
    ],
  },
  {
    name: 'Echo Out',
    description: 'BPM-synced tape echo for live transitions — wash to echo and back',
    category: 'DJ',
    effects: [
      {
        category: 'tonejs',
        type: 'RETapeEcho',
        enabled: true,
        wet: 40,
        parameters: { mode: 3, repeatRate: 0.5, intensity: 0.55, echoVolume: 0.8, wow: 0.15, flutter: 0.1, dirt: 0.1, inputBleed: 0.05, loopAmount: 0, playheadFilter: 1 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -14, ratio: 3, attack: 0.008, release: 0.15 },
      },
    ],
  },
  {
    name: 'Warehouse Rave',
    description: 'Gritty tape saturation + hard compression — raw warehouse energy',
    category: 'DJ',
    effects: [
      {
        category: 'wasm',
        type: 'TapeSimulator',
        enabled: true,
        wet: 35,
        parameters: { drive: 40, character: 45, bias: 40, shame: 20, hiss: 10, speed: 1 },
      },
      {
        category: 'tonejs',
        type: 'EQ3',
        enabled: true,
        wet: 100,
        parameters: { low: 4, mid: -2, high: 2 },
      },
      {
        category: 'tonejs',
        type: 'Compressor',
        enabled: true,
        wet: 100,
        parameters: { threshold: -10, ratio: 6, attack: 0.003, release: 0.1 },
      },
    ],
  },
];
