/**
 * DJ Program Presets — factory DrumProgram instances for DJ performance modes.
 */

import { createEmptyProgram } from '../types/drumpad';
import type { DrumProgram, DubActionId, DubBusSettings } from '../types/drumpad';
import { DJ_ONE_SHOT_PRESETS } from './djOneShotPresets';
import { DEFAULT_DJFX_PADS, DEFAULT_ONESHOT_PADS, DEFAULT_SCRATCH_PADS } from './djPadModeDefaults';
import { PAD_INSTRUMENT_BASE } from '../types/drumpad';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DJPreset {
  id: string;
  name: string;
  description: string;
  create: () => DrumProgram;
  /**
   * Optional post-load side-effects: enable/patch the Dub Bus, flip global
   * drumpad settings, etc. Called by the UI after the program is saved.
   * Kept separate from create() so the program itself stays a pure factory.
   */
  onApply?: (store: {
    setDubBus: (patch: Partial<DubBusSettings>) => void;
  }) => void;
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

interface DubMapping {
  label: string;
  color: string;
  action: DubActionId;
  mode: 'oneshot' | 'sustain';
}

function applyDubActionPads(program: DrumProgram, startPad: number, pads: DubMapping[]): void {
  pads.forEach((m, i) => {
    const pad = program.pads[startPad + i];
    if (!pad) return;
    pad.name = m.label;
    pad.color = m.color;
    pad.dubAction = m.action;
    pad.playMode = m.mode;
  });
}

/**
 * Pad slot with an optional DJ one-shot preset — used to drop supporting
 * synth sounds (sirens, horns, risers) next to the dub-action pads in the
 * King Tubby kit. `presetName` is matched by name against DJ_ONE_SHOT_PRESETS.
 */
interface SynthMapping {
  label: string;
  color: string;
  presetName: string;
}

function applyOneShotByName(program: DrumProgram, startPad: number, pads: SynthMapping[]): void {
  pads.forEach((m, i) => {
    const pad = program.pads[startPad + i];
    if (!pad) return;
    const preset = DJ_ONE_SHOT_PRESETS.find((p) => p.name === m.presetName);
    if (!preset) {
      // Fall back to a plain named pad so the grid slot is still visible
      pad.name = m.label;
      pad.color = m.color;
      return;
    }
    pad.name = m.label;
    pad.color = m.color;
    pad.synthConfig = {
      id: PAD_INSTRUMENT_BASE + pad.id,
      name: preset.name ?? m.label,
      type: preset.type ?? 'synth',
      synthType: preset.synthType ?? 'Synth',
      effects: preset.effects ?? [],
      volume: preset.volume ?? 0,
      pan: preset.pan ?? 0,
      ...preset,
    } as import('../types/instrument/defaults').InstrumentConfig;
    pad.instrumentNote = 'C3';
  });
}

// ─── Presets ─────────────────────────────────────────────────────────────────

export const DJ_PAD_PRESETS: DJPreset[] = [
  {
    id: 'djfx-essential',
    name: 'DJ FX',
    description: 'DJ FX pads — stutter, delay, filter, reverb, modulation',
    create: () => {
      const program = createEmptyProgram('D-01', 'DJ FX Essential');
      applyDjFxPads(program, 0, 16);
      return program;
    },
  },
  {
    id: 'oneshots-live',
    name: 'One-Shots',
    description: 'One-shot pads — horns, sirens, impacts, risers',
    create: () => {
      const program = createEmptyProgram('D-02', 'One-Shots Live');
      applyOneShotPads(program, 0, 16);
      return program;
    },
  },
  {
    id: 'scratch-master',
    name: 'Scratch',
    description: 'Scratch pads — baby, flare, crab, orbit, and more',
    create: () => {
      const program = createEmptyProgram('D-03', 'Scratch Master');
      applyScratchPads(program, 0, 16);
      return program;
    },
  },
  {
    id: 'dj-complete',
    name: 'DJ Complete',
    description: 'Bank A: FX — Bank B: scratch patterns',
    create: () => {
      const program = createEmptyProgram('D-04', 'DJ Complete Kit');
      applyDjFxPads(program, 0, 8);
      applyScratchPads(program, 8, 8);
      return program;
    },
  },
  {
    id: 'king-tubby-dub',
    name: 'King Tubby Dub Kit',
    description: 'Dub throws, holds, mute-and-dub, siren, filter drop — plus siren/air-horn/riser pads. Enables the Dub Bus automatically.',
    create: () => {
      const program = createEmptyProgram('D-05', 'King Tubby Dub Kit');

      // ── Bank A (pads 1–8): throws + mute-and-dub + siren ─────────────
      // Throws are fire-and-forget, mute-and-dubs are hold-to-engage.
      const bankA: DubMapping[] = [
        // Row 1: throws per deck + global
        { label: 'Throw A',    color: '#ef4444', action: 'dub_throw_a',   mode: 'oneshot' },
        { label: 'Throw B',    color: '#ef4444', action: 'dub_throw_b',   mode: 'oneshot' },
        { label: 'Throw C',    color: '#ef4444', action: 'dub_throw_c',   mode: 'oneshot' },
        { label: 'Throw All',  color: '#991b1b', action: 'dub_throw_all', mode: 'oneshot' },
        // Row 2: mute-and-dub per deck + siren
        { label: 'Mute/Dub A', color: '#8b5cf6', action: 'dub_mute_a',    mode: 'sustain' },
        { label: 'Mute/Dub B', color: '#8b5cf6', action: 'dub_mute_b',    mode: 'sustain' },
        { label: 'Mute/Dub C', color: '#8b5cf6', action: 'dub_mute_c',    mode: 'sustain' },
        { label: 'Siren',      color: '#06b6d4', action: 'dub_siren',     mode: 'sustain' },
      ];
      applyDubActionPads(program, 0, bankA);

      // ── Bank B (pads 9–16): holds + filter drop + supporting synths ──
      const bankBDub: DubMapping[] = [
        { label: 'Hold A',       color: '#f59e0b', action: 'dub_hold_a',      mode: 'sustain' },
        { label: 'Hold B',       color: '#f59e0b', action: 'dub_hold_b',      mode: 'sustain' },
        { label: 'Hold C',       color: '#f59e0b', action: 'dub_hold_c',      mode: 'sustain' },
        { label: 'Hold All',     color: '#b45309', action: 'dub_hold_all',    mode: 'sustain' },
        { label: 'Filter Drop',  color: '#0891b2', action: 'dub_filter_drop', mode: 'sustain' },
      ];
      applyDubActionPads(program, 8, bankBDub);

      // Pads 14–16: supporting one-shot synths — classic sound-system tools
      // that pair naturally with the dub moves. Each is a full synth pad so
      // you can re-pitch / tweak the sound from the pad editor.
      const bankBSynths: SynthMapping[] = [
        { label: 'Dub Siren',   color: '#fb923c', presetName: 'Dub Siren' },
        { label: 'Air Horn',    color: '#fbbf24', presetName: 'DJ Air Horn' },
        { label: 'Noise Riser', color: '#ec4899', presetName: 'Noise Riser' },
      ];
      applyOneShotByName(program, 13, bankBSynths);

      return program;
    },
    // Flip the bus on and dial in dub-flattering defaults so the kit sounds
    // right the instant it loads. User can still fiddle via the Dub Bus panel.
    onApply: (store) => {
      store.setDubBus({
        enabled: true,
        returnGain: 0.82,
        hpfCutoff: 200,
        springWet: 0.45,
        echoIntensity: 0.6,
        echoWet: 0.55,
        echoRateMs: 280,
        sidechainAmount: 0.5,
        deckTapAmount: 0.9,
        throwBeats: 0.5,
        sirenFeedback: 0.85,
        filterDropHz: 220,
      });
    },
  },
  {
    id: 'dub-moves-minimal',
    name: 'Dub Moves (Minimal)',
    description: 'Compact 8-pad layout: throws + holds only. Fits any 8-pad controller.',
    create: () => {
      const program = createEmptyProgram('D-06', 'Dub Moves');
      const moves: DubMapping[] = [
        { label: 'Throw A',   color: '#ef4444', action: 'dub_throw_a',   mode: 'oneshot' },
        { label: 'Throw B',   color: '#ef4444', action: 'dub_throw_b',   mode: 'oneshot' },
        { label: 'Throw C',   color: '#ef4444', action: 'dub_throw_c',   mode: 'oneshot' },
        { label: 'Throw All', color: '#991b1b', action: 'dub_throw_all', mode: 'oneshot' },
        { label: 'Hold A',    color: '#f59e0b', action: 'dub_hold_a',    mode: 'sustain' },
        { label: 'Hold B',    color: '#f59e0b', action: 'dub_hold_b',    mode: 'sustain' },
        { label: 'Hold C',    color: '#f59e0b', action: 'dub_hold_c',    mode: 'sustain' },
        { label: 'Siren',     color: '#06b6d4', action: 'dub_siren',     mode: 'sustain' },
      ];
      applyDubActionPads(program, 0, moves);
      return program;
    },
    onApply: (store) => {
      store.setDubBus({ enabled: true });
    },
  },
];
