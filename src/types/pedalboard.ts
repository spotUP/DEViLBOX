/**
 * Neural Pedalboard Type System
 *
 * Comprehensive type definitions for the neural effect pedalboard system.
 * Supports chaining multiple neural models and traditional effects.
 */

/**
 * Categories of effects available in the pedalboard
 */
export type PedalboardEffectCategory =
  | 'overdrive'      // Tube screamers, overdrives, light distortion
  | 'distortion'     // Heavy distortion, fuzz, metal
  | 'amplifier'      // Amp simulations (preamp, power amp, full stack)
  | 'eq'             // Equalization and tone shaping
  | 'filter'         // Filters, wahs, envelope followers
  | 'modulation'     // Chorus, phaser, flanger
  | 'delay'          // Delay and echo
  | 'reverb'         // Reverb and space
  | 'dynamics'       // Compression, limiting, gating
  | 'cabinet'        // Speaker cabinet simulation (IR)
  | 'utility';       // Gain, mix, routing utilities

/**
 * Parameter types for effect controls
 */
export interface EffectParameter {
  name: string;           // Parameter name (e.g., "Drive", "Tone")
  id: string;             // Unique ID for parameter (e.g., "drive", "tone")
  value: number;          // Current value (0-100)
  default: number;        // Default value (0-100)
  min: number;            // Minimum value (usually 0)
  max: number;            // Maximum value (usually 100)
  unit?: string;          // Optional unit ("%", "dB", "Hz", "ms")
  curve?: 'linear' | 'exponential' | 'logarithmic'; // Response curve
}

/**
 * Parameter schema for a specific effect model
 */
export interface EffectParameterSchema {
  drive?: EffectParameter;
  tone?: EffectParameter;
  level?: EffectParameter;
  presence?: EffectParameter;
  bass?: EffectParameter;
  mid?: EffectParameter;
  treble?: EffectParameter;
  dryWet?: EffectParameter;
  gain?: EffectParameter;
  output?: EffectParameter;
  // Model-specific parameters
  [key: string]: EffectParameter | undefined;
}

/**
 * Neural model information (GuitarML models)
 */
export interface NeuralModelInfo {
  index: number;                    // Model index (0-36)
  name: string;                     // Display name
  fullName: string;                 // Full technical name
  category: PedalboardEffectCategory;  // Effect category
  description: string;              // Brief description
  tags: string[];                   // Searchable tags

  // Parameter schema for this model
  parameters: EffectParameterSchema;

  // Tone characteristics
  characteristics: {
    gain: 'low' | 'medium' | 'high' | 'extreme';  // Gain range
    tone: 'dark' | 'neutral' | 'bright';           // Tonal color
    character: string[];                            // ['warm', 'smooth', 'vintage']
  };
}

/**
 * Traditional (non-neural) effect types
 */
export type TraditionalEffectType =
  | 'waveshaper'      // Simple waveshaper distortion
  | 'eq3band'         // 3-band EQ
  | 'eq4band'         // 4-band EQ
  | 'lowpass'         // Low-pass filter
  | 'highpass'        // High-pass filter
  | 'bandpass'        // Band-pass filter
  | 'compressor'      // Dynamics compressor
  | 'limiter'         // Limiter
  | 'gain'            // Clean gain/boost
  | 'mixer';          // Utility mixer

/**
 * Individual effect in the pedalboard chain
 */
export interface PedalboardEffect {
  id: string;                           // Unique instance ID
  enabled: boolean;                     // Bypass switch
  type: 'neural' | 'traditional';       // Effect type

  // For neural models
  modelIndex?: number;                  // GuitarML model index (0-36)
  modelName?: string;                   // Display name cache

  // For traditional effects
  effectType?: TraditionalEffectType;   // Built-in effect type

  // Current parameter values (key: parameter ID, value: 0-100)
  parameters: Record<string, number>;

  // UI state
  collapsed?: boolean;                  // Minimize effect in UI
  color?: string;                       // Custom color for visual grouping
}

/**
 * Routing configuration for parallel processing
 */
