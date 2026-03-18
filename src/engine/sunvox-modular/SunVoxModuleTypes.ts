/**
 * SunVoxModuleTypes — Static metadata for all 41 SunVox module types.
 *
 * Each entry maps the SunVox internal type string (used by sv_new_module)
 * to display metadata for the modular editor UI.
 */

import type { ModuleCategory } from '@/types/modular';

export interface SunVoxModuleType {
  /** Internal SunVox type string (passed to sv_new_module) */
  typeString: string;
  /** Human-readable display name */
  displayName: string;
  /** Category for shelf grouping */
  category: ModuleCategory | 'control';
  /** Module header color */
  color: string;
  /** True if this module generates audio (vs processing/routing) */
  isGenerator: boolean;
}

export const SUNVOX_MODULE_TYPES: SunVoxModuleType[] = [
  // ── Generators ──
  { typeString: 'Analog generator', displayName: 'Analog Generator', category: 'source', color: '#e74c3c', isGenerator: true },
  { typeString: 'Generator',        displayName: 'Generator',        category: 'source', color: '#e74c3c', isGenerator: true },
  { typeString: 'FM',               displayName: 'FM Synth',         category: 'source', color: '#e67e22', isGenerator: true },
  { typeString: 'Kicker',           displayName: 'Kicker',           category: 'source', color: '#c0392b', isGenerator: true },
  { typeString: 'DrumSynth',        displayName: 'Drum Synth',       category: 'source', color: '#c0392b', isGenerator: true },
  { typeString: 'Sampler',          displayName: 'Sampler',          category: 'source', color: '#2980b9', isGenerator: true },
  { typeString: 'SpectraVoice',     displayName: 'SpectraVoice',     category: 'source', color: '#8e44ad', isGenerator: true },
  { typeString: 'Input',            displayName: 'Input',            category: 'io',     color: '#27ae60', isGenerator: true },
  { typeString: 'Vorbis player',    displayName: 'Vorbis Player',    category: 'source', color: '#2980b9', isGenerator: true },

  // ── Filters ──
  { typeString: 'Filter',           displayName: 'Filter',           category: 'filter', color: '#3498db', isGenerator: false },
  { typeString: 'Filter Pro',       displayName: 'Filter Pro',       category: 'filter', color: '#2980b9', isGenerator: false },
  { typeString: 'EQ',               displayName: 'EQ',               category: 'filter', color: '#2c3e50', isGenerator: false },

  // ── Effects ──
  { typeString: 'Distortion',       displayName: 'Distortion',       category: 'utility', color: '#e74c3c', isGenerator: false },
  { typeString: 'Flanger',          displayName: 'Flanger',          category: 'utility', color: '#1abc9c', isGenerator: false },
  { typeString: 'Delay',            displayName: 'Delay',            category: 'utility', color: '#16a085', isGenerator: false },
  { typeString: 'Echo',             displayName: 'Echo',             category: 'utility', color: '#16a085', isGenerator: false },
  { typeString: 'Reverb',           displayName: 'Reverb',           category: 'utility', color: '#1abc9c', isGenerator: false },
  { typeString: 'Compressor',       displayName: 'Compressor',       category: 'utility', color: '#7f8c8d', isGenerator: false },
  { typeString: 'WaveShaper',       displayName: 'WaveShaper',       category: 'utility', color: '#e74c3c', isGenerator: false },
  { typeString: 'DC Blocker',       displayName: 'DC Blocker',       category: 'utility', color: '#95a5a6', isGenerator: false },
  { typeString: 'Pitch shifter',    displayName: 'Pitch Shifter',    category: 'utility', color: '#9b59b6', isGenerator: false },
  { typeString: 'Vibrato',          displayName: 'Vibrato',          category: 'utility', color: '#f39c12', isGenerator: false },
  { typeString: 'Vocal filter',     displayName: 'Vocal Filter',     category: 'filter', color: '#e67e22', isGenerator: false },
  { typeString: 'Loop',             displayName: 'Loop',             category: 'utility', color: '#27ae60', isGenerator: false },

  // ── Amplifiers / Mixers ──
  { typeString: 'Amplifier',        displayName: 'Amplifier',        category: 'amplifier', color: '#f39c12', isGenerator: false },
  { typeString: 'Sound2Ctl',        displayName: 'Sound to Control', category: 'control' as ModuleCategory, color: '#9b59b6', isGenerator: false },
  { typeString: 'Modulator',        displayName: 'Modulator',        category: 'modulator', color: '#8e44ad', isGenerator: false },

  // ── Control / Routing ──
  { typeString: 'MultiSynth',       displayName: 'MultiSynth',       category: 'io',     color: '#27ae60', isGenerator: false },
  { typeString: 'MultiCtl',         displayName: 'Multi Control',    category: 'control' as ModuleCategory, color: '#9b59b6', isGenerator: false },
  { typeString: 'Ctl2Note',         displayName: 'Ctl to Note',      category: 'control' as ModuleCategory, color: '#9b59b6', isGenerator: false },
  { typeString: 'Velocity2Ctl',     displayName: 'Velocity to Ctl',  category: 'control' as ModuleCategory, color: '#9b59b6', isGenerator: false },
  { typeString: 'Pitch2Ctl',        displayName: 'Pitch to Ctl',     category: 'control' as ModuleCategory, color: '#9b59b6', isGenerator: false },
  { typeString: 'Pitch detector',   displayName: 'Pitch Detector',   category: 'control' as ModuleCategory, color: '#9b59b6', isGenerator: false },
  { typeString: 'Feedback',         displayName: 'Feedback',         category: 'io',     color: '#27ae60', isGenerator: false },
  { typeString: 'GPIO',             displayName: 'GPIO',             category: 'io',     color: '#27ae60', isGenerator: false },
  { typeString: 'Glide',            displayName: 'Glide',            category: 'control' as ModuleCategory, color: '#1abc9c', isGenerator: false },

  // ── Modulators / LFO ──
  { typeString: 'LFO',              displayName: 'LFO',              category: 'modulator', color: '#f39c12', isGenerator: false },

  // ── Envelope ──
  { typeString: 'ADSR',             displayName: 'ADSR Envelope',    category: 'envelope', color: '#2ecc71', isGenerator: false },

  // ── Misc ──
  { typeString: 'MetaModule',       displayName: 'MetaModule',       category: 'utility', color: '#34495e', isGenerator: false },
  { typeString: 'Side Chain Compressor', displayName: 'Side Chain Comp', category: 'utility', color: '#7f8c8d', isGenerator: false },
  { typeString: 'Output',           displayName: 'Output',           category: 'io',     color: '#2ecc71', isGenerator: false },
];

/** Lookup by typeString */
export const SUNVOX_MODULE_TYPE_MAP = new Map(
  SUNVOX_MODULE_TYPES.map(t => [t.typeString, t])
);
