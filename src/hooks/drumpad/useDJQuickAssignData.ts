/**
 * useDJQuickAssignData — Shared data for quick-assign operations.
 *
 * Organizes DJ FX, One Shot, Scratch, and Synth preset data into
 * categorized arrays. Used by the context menu "Quick Assign" submenu
 * and the pad setup wizard.
 */

import { useMemo } from 'react';
import { getDjFxByCategory, type DjFxAction } from '@/engine/drumpad/DjFxActions';
import { DJ_ONE_SHOT_PRESETS } from '@/constants/djOneShotPresets';
import {
  DEFAULT_DJFX_PADS,
  DEFAULT_ONESHOT_PADS,
  DEFAULT_SCRATCH_PADS,
  DJ_FX_CATEGORY_COLORS,
  ONE_SHOT_CATEGORY_COLORS,
  type DjFxPadMapping,
  type OneShotPadMapping,
  type ScratchPadMapping,
} from '@/constants/djPadModeDefaults';

// ── Synth quick-assign presets ──────────────────────────────────────────────

export interface SynthQuickPreset {
  label: string;
  machine: '808' | '909';
  drumType: string;
  subType: string;
  note: string;
}

/** All available drum machine voices for quick assignment */
export const SYNTH_QUICK_PRESETS: SynthQuickPreset[] = [
  // TR-808 voices
  { label: '808 Kick',       machine: '808', drumType: 'kick',     subType: 'kick',      note: 'C4' },
  { label: '808 Snare',      machine: '808', drumType: 'snare',    subType: 'snare',     note: 'C4' },
  { label: '808 Clap',       machine: '808', drumType: 'clap',     subType: 'clap',      note: 'C4' },
  { label: '808 Rimshot',    machine: '808', drumType: 'rimshot',  subType: 'rimshot',   note: 'C4' },
  { label: '808 Closed Hat', machine: '808', drumType: 'hihat',    subType: 'closedHat', note: 'C4' },
  { label: '808 Open Hat',   machine: '808', drumType: 'hihat',    subType: 'openHat',   note: 'C4' },
  { label: '808 Low Tom',    machine: '808', drumType: 'tom',      subType: 'tomLow',    note: 'C4' },
  { label: '808 Mid Tom',    machine: '808', drumType: 'tom',      subType: 'tomMid',    note: 'C4' },
  { label: '808 High Tom',   machine: '808', drumType: 'tom',      subType: 'tomHigh',   note: 'C4' },
  { label: '808 Cymbal',     machine: '808', drumType: 'cymbal',   subType: 'cymbal',    note: 'C4' },
  { label: '808 Clave',      machine: '808', drumType: 'clave',    subType: 'clave',     note: 'C4' },
  { label: '808 Cowbell',    machine: '808', drumType: 'cowbell',   subType: 'cowbell',   note: 'C4' },
  { label: '808 Maracas',    machine: '808', drumType: 'maracas',  subType: 'maracas',   note: 'C4' },
  { label: '808 Conga Low',  machine: '808', drumType: 'conga',    subType: 'congaLow',  note: 'C4' },
  { label: '808 Conga Mid',  machine: '808', drumType: 'conga',    subType: 'congaMid',  note: 'C4' },
  { label: '808 Conga High', machine: '808', drumType: 'conga',    subType: 'congaHigh', note: 'C4' },
  // TR-909 voices
  { label: '909 Kick',       machine: '909', drumType: 'kick',     subType: 'kick',      note: 'C4' },
  { label: '909 Snare',      machine: '909', drumType: 'snare',    subType: 'snare',     note: 'C4' },
  { label: '909 Clap',       machine: '909', drumType: 'clap',     subType: 'clap',      note: 'C4' },
  { label: '909 Rimshot',    machine: '909', drumType: 'rimshot',  subType: 'rimshot',   note: 'C4' },
  { label: '909 Closed Hat', machine: '909', drumType: 'hihat',    subType: 'closedHat', note: 'C4' },
  { label: '909 Open Hat',   machine: '909', drumType: 'hihat',    subType: 'openHat',   note: 'C4' },
  { label: '909 Low Tom',    machine: '909', drumType: 'tom',      subType: 'tomLow',    note: 'C4' },
  { label: '909 Mid Tom',    machine: '909', drumType: 'tom',      subType: 'tomMid',    note: 'C4' },
  { label: '909 High Tom',   machine: '909', drumType: 'tom',      subType: 'tomHigh',   note: 'C4' },
  { label: '909 Crash',      machine: '909', drumType: 'cymbal',   subType: 'crash',     note: 'C4' },
  { label: '909 Ride',       machine: '909', drumType: 'cymbal',   subType: 'ride',      note: 'C4' },
];

// ── Hook ────────────────────────────────────────────────────────────────────

export interface QuickAssignData {
  /** DJ FX actions grouped by category */
  djFxByCategory: Record<string, DjFxAction[]>;
  /** Default DJ FX pad mappings (16) */
  djFxPads: DjFxPadMapping[];
  /** Default one-shot pad mappings (16) */
  oneShotPads: OneShotPadMapping[];
  /** Default scratch pad mappings (16) */
  scratchPads: ScratchPadMapping[];
  /** One-shot presets (full array for wizard) */
  oneShotPresets: typeof DJ_ONE_SHOT_PRESETS;
  /** Synth drum voice presets */
  synthPresets: SynthQuickPreset[];
  /** Category colors */
  fxCategoryColors: Record<string, number>;
  oneShotCategoryColors: Record<string, number>;
}

export function useDJQuickAssignData(): QuickAssignData {
  return useMemo(() => ({
    djFxByCategory: getDjFxByCategory(),
    djFxPads: DEFAULT_DJFX_PADS,
    oneShotPads: DEFAULT_ONESHOT_PADS,
    scratchPads: DEFAULT_SCRATCH_PADS,
    oneShotPresets: DJ_ONE_SHOT_PRESETS,
    synthPresets: SYNTH_QUICK_PRESETS,
    fxCategoryColors: DJ_FX_CATEGORY_COLORS,
    oneShotCategoryColors: ONE_SHOT_CATEGORY_COLORS,
  }), []);
}
