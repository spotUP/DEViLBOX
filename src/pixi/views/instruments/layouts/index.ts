/**
 * Synth panel layout registry — maps synth type to layout descriptor.
 */

import type { SynthPanelLayout } from '../synthPanelTypes';
import { TB303_LAYOUT } from './tb303';
import { DEXED_LAYOUT } from './dexed';
import { DUB_SIREN_LAYOUT } from './dubSiren';
import { OBXD_LAYOUT } from './obxd';
import { CHIP_SYNTH_LAYOUT } from './chipSynth';
import { HARMONIC_SYNTH_LAYOUT } from './harmonicSynth';
import { SPACE_LASER_LAYOUT } from './spaceLaser';
import { ODIN2_LAYOUT } from './odin2';
import { SURGE_LAYOUT } from './surge';
import { VITAL_LAYOUT } from './vital';

/** Map from SynthType string to layout descriptor */
export const SYNTH_LAYOUTS: Record<string, SynthPanelLayout> = {
  TB303: TB303_LAYOUT,
  Buzz3o3: TB303_LAYOUT,
  Dexed: DEXED_LAYOUT,
  DubSiren: DUB_SIREN_LAYOUT,
  OBXd: OBXD_LAYOUT,
  ChipSynth: CHIP_SYNTH_LAYOUT,
  HarmonicSynth: HARMONIC_SYNTH_LAYOUT,
  SpaceLaser: SPACE_LASER_LAYOUT,
  Odin2: ODIN2_LAYOUT,
  Surge: SURGE_LAYOUT,
  Vital: VITAL_LAYOUT,
};

/**
 * Get the layout for a synth type. Returns undefined for types not yet mapped.
 */
export function getSynthLayout(synthType: string): SynthPanelLayout | undefined {
  return SYNTH_LAYOUTS[synthType];
}
