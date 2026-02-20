/**
 * Synth panel layout registry — maps synth type to layout descriptor.
 */

import type { SynthPanelLayout } from '../synthPanelTypes';
import { TB303_LAYOUT } from './tb303';
import { DEXED_LAYOUT } from './dexed';
import { DUB_SIREN_LAYOUT } from './dubSiren';

/** Map from SynthType string to layout descriptor */
export const SYNTH_LAYOUTS: Record<string, SynthPanelLayout> = {
  TB303: TB303_LAYOUT,
  Buzz3o3: TB303_LAYOUT,
  Dexed: DEXED_LAYOUT,
  DubSiren: DUB_SIREN_LAYOUT,
};

/**
 * Get the layout for a synth type. Returns undefined for types not yet mapped.
 */
export function getSynthLayout(synthType: string): SynthPanelLayout | undefined {
  return SYNTH_LAYOUTS[synthType];
}
