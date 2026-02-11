/**
 * Unified Effects Registry
 *
 * Combines Tone.js effects and GuitarML neural effects into a single registry.
 * All 60 effects (23 Tone.js + 37 Neural) available for both instrument and master chains.
 */

import { GUITARML_MODEL_REGISTRY } from './guitarMLRegistry';
import type { EffectCategory } from '@typedefs/instrument';

export interface AvailableEffect {
  category: EffectCategory;
  type?: string;              // For tonejs effects
  neuralModelIndex?: number;  // For neural effects
  label: string;
  group: string;              // UI grouping
  description?: string;
}

/**
 * All available effects - Tone.js + Neural combined
 */
export const AVAILABLE_EFFECTS: AvailableEffect[] = [
  // ===== DYNAMICS (Tone.js) =====
  {
    category: 'tonejs',
    type: 'Compressor',
    label: 'Compressor',
    group: 'Dynamics',
    description: 'Dynamic range compression with threshold, ratio, attack, and release',
  },
  {
    category: 'tonejs',
    type: 'EQ3',
    label: '3-Band EQ',
    group: 'Dynamics',
    description: 'Three-band equalizer with low, mid, and high frequency control',
  },

  // ===== DISTORTION (Tone.js) =====
  {
    category: 'tonejs',
    type: 'Distortion',
    label: 'Distortion',
    group: 'Distortion',
    description: 'Waveshaping distortion with drive control',
  },
  {
    category: 'tonejs',
    type: 'BitCrusher',
    label: 'Bit Crusher',
    group: 'Distortion',
    description: 'Digital bit reduction for lo-fi effects',
  },
  {
    category: 'tonejs',
    type: 'Chebyshev',
    label: 'Chebyshev',
    group: 'Distortion',
    description: 'Harmonic waveshaper distortion',
  },

  // ===== TIME-BASED (Tone.js) =====
  {
    category: 'tonejs',
    type: 'Reverb',
    label: 'Reverb',
    group: 'Reverb & Delay',
    description: 'Convolution reverb with decay and pre-delay',
  },
  {
    category: 'tonejs',
    type: 'JCReverb',
    label: 'JC Reverb',
    group: 'Reverb & Delay',
    description: 'Feedback comb filter reverb',
  },
  {
    category: 'tonejs',
    type: 'Delay',
    label: 'Delay',
    group: 'Reverb & Delay',
    description: 'Simple delay with time and feedback',
  },
  {
    category: 'tonejs',
    type: 'FeedbackDelay',
    label: 'Feedback Delay',
    group: 'Reverb & Delay',
    description: 'Delay with enhanced feedback control',
  },
  {
    category: 'tonejs',
    type: 'PingPongDelay',
    label: 'Ping Pong Delay',
    group: 'Reverb & Delay',
    description: 'Stereo delay that bounces between left and right',
  },
  {
    category: 'tonejs',
    type: 'SpaceEcho',
    label: 'Space Echo',
    group: 'Reverb & Delay',
    description: 'Roland RE-201 emulation with 3 heads and spring reverb',
  },
  {
    category: 'tonejs',
    type: 'SpaceyDelayer',
    label: 'Spacey Delayer',
    group: 'Reverb & Delay',
    description: 'Multitap tape delay with configurable tap spacing (WASM)',
  },
  {
    category: 'tonejs',
    type: 'RETapeEcho',
    label: 'RE Tape Echo',
    group: 'Reverb & Delay',
    description: 'Roland RE-150/201 tape echo with wow, flutter, and tape saturation (WASM)',
  },

  // ===== MODULATION (Tone.js) =====
  {
    category: 'tonejs',
    type: 'BiPhase',
    label: 'Bi-Phase',
    group: 'Modulation',
    description: 'Dual-stage phaser with series/parallel routing',
  },
  {
    category: 'tonejs',
    type: 'Chorus',
    label: 'Chorus',
    group: 'Modulation',
    description: 'Modulated delay for thickening sounds',
  },
  {
    category: 'tonejs',
    type: 'Phaser',
    label: 'Phaser',
    group: 'Modulation',
    description: 'Sweeping notch filter effect',
  },
  {
    category: 'tonejs',
    type: 'Tremolo',
    label: 'Tremolo',
    group: 'Modulation',
    description: 'Amplitude modulation for rhythmic pulsing',
  },
  {
    category: 'tonejs',
    type: 'Vibrato',
    label: 'Vibrato',
    group: 'Modulation',
    description: 'Pitch modulation for warbling effects',
  },
  {
    category: 'tonejs',
    type: 'AutoPanner',
    label: 'Auto Panner',
    group: 'Modulation',
    description: 'Automatic stereo panning modulation',
  },

  // ===== FILTERS (Tone.js) =====
  {
    category: 'tonejs',
    type: 'Filter',
    label: 'Filter',
    group: 'Filter',
    description: 'Resonant filter with multiple types',
  },
  {
    category: 'tonejs',
    type: 'DubFilter',
    label: 'Dub Filter',
    group: 'Filter',
    description: 'King Tubby-style resonant high-pass filter for dramatic sweeps',
  },
  {
    category: 'tonejs',
    type: 'AutoFilter',
    label: 'Auto Filter',
    group: 'Filter',
    description: 'LFO-modulated filter for rhythmic sweeps',
  },
  {
    category: 'tonejs',
    type: 'AutoWah',
    label: 'Auto Wah',
    group: 'Filter',
    description: 'Envelope-following wah effect',
  },
  {
    category: 'wasm',
    type: 'MoogFilter',
    label: 'Moog Filter',
    group: 'Filter',
    description: '6 analog-modeled Moog ladder filters (Hyperion, Krajeski, Stilson, Microtracker, Improved, Oberheim) via WASM',
  },
  {
    category: 'wasm',
    type: 'MVerb',
    label: 'MVerb Plate',
    group: 'Reverb & Delay',
    description: 'MVerb plate reverb — lush algorithmic reverb with damping, density, and early/late reflections (WASM, GPL v3)',
  },
  {
    category: 'wasm',
    type: 'Leslie',
    label: 'Leslie Speaker',
    group: 'Modulation',
    description: 'Rotary speaker cabinet — crossover, dual-rotor AM/doppler, speed ramping between chorale and tremolo (WASM)',
  },
  {
    category: 'wasm',
    type: 'SpringReverb',
    label: 'Spring Reverb',
    group: 'Reverb & Delay',
    description: 'Classic dub spring tank — allpass diffusion, comb bank, metallic drip transients, tension control (WASM)',
  },

  // ===== PITCH (Tone.js) =====
  {
    category: 'tonejs',
    type: 'PitchShift',
    label: 'Pitch Shift',
    group: 'Pitch',
    description: 'Transpose audio up or down by semitones',
  },
  {
    category: 'tonejs',
    type: 'FrequencyShifter',
    label: 'Frequency Shifter',
    group: 'Pitch',
    description: 'Ring modulation-style frequency shifting',
  },

  // ===== SPATIAL (Tone.js) =====
  {
    category: 'tonejs',
    type: 'StereoWidener',
    label: 'Stereo Widener',
    group: 'Spatial',
    description: 'Enhance stereo image width',
  },

  // ===== NEURAL EFFECTS (37 GuitarML models) =====
  ...GUITARML_MODEL_REGISTRY.map((model) => ({
    category: 'neural' as const,
    neuralModelIndex: model.index,
    label: model.name,
    group: model.category === 'overdrive' ? 'Neural Overdrive'
      : model.category === 'distortion' ? 'Neural Distortion'
      : model.category === 'amplifier' ? 'Neural Amp'
      : 'Neural Effect',
    description: `${model.fullName} - ${model.description}`,
  })),
];

