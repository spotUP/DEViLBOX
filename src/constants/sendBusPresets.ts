/**
 * sendBusPresets.ts — Factory presets for send bus return effect chains.
 *
 * Each preset configures one send bus with a pre-built effect chain.
 * Common setups: shared reverb, shared delay, parallel compression, special FX.
 */

import type { EffectConfig } from '@typedefs/instrument';

export interface SendBusPreset {
  name: string;
  description: string;
  category: 'Reverb' | 'Delay' | 'Compression' | 'Creative' | 'Genre';
  effects: EffectConfig[];
}

let presetId = 0;
function fxId(): string { return `sbp-${presetId++}`; }

export const SEND_BUS_PRESETS: SendBusPreset[] = [
  // ── Reverb ────────────────────────────────────────────────────────────
  {
    name: 'Shimmer Wash',
    description: 'Ethereal ascending reverb — *wave, ambient',
    category: 'Reverb',
    effects: [{
      id: fxId(), category: 'wasm', type: 'ShimmerReverb', enabled: true, wet: 100,
      parameters: { decay: 80, shimmer: 60, pitch: 12, damping: 40, size: 75, predelay: 30, modRate: 25, modDepth: 15 },
    }],
  },
  {
    name: 'Dark Plate',
    description: 'Dense, dark plate reverb — darkwave, industrial',
    category: 'Reverb',
    effects: [{
      id: fxId(), category: 'wasm', type: 'MVerb', enabled: true, wet: 100,
      parameters: { damping: 0.8, density: 0.7, bandwidth: 0.3, decay: 0.85, predelay: 0.02, size: 0.9, gain: 1.0, mix: 1.0, earlyMix: 0.3 },
    }],
  },
  {
    name: 'Spring Tank',
    description: 'Dub spring reverb with drip',
    category: 'Reverb',
    effects: [{
      id: fxId(), category: 'wasm', type: 'SpringReverb', enabled: true, wet: 100,
      parameters: { decay: 0.7, damping: 0.4, tension: 0.5, mix: 1.0, drip: 0.6, diffusion: 0.7 },
    }],
  },
  {
    name: 'Tight Room',
    description: 'Short, natural room — drums, percussion',
    category: 'Reverb',
    effects: [{
      id: fxId(), category: 'wasm', type: 'MVerb', enabled: true, wet: 100,
      parameters: { damping: 0.6, density: 0.4, bandwidth: 0.7, decay: 0.3, predelay: 0.0, size: 0.3, gain: 1.0, mix: 1.0, earlyMix: 0.7 },
    }],
  },

  // ── Delay ─────────────────────────────────────────────────────────────
  {
    name: 'Ambient Echo',
    description: 'Filtered, darkening delay — ambient, *wave',
    category: 'Delay',
    effects: [{
      id: fxId(), category: 'tonejs', type: 'AmbientDelay', enabled: true, wet: 100,
      parameters: { time: 375, feedback: 55, taps: 2, filterType: 'lowpass', filterFreq: 2500, filterQ: 1.5, modRate: 25, modDepth: 15, stereoSpread: 50, diffusion: 25 },
    }],
  },
  {
    name: 'Tape Echo',
    description: 'Warm tape delay with wow/flutter — dub, lo-fi',
    category: 'Delay',
    effects: [{
      id: fxId(), category: 'wasm', type: 'RETapeEcho', enabled: true, wet: 100,
      parameters: { mode: 3, repeatRate: 0.45, intensity: 0.55, echoVolume: 0.8, wow: 0.15, flutter: 0.1, dirt: 0.2, inputBleed: 0, loopAmount: 0, playheadFilter: 1 },
    }],
  },
  {
    name: 'Stereo Ping Pong',
    description: 'Bouncing L/R delay — wide stereo spread',
    category: 'Delay',
    effects: [{
      id: fxId(), category: 'tonejs', type: 'PingPongDelay', enabled: true, wet: 100,
      parameters: { time: 250, feedback: 45 },
    }],
  },
  {
    name: 'Space Echo',
    description: 'Roland RE-201 multi-head — psychedelic, dub',
    category: 'Delay',
    effects: [{
      id: fxId(), category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 100,
      parameters: { mode: 3, rate: 350, intensity: 0.55, echoVolume: 0.8, reverbVolume: 0.3, bass: 0.5, treble: 0.6 },
    }],
  },

  // ── Compression ───────────────────────────────────────────────────────
  {
    name: 'Parallel Crush',
    description: 'Heavy parallel compression — drums, full mix',
    category: 'Compression',
    effects: [{
      id: fxId(), category: 'tonejs', type: 'Compressor', enabled: true, wet: 100,
      parameters: { threshold: -30, ratio: 20, attack: 0.003, release: 0.1 },
    }],
  },
  {
    name: 'Glue Bus',
    description: 'Gentle bus compression — cohesion',
    category: 'Compression',
    effects: [{
      id: fxId(), category: 'tonejs', type: 'Compressor', enabled: true, wet: 100,
      parameters: { threshold: -18, ratio: 4, attack: 0.01, release: 0.25 },
    }],
  },

  // ── Creative ──────────────────────────────────────────────────────────
  {
    name: 'Granular Cloud',
    description: 'Freeze moments into evolving textures',
    category: 'Creative',
    effects: [{
      id: fxId(), category: 'wasm', type: 'GranularFreeze', enabled: true, wet: 100,
      parameters: { freeze: 0, grainSize: 80, density: 12, scatter: 40, pitch: 0, spray: 25, shimmer: 20, stereoWidth: 70, feedback: 10, captureLen: 600, attack: 5, release: 40, thru: 0 },
    }],
  },
  {
    name: 'Lo-Fi Tape',
    description: 'Worn cassette degradation on the bus',
    category: 'Creative',
    effects: [{
      id: fxId(), category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 100,
      parameters: { wow: 35, flutter: 25, hiss: 20, dropouts: 5, saturation: 40, toneShift: 35 },
    }],
  },

  // ── Genre ─────────────────────────────────────────────────────────────
  {
    name: '*Wave Landscape',
    description: 'Shimmer + ambient delay — complete *wave bus',
    category: 'Genre',
    effects: [
      {
        id: fxId(), category: 'wasm', type: 'ShimmerReverb', enabled: true, wet: 100,
        parameters: { decay: 80, shimmer: 55, pitch: 12, damping: 45, size: 70, predelay: 25, modRate: 20, modDepth: 15 },
      },
      {
        id: fxId(), category: 'tonejs', type: 'AmbientDelay', enabled: true, wet: 40,
        parameters: { time: 500, feedback: 50, taps: 2, filterType: 'lowpass', filterFreq: 2000, filterQ: 1.2, modRate: 20, modDepth: 10, stereoSpread: 60, diffusion: 30 },
      },
    ],
  },
  {
    name: 'Dub Chamber',
    description: 'Spring reverb + tape echo — classic dub',
    category: 'Genre',
    effects: [
      {
        id: fxId(), category: 'wasm', type: 'SpringReverb', enabled: true, wet: 100,
        parameters: { decay: 0.65, damping: 0.45, tension: 0.5, mix: 1.0, drip: 0.5, diffusion: 0.65 },
      },
      {
        id: fxId(), category: 'tonejs', type: 'SpaceEcho', enabled: true, wet: 60,
        parameters: { mode: 2, rate: 300, intensity: 0.5, echoVolume: 0.7, reverbVolume: 0.2, bass: 0.6, treble: 0.4 },
      },
    ],
  },
  {
    name: 'Crystal Castles Void',
    description: 'Shimmer + tape degradation — noisy, ethereal',
    category: 'Genre',
    effects: [
      {
        id: fxId(), category: 'wasm', type: 'ShimmerReverb', enabled: true, wet: 100,
        parameters: { decay: 90, shimmer: 70, pitch: 12, damping: 30, size: 80, predelay: 10, modRate: 35, modDepth: 25 },
      },
      {
        id: fxId(), category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 50,
        parameters: { wow: 40, flutter: 30, hiss: 25, dropouts: 10, saturation: 45, toneShift: 25 },
      },
    ],
  },
];

/** Group presets by category */
export function getSendBusPresetsByCategory(): Record<string, SendBusPreset[]> {
  const groups: Record<string, SendBusPreset[]> = {};
  for (const p of SEND_BUS_PRESETS) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }
  return groups;
}
