/**
 * Synth Categories - Type definitions
 */

import type { SynthType, InstrumentConfig } from '@typedefs/instrument';

export interface SynthInfo {
  type: SynthType;
  name: string;
  shortName: string;
  description: string;
  bestFor: string[];
  icon: string; // Lucide icon name
  color: string; // Tailwind color class
  defaultConfig?: Partial<InstrumentConfig>; // Optional default config (e.g., xrns.synthType for WaveSabre variants)
}

export interface SynthCategory {
  id: string;
  name: string;
  description: string;
  synths: SynthInfo[];
}