/**
 * Get effects grouped by category
 */
export function getEffectsByGroup(): Record<string, AvailableEffect[]> {
  const grouped: Record<string, AvailableEffect[]> = {};

  AVAILABLE_EFFECTS.forEach((effect) => {
    if (!grouped[effect.group]) {
      grouped[effect.group] = [];
    }
    grouped[effect.group].push(effect);
  });

  return grouped;
}

/**
 * Get effects by category (tonejs vs neural)
 */
export function getEffectsByCategory(category: EffectCategory): AvailableEffect[] {
  return AVAILABLE_EFFECTS.filter((effect) => effect.category === category);
}

/**
 * Search effects by name or description
 */
export function searchEffects(query: string): AvailableEffect[] {
  const lowerQuery = query.toLowerCase();
  return AVAILABLE_EFFECTS.filter(
    (effect) =>
      effect.label.toLowerCase().includes(lowerQuery) ||
      effect.description?.toLowerCase().includes(lowerQuery) ||
      effect.group.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get total effect count
 */
export function getTotalEffectCount(): { total: number; tonejs: number; neural: number; wasm: number } {
  const tonejs = AVAILABLE_EFFECTS.filter((e) => e.category === 'tonejs').length;
  const neural = AVAILABLE_EFFECTS.filter((e) => e.category === 'neural').length;
  const wasm = AVAILABLE_EFFECTS.filter((e) => e.category === 'wasm').length;
  return { total: tonejs + neural + wasm, tonejs, neural, wasm };
}

/**
 * Get all group names
 */
export function getEffectGroups(): string[] {
  const groups = new Set(AVAILABLE_EFFECTS.map((e) => e.group));
  return Array.from(groups).sort();
}
