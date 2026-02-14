/**
 * EffectDescriptor - Type definitions for the Effect Registry
 *
 * Each effect in DEViLBOX is described by an EffectDescriptor object.
 * This mirrors SynthDescriptor but for audio effects.
 * Replaces the giant switch statements in InstrumentFactory.createEffect()
 * and getDefaultEffectParameters().
 */

import type { ToneAudioNode } from 'tone';
import type { EffectConfig, EffectCategory } from '@typedefs/instrument';
import type { DevilboxSynth } from '@typedefs/synth';
import type { LoadMode, ParameterDef } from './SynthDescriptor';

export interface EffectDescriptor {
  /** AudioEffectType string — must match the AudioEffectType union */
  id: string;
  /** Display name for UI */
  name: string;
  /** Category: tonejs, wasm, wam, neural, buzzmachine */
  category: EffectCategory;
  /** UI group: 'Distortion', 'Filter', 'Reverb & Delay', etc. */
  group: string;
  /** Short description */
  description?: string;
  /** 'eager' = register at startup, 'lazy' = on first use */
  loadMode: LoadMode;

  /** Factory — create an effect instance from config */
  create: (config: EffectConfig) => Promise<ToneAudioNode | DevilboxSynth>;
  /** Return default parameters for this effect type */
  getDefaultParameters: () => Record<string, number | string>;

  /** Optional parameter metadata for data-driven UI */
  parameters?: ParameterDef[];
  /** Visual editor component name */
  editorComponent?: string;
  /** Parameter keys that support BPM sync */
  bpmSyncParams?: string[];
}
