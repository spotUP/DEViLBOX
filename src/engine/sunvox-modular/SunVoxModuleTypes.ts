/**
 * SunVoxModuleTypes — Static metadata table for all 41 SunVox module types.
 *
 * Each entry maps a SunVox internal type string to display metadata used by
 * the modular editor (category, color, generator flag).
 */

import type { ModuleCategory } from '@/types/modular';

export interface SunVoxModuleType {
  typeString: string;
  displayName: string;
  category: ModuleCategory | 'control';
  color: string;
  isGenerator: boolean;
}

export const SUNVOX_MODULE_TYPES: SunVoxModuleType[] = [
  // ── Generators (source) ───────────────────────────────────────────────
  { typeString: 'Analog generator', displayName: 'Analog Generator', category: 'source', color: '#4a9de0', isGenerator: true },
  { typeString: 'Generator',        displayName: 'Generator',        category: 'source', color: '#5aade0', isGenerator: true },
  { typeString: 'FM',               displayName: 'FM',               category: 'source', color: '#6abde0', isGenerator: true },
  { typeString: 'Kicker',           displayName: 'Kicker',           category: 'source', color: '#3a8dd0', isGenerator: true },
  { typeString: 'DrumSynth',        displayName: 'DrumSynth',        category: 'source', color: '#2a7dc0', isGenerator: true },
  { typeString: 'Sampler',          displayName: 'Sampler',          category: 'source', color: '#7acde0', isGenerator: true },
  { typeString: 'SpectraVoice',     displayName: 'SpectraVoice',     category: 'source', color: '#8addf0', isGenerator: true },
  { typeString: 'Vorbis player',    displayName: 'Vorbis Player',    category: 'source', color: '#9aedf0', isGenerator: true },

  // ── Input (io, generator) ─────────────────────────────────────────────
  { typeString: 'Input', displayName: 'Input', category: 'io', color: '#e0a04a', isGenerator: true },

  // ── Filters ───────────────────────────────────────────────────────────
  { typeString: 'Filter',       displayName: 'Filter',       category: 'filter', color: '#e06a4a', isGenerator: false },
  { typeString: 'Filter Pro',   displayName: 'Filter Pro',   category: 'filter', color: '#e07a5a', isGenerator: false },
  { typeString: 'EQ',           displayName: 'EQ',           category: 'filter', color: '#e08a6a', isGenerator: false },
  { typeString: 'Vocal filter', displayName: 'Vocal Filter', category: 'filter', color: '#e09a7a', isGenerator: false },

  // ── Effects (utility) ─────────────────────────────────────────────────
  { typeString: 'Distortion',    displayName: 'Distortion',    category: 'utility', color: '#a0a0a0', isGenerator: false },
  { typeString: 'Flanger',       displayName: 'Flanger',       category: 'utility', color: '#b0b0b0', isGenerator: false },
  { typeString: 'Delay',         displayName: 'Delay',         category: 'utility', color: '#909090', isGenerator: false },
  { typeString: 'Echo',          displayName: 'Echo',          category: 'utility', color: '#888888', isGenerator: false },
  { typeString: 'Reverb',        displayName: 'Reverb',        category: 'utility', color: '#989898', isGenerator: false },
  { typeString: 'Compressor',    displayName: 'Compressor',    category: 'utility', color: '#a8a8a8', isGenerator: false },
  { typeString: 'WaveShaper',    displayName: 'WaveShaper',    category: 'utility', color: '#b8b8b8', isGenerator: false },
  { typeString: 'DC Blocker',    displayName: 'DC Blocker',    category: 'utility', color: '#808080', isGenerator: false },
  { typeString: 'Pitch shifter', displayName: 'Pitch Shifter', category: 'utility', color: '#c0c0c0', isGenerator: false },
  { typeString: 'Vibrato',       displayName: 'Vibrato',       category: 'utility', color: '#c8c8c8', isGenerator: false },
  { typeString: 'Loop',          displayName: 'Loop',          category: 'utility', color: '#787878', isGenerator: false },

  // ── Amplifier ─────────────────────────────────────────────────────────
  { typeString: 'Amplifier', displayName: 'Amplifier', category: 'amplifier', color: '#4ae04a', isGenerator: false },

  // ── Control ───────────────────────────────────────────────────────────
  { typeString: 'Sound2Ctl',       displayName: 'Sound2Ctl',       category: 'control', color: '#d0d04a', isGenerator: false },
  { typeString: 'MultiCtl',        displayName: 'MultiCtl',        category: 'control', color: '#c0c04a', isGenerator: false },
  { typeString: 'Ctl2Note',        displayName: 'Ctl2Note',        category: 'control', color: '#b0b04a', isGenerator: false },
  { typeString: 'Velocity2Ctl',    displayName: 'Velocity2Ctl',    category: 'control', color: '#a0a04a', isGenerator: false },
  { typeString: 'Pitch2Ctl',       displayName: 'Pitch2Ctl',       category: 'control', color: '#90904a', isGenerator: false },
  { typeString: 'Pitch detector',  displayName: 'Pitch Detector',  category: 'control', color: '#80804a', isGenerator: false },
  { typeString: 'Glide',           displayName: 'Glide',           category: 'control', color: '#70704a', isGenerator: false },

  // ── Modulators ────────────────────────────────────────────────────────
  { typeString: 'Modulator', displayName: 'Modulator', category: 'modulator', color: '#e04ae0', isGenerator: false },
  { typeString: 'LFO',      displayName: 'LFO',       category: 'modulator', color: '#d04ad0', isGenerator: false },

  // ── Envelope ──────────────────────────────────────────────────────────
  { typeString: 'ADSR', displayName: 'ADSR', category: 'envelope', color: '#e0e04a', isGenerator: false },

  // ── I/O ───────────────────────────────────────────────────────────────
  { typeString: 'MultiSynth', displayName: 'MultiSynth', category: 'io', color: '#e0b04a', isGenerator: false },
  { typeString: 'Feedback',   displayName: 'Feedback',   category: 'io', color: '#e0c04a', isGenerator: false },
  { typeString: 'GPIO',       displayName: 'GPIO',       category: 'io', color: '#e0d04a', isGenerator: false },
  { typeString: 'Output',     displayName: 'Output',     category: 'io', color: '#e0e04a', isGenerator: false },

  // ── Misc (utility) ────────────────────────────────────────────────────
  { typeString: 'MetaModule',              displayName: 'MetaModule',              category: 'utility', color: '#707070', isGenerator: false },
  { typeString: 'Side Chain Compressor',   displayName: 'Side Chain Compressor',   category: 'utility', color: '#686868', isGenerator: false },
];

/** Map from SunVox type string → SunVoxModuleType for fast lookup */
export const SUNVOX_MODULE_TYPE_MAP = new Map<string, SunVoxModuleType>(
  SUNVOX_MODULE_TYPES.map(t => [t.typeString, t])
);