export interface ParallelRouting {
  enabled: boolean;
  splits: {
    id: string;
    split: number;                      // Split point in chain (effect index)
    mixA: number;                       // Mix level for path A (0-100)
    mixB: number;                       // Mix level for path B (0-100)
    pathA: string[];                    // Effect IDs in path A
    pathB: string[];                    // Effect IDs in path B
    merge: number;                      // Merge point in chain (effect index)
  }[];
}

/**
 * Complete pedalboard configuration
 */
export interface NeuralPedalboard {
  enabled: boolean;                     // Master bypass
  chain: PedalboardEffect[];            // Ordered array of effects

  // Global controls
  inputGain: number;                    // Pre-gain (0-100)
  outputGain: number;                   // Master output level (0-100)

  // Advanced routing (Phase 3)
  routing?: ParallelRouting;            // Parallel processing configuration

  // UI state
  collapsed?: boolean;                  // Collapse entire pedalboard in UI
}

/**
 * Pedalboard preset
 */
export interface PedalboardPreset {
  id: string;
  name: string;
  description: string;
  category: 'classic' | 'heavy' | 'clean' | 'experimental' | 'bass' | 'custom';
  author?: string;
  tags: string[];

  // The pedalboard configuration
  pedalboard: NeuralPedalboard;

  // Metadata
  created?: string;
  modified?: string;
  favorite?: boolean;
}

/**
 * Factory presets for common pedalboard configurations
 */
export interface PedalboardPresetLibrary {
  classic: PedalboardPreset[];
  heavy: PedalboardPreset[];
  clean: PedalboardPreset[];
  experimental: PedalboardPreset[];
  bass: PedalboardPreset[];
  custom: PedalboardPreset[];
}

/**
 * IR (Impulse Response) for cabinet simulation
 */
export interface CabinetIR {
  id: string;
  name: string;
  category: 'guitar' | 'bass' | 'custom';
  description: string;

  // IR data
  url?: string;                         // URL to IR file
  buffer?: AudioBuffer;                 // Loaded IR buffer

  // Characteristics
  speaker: string;                      // "4x12 Marshall", "1x12 Fender"
  mic: string;                          // "SM57", "Condenser"
  position: string;                     // "On-axis", "Off-axis"
}

/**
 * Default parameter values for common controls
 */
export const DEFAULT_PARAMETERS = {
  drive: { name: 'Drive', id: 'drive', value: 50, default: 50, min: 0, max: 100, unit: '%', curve: 'exponential' as const },
  tone: { name: 'Tone', id: 'tone', value: 50, default: 50, min: 0, max: 100, unit: '%', curve: 'linear' as const },
  level: { name: 'Level', id: 'level', value: 75, default: 75, min: 0, max: 100, unit: '%', curve: 'linear' as const },
  dryWet: { name: 'Mix', id: 'dryWet', value: 100, default: 100, min: 0, max: 100, unit: '%', curve: 'linear' as const },
  presence: { name: 'Presence', id: 'presence', value: 50, default: 50, min: 0, max: 100, unit: '%', curve: 'linear' as const },
  bass: { name: 'Bass', id: 'bass', value: 50, default: 50, min: 0, max: 100, unit: '%', curve: 'linear' as const },
  mid: { name: 'Mid', id: 'mid', value: 50, default: 50, min: 0, max: 100, unit: '%', curve: 'linear' as const },
  treble: { name: 'Treble', id: 'treble', value: 50, default: 50, min: 0, max: 100, unit: '%', curve: 'linear' as const },
  gain: { name: 'Gain', id: 'gain', value: 50, default: 50, min: 0, max: 100, unit: 'dB', curve: 'linear' as const },
  output: { name: 'Output', id: 'output', value: 75, default: 75, min: 0, max: 100, unit: 'dB', curve: 'linear' as const },
};

/**
 * Default empty pedalboard
 */
export const DEFAULT_PEDALBOARD: NeuralPedalboard = {
  enabled: false,
  chain: [],
  inputGain: 100,
  outputGain: 100,
};
