/**
 * channelFxPresets.ts — Factory presets for per-channel insert effect chains.
 *
 * Pre-built effect chains for common channel processing scenarios.
 * Applied via useMixerStore.loadChannelInsertPreset().
 */

import type { EffectConfig } from '@typedefs/instrument';

export interface ChannelFxPreset {
  name: string;
  description: string;
  category: 'Bass' | 'Drums' | 'Leads' | 'Pads' | 'Vocals' | 'Lo-Fi' | 'Creative';
  effects: EffectConfig[];
}

let presetId = 0;
function fxId(): string { return `cfp-${presetId++}`; }

export const CHANNEL_FX_PRESETS: ChannelFxPreset[] = [
  // ── Bass ──────────────────────────────────────────────────────────────
  {
    name: 'Warm Bass',
    description: 'Tape saturation + gentle compression',
    category: 'Bass',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 60, parameters: { drive: 40, tone: 8000 } },
      { id: fxId(), category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -20, ratio: 4, attack: 0.01, release: 0.15 } },
    ],
  },
  {
    name: 'Acid Bass',
    description: 'Filter + distortion for TB-303',
    category: 'Bass',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { type: 'lowpass', frequency: 1200, rolloff: -24, Q: 8 } },
      { id: fxId(), category: 'tonejs', type: 'Distortion', enabled: true, wet: 50, parameters: { drive: 0.6, oversample: '2x' } },
    ],
  },
  {
    name: 'Sub Bass',
    description: 'Low-pass filter + compressor for clean sub',
    category: 'Bass',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { type: 'lowpass', frequency: 200, rolloff: -24, Q: 1 } },
      { id: fxId(), category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -15, ratio: 8, attack: 0.005, release: 0.1 } },
    ],
  },

  // ── Drums ─────────────────────────────────────────────────────────────
  {
    name: 'Punchy Drums',
    description: 'Compression + EQ boost for attack',
    category: 'Drums',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -24, ratio: 6, attack: 0.002, release: 0.08 } },
      { id: fxId(), category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: 2, mid: -1, high: 3, lowFrequency: 200, highFrequency: 4000 } },
    ],
  },
  {
    name: 'Gated Snare',
    description: '80s gated reverb snare',
    category: 'Drums',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'Reverb', enabled: true, wet: 70, parameters: { decay: 0.8, preDelay: 0 } },
      { id: fxId(), category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -35, ratio: 20, attack: 0.001, release: 0.05 } },
    ],
  },
  {
    name: 'Lo-Fi Drums',
    description: 'BitCrusher + tape for crunchy beats',
    category: 'Drums',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 60, parameters: { bits: 10 } },
      { id: fxId(), category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 40, parameters: { wow: 15, flutter: 10, hiss: 0, dropouts: 0, saturation: 30, toneShift: 40 } },
    ],
  },

  // ── Leads ─────────────────────────────────────────────────────────────
  {
    name: 'Chorus Lead',
    description: 'Stereo chorus + subtle delay for width',
    category: 'Leads',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'Chorus', enabled: true, wet: 50, parameters: { frequency: 1.5, delayTime: 3.5, depth: 0.7 } },
      { id: fxId(), category: 'tonejs', type: 'StereoWidener', enabled: true, wet: 100, parameters: { width: 0.7 } },
    ],
  },
  {
    name: 'Phaser Lead',
    description: 'Classic phaser sweep',
    category: 'Leads',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'Phaser', enabled: true, wet: 60, parameters: { frequency: 0.5, octaves: 3, baseFrequency: 1000 } },
    ],
  },

  // ── Pads ──────────────────────────────────────────────────────────────
  {
    name: 'Shimmer Pad',
    description: 'Tape warmth + shimmer reverb for ethereal pads',
    category: 'Pads',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'TapeSaturation', enabled: true, wet: 30, parameters: { drive: 25, tone: 10000 } },
      { id: fxId(), category: 'tonejs', type: 'Chorus', enabled: true, wet: 40, parameters: { frequency: 0.3, delayTime: 5, depth: 0.8 } },
    ],
  },
  {
    name: 'Dark Pad',
    description: 'Low-pass filter + tape degradation',
    category: 'Pads',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'Filter', enabled: true, wet: 100, parameters: { type: 'lowpass', frequency: 3000, rolloff: -12, Q: 1 } },
      { id: fxId(), category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 50, parameters: { wow: 25, flutter: 15, hiss: 10, dropouts: 0, saturation: 20, toneShift: 30 } },
    ],
  },

  // ── Vocals ────────────────────────────────────────────────────────────
  {
    name: 'Clean Vocal',
    description: 'Compression + EQ for clean vocal chain',
    category: 'Vocals',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'Compressor', enabled: true, wet: 100, parameters: { threshold: -18, ratio: 3, attack: 0.01, release: 0.2 } },
      { id: fxId(), category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: { low: -3, mid: 2, high: 1, lowFrequency: 300, highFrequency: 5000 } },
    ],
  },
  {
    name: 'Crystal Castles Vocal',
    description: 'BitCrush + tape + heavy reverb send',
    category: 'Vocals',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'BitCrusher', enabled: true, wet: 70, parameters: { bits: 8 } },
      { id: fxId(), category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 60, parameters: { wow: 40, flutter: 30, hiss: 20, dropouts: 5, saturation: 45, toneShift: 25 } },
    ],
  },

  // ── Lo-Fi ─────────────────────────────────────────────────────────────
  {
    name: 'Cassette Deck',
    description: 'Full cassette simulation — everything through tape',
    category: 'Lo-Fi',
    effects: [
      { id: fxId(), category: 'tonejs', type: 'TapeDegradation', enabled: true, wet: 80, parameters: { wow: 35, flutter: 25, hiss: 15, dropouts: 5, saturation: 35, toneShift: 35 } },
    ],
  },
  {
    name: 'Vinyl Record',
    description: 'Vinyl noise + tone arm coloring',
    category: 'Lo-Fi',
    effects: [
      { id: fxId(), category: 'wasm', type: 'VinylNoise', enabled: true, wet: 30, parameters: { hiss: 40, dust: 50, age: 45, speed: 5.5 } },
    ],
  },

  // ── Creative ──────────────────────────────────────────────────────────
  {
    name: 'Frozen Texture',
    description: 'Granular freeze ready to capture a moment',
    category: 'Creative',
    effects: [
      { id: fxId(), category: 'wasm', type: 'GranularFreeze', enabled: true, wet: 100, parameters: { freeze: 0, grainSize: 80, density: 12, scatter: 40, pitch: 0, spray: 25, shimmer: 15, stereoWidth: 70, feedback: 0, captureLen: 500, attack: 5, release: 40, thru: 1 } },
    ],
  },
  {
    name: 'Leslie Cabinet',
    description: 'Rotary speaker for organ/keys',
    category: 'Creative',
    effects: [
      { id: fxId(), category: 'wasm', type: 'Leslie', enabled: true, wet: 70, parameters: { speed: 0, hornRate: 6.8, drumRate: 5.9, hornDepth: 0.7, drumDepth: 0.5, doppler: 0.5, width: 0.8, acceleration: 0.5 } },
    ],
  },
];

/** Group presets by category */
export function getChannelFxPresetsByCategory(): Record<string, ChannelFxPreset[]> {
  const groups: Record<string, ChannelFxPreset[]> = {};
  for (const p of CHANNEL_FX_PRESETS) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }
  return groups;
}
