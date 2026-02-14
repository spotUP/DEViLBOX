/**
 * SynthDescriptor - Type definitions for the Synth Registry
 *
 * Each synth in DEViLBOX is described by a SynthDescriptor object.
 * This replaces the giant switch statements in InstrumentFactory and ToneEngine.
 */

import type { ToneAudioNode } from 'tone';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';

export type SynthCategory = 'tone' | 'wasm' | 'wam' | 'native';
export type LoadMode = 'eager' | 'lazy';

export interface TriggerOptions {
  accent?: boolean;
  slide?: boolean;
  hammer?: boolean;
  period?: number;
  channelIndex?: number;
  config: InstrumentConfig;
}

export interface ParameterDef {
  key: string;
  label: string;
  group?: string;
  type: 'knob' | 'select' | 'toggle' | 'text';
  min?: number;
  max?: number;
  default: number;
  options?: { value: number; label: string }[];
}

export interface RomConfig {
  required?: boolean;
  extensions?: string[];
  description?: string;
}

export interface SynthDescriptor {
  /** SynthType string — must match the SynthType union */
  id: string;
  /** Display name for UI */
  name: string;
  /** Category: tone (Tone.js), wasm, wam, native */
  category: SynthCategory;
  /** 'eager' = register at startup, 'lazy' = on first use */
  loadMode: LoadMode;

  // Factory — how to create an instance
  create: (config: InstrumentConfig) => ToneAudioNode | DevilboxSynth;

  // Audio
  /** Volume normalization offset in dB (replaces VOLUME_NORMALIZATION_OFFSETS) */
  volumeOffsetDb?: number;
  /** true = bypass AmigaFilter (native synths route to synthBus) — determined by isDevilboxSynth at runtime */
  useSynthBus?: boolean;
  /** true = one instance shared across channels (Furnace, TB-303, etc.) */
  sharedInstance?: boolean;

  // Trigger hooks — replace ToneEngine instanceof checks
  onTriggerAttack?: (synth: any, note: string, time: number, velocity: number, opts: TriggerOptions) => boolean;
  onTriggerRelease?: (synth: any, note: string | undefined, time: number, opts: TriggerOptions) => boolean;

  // UI
  controlsComponent?: string;
  hardwareComponent?: string;

  // Metadata
  parameters?: ParameterDef[];
  presetIds?: string[];
  commands?: string[];
  romConfig?: RomConfig;
}
