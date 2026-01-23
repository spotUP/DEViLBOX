/**
 * Sample Pack Types - Definitions for sample pack system
 */

export interface SampleInfo {
  /** Filename (without path) */
  filename: string;
  /** Display name (cleaned up from filename) */
  name: string;
  /** Category within the pack */
  category: SampleCategory;
  /** Full URL path to the sample */
  url: string;
}

export interface SamplePack {
  /** Unique identifier for the pack */
  id: string;
  /** Display name */
  name: string;
  /** Pack author/creator */
  author: string;
  /** Description */
  description: string;
  /** Cover image URL (optional) */
  coverImage?: string;
  /** Base path for samples */
  basePath: string;
  /** Sample categories available in this pack */
  categories: SampleCategory[];
  /** All samples in the pack, organized by category */
  samples: Record<SampleCategory, SampleInfo[]>;
  /** Total sample count */
  sampleCount: number;
}

export type SampleCategory =
  | 'kicks'
  | 'snares'
  | 'hihats'
  | 'claps'
  | 'percussion'
  | 'fx'
  | 'bass'
  | 'leads'
  | 'pads'
  | 'loops'
  | 'vocals'
  | 'other';

export const SAMPLE_CATEGORY_LABELS: Record<SampleCategory, string> = {
  kicks: 'Kicks',
  snares: 'Snares',
  hihats: 'Hi-Hats',
  claps: 'Claps',
  percussion: 'Percussion',
  fx: 'FX',
  bass: 'Bass',
  leads: 'Leads',
  pads: 'Pads',
  loops: 'Loops',
  vocals: 'Vocals',
  other: 'Other',
};

export const SAMPLE_CATEGORY_ICONS: Record<SampleCategory, string> = {
  kicks: 'Drum',
  snares: 'Disc3',
  hihats: 'Triangle',
  claps: 'Hand',
  percussion: 'Music',
  fx: 'Sparkles',
  bass: 'AudioWaveform',
  leads: 'Zap',
  pads: 'Cloud',
  loops: 'Repeat',
  vocals: 'Mic',
  other: 'FileAudio',
};
