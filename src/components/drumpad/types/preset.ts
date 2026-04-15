/**
 * Preset types for the drum pad preset browser
 */

import type { InstrumentConfig } from '@typedefs/instrument';

export type PresetCategory = 
  | 'speech'
  | 'bass' 
  | 'lead' 
  | 'pad' 
  | 'pluck'
  | 'bell'
  | 'drums-kick'
  | 'drums-snare' 
  | 'drums-hihat'
  | 'drums-perc'
  | 'fx'
  | 'atmos'
  | 'chip'
  | 'vintage'
  | 'modern';

export interface PresetMetadata {
  id: string;
  name: string;
  synthType: string;
  category: PresetCategory;
  description?: string;
  tags?: string[];
  isFavorite?: boolean;
  config: Partial<InstrumentConfig>;
}

export interface PresetCollection {
  name: string;
  category: PresetCategory;
  presets: PresetMetadata[];
}

export interface PresetIndex {
  speech: PresetCollection[];
  bass: PresetCollection[];
  lead: PresetCollection[];
  drums: PresetCollection[];
  chip: PresetCollection[];
  fx: PresetCollection[];
  vintage: PresetCollection[];
  modern: PresetCollection[];
  other: PresetCollection[];
}
