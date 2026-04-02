/**
 * JUCE WASM Synth Factory Presets
 * DX7 factory presets via VCED patch loading
 */

import type { InstrumentPreset } from '@typedefs/instrument';
import { DX7_VCED_PRESETS } from '../engine/dx7/dx7presets';

/**
 * Dexed (DX7) factory presets — all use native VCED patch loading
 * Each preset loads a 156-byte VCED patch directly into the engine via loadSysEx
 */
export const DX7_FACTORY_PRESETS: InstrumentPreset['config'][] = DX7_VCED_PRESETS.map(preset => ({
  name: `DX7 ${preset.name}`,
  type: 'synth' as const,
  synthType: 'DX7' as const,
  volume: -10,
  pan: 0,
  effects: [],
  dexedVcedPreset: preset.name,
}));

/** OBXf presets are loaded natively via the JUCE hardware UI preset browser */
export const OBXD_FACTORY_PRESETS: InstrumentPreset['config'][] = [];
