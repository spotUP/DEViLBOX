/**
 * DJ Program Presets — factory DrumProgram instances for DJ performance modes.
 */

import { createEmptyProgram } from '../types/drumpad';
import type { DrumProgram } from '../types/drumpad';
import { DJ_ONE_SHOT_PRESETS } from './djOneShotPresets';
import { DEFAULT_DJFX_PADS, DEFAULT_ONESHOT_PADS, DEFAULT_SCRATCH_PADS } from './djPadModeDefaults';
import { PAD_INSTRUMENT_BASE } from '../types/drumpad';

// ─── Interfaces ──────────────────────────────────────────────────────────────

import type { PadMode } from '../types/drumpad';

export interface DJPreset {
  id: string;
  name: string;
  description: string;
  modes: PadMode[];  // Empty array = show in all modes
  create: () => DrumProgram;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyDjFxPads(program: DrumProgram, startPad: number, count: number): void {
  for (let i = 0; i < count && i < DEFAULT_DJFX_PADS.length; i++) {
    const mapping = DEFAULT_DJFX_PADS[i];
    const pad = program.pads[startPad + i];
    if (!pad) continue;
    pad.name = mapping.label;
    pad.color = mapping.color;
    pad.djFxAction = mapping.actionId;
    pad.playMode = 'sustain'; // Hold to engage
  }
}

function applyOneShotPads(program: DrumProgram, startPad: number, count: number): void {
  for (let i = 0; i < count && i < DEFAULT_ONESHOT_PADS.length; i++) {
    const mapping = DEFAULT_ONESHOT_PADS[i];
    const pad = program.pads[startPad + i];
    if (!pad) continue;
    pad.name = mapping.label;
    pad.color = mapping.color;
    const preset = DJ_ONE_SHOT_PRESETS[mapping.presetIndex];
    if (preset) {
      // Ensure all required InstrumentConfig fields are present
      pad.synthConfig = {
        id: PAD_INSTRUMENT_BASE + pad.id,
        name: preset.name ?? mapping.label,
        type: preset.type ?? 'synth',
        synthType: preset.synthType ?? 'Synth',
        effects: preset.effects ?? [],
        volume: preset.volume ?? 0,
        pan: preset.pan ?? 0,
        ...preset,
      } as import('../types/instrument/defaults').InstrumentConfig;
      pad.instrumentNote = 'C3';
      
      // Debug logging
      if (process.env.NODE_ENV === 'development' && i === 0) {
        console.log('[applyOneShotPads] First pad config:', {
          padId: pad.id,
          name: pad.name,
          synthType: pad.synthConfig.synthType,
          instrumentNote: pad.instrumentNote,
          hasEffects: !!pad.synthConfig.effects,
        });
      }
    }
  }
}

function applyScratchPads(program: DrumProgram, startPad: number, count: number): void {
  for (let i = 0; i < count && i < DEFAULT_SCRATCH_PADS.length; i++) {
    const mapping = DEFAULT_SCRATCH_PADS[i];
    const pad = program.pads[startPad + i];
    if (!pad) continue;
    pad.name = mapping.label;
    pad.color = mapping.color;
    pad.scratchAction = mapping.actionId;
  }
}

// ─── Presets ─────────────────────────────────────────────────────────────────

export const DJ_PAD_PRESETS: DJPreset[] = [
  {
    id: 'djfx-essential',
    name: 'DJ FX (Bank A)',
    description: '16 DJ FX pads in Bank A — stutter, delay, filter, reverb, modulation',
    modes: [],  // Show in all modes
    create: () => {
      const program = createEmptyProgram('D-01', 'DJ FX Essential');
      applyDjFxPads(program, 0, 16);
      return program;
    },
  },
  {
    id: 'oneshots-live',
    name: 'One-Shots (Bank A)',
    description: '16 one-shot pads in Bank A — horns, sirens, impacts, risers',
    modes: [],  // Show in all modes
    create: () => {
      const program = createEmptyProgram('D-02', 'One-Shots Live');
      applyOneShotPads(program, 0, 16);
      return program;
    },
  },
  {
    id: 'scratch-master',
    name: 'Scratch (Bank A)',
    description: '16 scratch pads in Bank A — baby, flare, crab, orbit, and more',
    modes: [],  // Show in all modes
    create: () => {
      const program = createEmptyProgram('D-03', 'Scratch Master');
      applyScratchPads(program, 0, 16);
      return program;
    },
  },
  {
    id: 'dj-complete',
    name: 'DJ Complete (A+B+C)',
    description: 'FX in Bank A, one-shots in Bank B, scratch in Bank C',
    modes: [],  // Show in all modes
    create: () => {
      const program = createEmptyProgram('D-04', 'DJ Complete Kit');
      applyDjFxPads(program, 0, 16);
      applyOneShotPads(program, 16, 16);
      applyScratchPads(program, 32, 16);
      return program;
    },
  },
];
