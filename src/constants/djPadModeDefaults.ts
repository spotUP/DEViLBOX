/**
 * DJ Pad Mode Defaults — default pad mappings for the 4 DJ pad modes.
 *
 * Uses design-system color constants from utils/colors.ts for consistent theming.
 */

import type { DjFxActionId } from '../engine/drumpad/DjFxActions';
import type { ScratchActionId } from '../types/drumpad';
import {
  DJ_STUTTER, DJ_DELAY, DJ_FILTER, DJ_REVERB, DJ_MODULATION,
  DJ_DISTORTION, DJ_TAPE, DJ_ONESHOT,
  DJ_SCRATCH, DJ_SCRATCH_ADV, DJ_SCRATCH_EXP, DJ_SCRATCH_CTL,
  DJ_DECK_FX,
  colorToHex,
} from '../utils/colors';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ModePadMapping {
  label: string;
  category: string;
  color: string;      // CSS hex '#rrggbb'
  colorNum: number;    // 0xRRGGBB for GL
}

export interface DjFxPadMapping extends ModePadMapping {
  actionId: DjFxActionId;
}

export interface OneShotPadMapping extends ModePadMapping {
  presetIndex: number;
}

export interface ScratchPadMapping extends ModePadMapping {
  actionId: ScratchActionId;
}

// ─── Category → Color maps ───────────────────────────────────────────────────

export const DJ_FX_CATEGORY_COLORS: Record<string, number> = {
  'Stutter': DJ_STUTTER,
  'Delay': DJ_DELAY,
  'Filter': DJ_FILTER,
  'Reverb': DJ_REVERB,
  'Modulation': DJ_MODULATION,
  'Distortion': DJ_DISTORTION,
  'Tape': DJ_TAPE,
  'Deck': DJ_DECK_FX,
};

export const ONE_SHOT_CATEGORY_COLORS: Record<string, number> = {
  'Horns': DJ_ONESHOT,
  'Sirens': DJ_DISTORTION,
  'Impacts': DJ_MODULATION,
  'Transitions': DJ_TAPE,
  'Risers': DJ_FILTER,
  'Lasers': DJ_SCRATCH,
  'Noise': DJ_DELAY,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fxPad(label: string, category: string, colorNum: number, actionId: DjFxActionId): DjFxPadMapping {
  return { label, category, color: colorToHex(colorNum), colorNum, actionId };
}

function osPad(label: string, category: string, colorNum: number, presetIndex: number): OneShotPadMapping {
  return { label, category, color: colorToHex(colorNum), colorNum, presetIndex };
}

function scPad(label: string, category: string, colorNum: number, actionId: ScratchActionId): ScratchPadMapping {
  return { label, category, color: colorToHex(colorNum), colorNum, actionId };
}

// ─── Default DJ FX Pads (16) ─────────────────────────────────────────────────

export const DEFAULT_DJFX_PADS: DjFxPadMapping[] = [
  // Row 1: Deck filter & echo (real DJ engine effects)
  fxPad('HPF Sweep',    'Deck',        DJ_DECK_FX,     'fx_deck_hpf_sweep'),
  fxPad('LPF Sweep',    'Deck',        DJ_DECK_FX,     'fx_deck_lpf_sweep'),
  fxPad('Echo Out',     'Deck',        DJ_DELAY,       'fx_deck_echo_out'),
  fxPad('Brake',        'Deck',        DJ_DISTORTION,  'fx_deck_brake'),
  // Row 2: EQ kills & filter reset (real DJ engine effects)
  fxPad('Kill Lo',      'Deck',        DJ_STUTTER,     'fx_deck_kill_lo'),
  fxPad('Kill Mid',     'Deck',        DJ_DELAY,       'fx_deck_kill_mid'),
  fxPad('Kill Hi',      'Deck',        DJ_DECK_FX,     'fx_deck_kill_hi'),
  fxPad('Filt Reset',   'Deck',        DJ_FILTER,      'fx_deck_filter_reset'),
  // Row 3: Beat jumps (real DJ engine effects)
  fxPad('Jump −16',     'Deck',        DJ_MODULATION,  'fx_deck_jump_m16'),
  fxPad('Jump −4',      'Deck',        DJ_MODULATION,  'fx_deck_jump_m4'),
  fxPad('Jump +4',      'Deck',        DJ_MODULATION,  'fx_deck_jump_p4'),
  fxPad('Jump +16',     'Deck',        DJ_MODULATION,  'fx_deck_jump_p16'),
  // Row 4: Performance FX & sounds (master bus)
  fxPad('Stutter 1/8',  'Stutter',     DJ_STUTTER,     'fx_stutter_8'),
  fxPad('Dub Siren',    'Delay',       DJ_DELAY,       'fx_dub_siren'),
  fxPad('Air Horn',     'Delay',       DJ_ONESHOT,     'fx_air_horn'),
  fxPad('Noise Riser',  'Filter',      DJ_FILTER,      'fx_noise_riser'),
];

// ─── Default One-Shot Pads (16) ──────────────────────────────────────────────

export const DEFAULT_ONESHOT_PADS: OneShotPadMapping[] = [
  // Row 1: Horns (4) — instant recognition, DJ staples
  osPad('Air Horn',      'Horns',       DJ_ONESHOT,     0),   // DJ_AIR_HORN
  osPad('Reggae Horn',   'Horns',       DJ_ONESHOT,     1),   // REGGAETON_HORN
  osPad('Dub Horn',      'Horns',       DJ_ONESHOT,     5),   // DUB_HORN
  osPad('Foghorn',       'Horns',       DJ_ONESHOT,     2),   // FOGHORN
  // Row 2: Sirens (4) — hold-and-modulate with joystick
  osPad('Dub Siren',     'Sirens',      DJ_DISTORTION,  21),  // DUB_SIREN
  osPad('Rave Siren',    'Sirens',      DJ_DISTORTION,  22),  // RAVE_SIREN
  osPad('Wobble',        'Sirens',      DJ_DISTORTION,  25),  // WOBBLE_SIREN
  osPad('Nuclear',       'Sirens',      DJ_DISTORTION,  24),  // NUCLEAR_ALARM
  // Row 3: Impacts & FX (4) — punctuation and transitions
  osPad('Sub Drop',      'Impacts',     DJ_MODULATION,  11),  // SUB_DROP
  osPad('Boom',          'Impacts',     DJ_MODULATION,  12),  // BOOM
  osPad('Earthquake',    'Impacts',     DJ_MODULATION,  14),  // EARTHQUAKE
  osPad('Dub Echo',      'Transitions', DJ_TAPE,        30),  // ECHO_WASHOUT (Dub Echo)
  // Row 4: Lasers & Noise (4) — sci-fi and texture
  osPad('DJ Laser',      'Lasers',      DJ_SCRATCH,     17),  // DJ_LASER
  osPad('Glitch Zap',    'Lasers',      DJ_SCRATCH,     18),  // GLITCH_ZAP
  osPad('Pew Pew',       'Lasers',      DJ_SCRATCH,     19),  // PEW_PEW
  osPad('Acid Sweep',    'Transitions', DJ_FILTER,      31),  // REWIND (Acid Sweep)
];

// ─── Default Scratch Pads (16) ───────────────────────────────────────────────

export const DEFAULT_SCRATCH_PADS: ScratchPadMapping[] = [
  // Basic x4
  scPad('Baby',          'Basic',       DJ_SCRATCH,     'scratch_baby'),
  scPad('Transform',     'Basic',       DJ_SCRATCH,     'scratch_trans'),
  scPad('Flare',         'Basic',       DJ_SCRATCH,     'scratch_flare'),
  scPad('Chirp',         'Basic',       DJ_SCRATCH,     'scratch_chirp'),
  // Advanced x4
  scPad('Crab',          'Advanced',    DJ_SCRATCH_ADV, 'scratch_crab'),
  scPad('Orbit',         'Advanced',    DJ_SCRATCH_ADV, 'scratch_orbit'),
  scPad('Hydro',         'Advanced',    DJ_SCRATCH_ADV, 'scratch_hydro'),
  scPad('Tear',          'Advanced',    DJ_SCRATCH_ADV, 'scratch_tear'),
  // Expert x4
  scPad('Uzi',           'Expert',      DJ_SCRATCH_EXP, 'scratch_uzi'),
  scPad('8-Crab',        'Expert',      DJ_SCRATCH_EXP, 'scratch_8crab'),
  scPad('3-Flare',       'Expert',      DJ_SCRATCH_EXP, 'scratch_3flare'),
  scPad('Twiddle',       'Expert',      DJ_SCRATCH_EXP, 'scratch_twiddle'),
  // Special x3
  scPad('Laser',         'Special',     DJ_SCRATCH_EXP, 'scratch_laser'),
  scPad('Phaser',        'Special',     DJ_SCRATCH_EXP, 'scratch_phaser'),
  scPad('Drag',          'Special',     DJ_SCRATCH_EXP, 'scratch_drag'),
  // Control x1
  scPad('Stop',          'Control',     DJ_SCRATCH_CTL, 'scratch_stop'),
];
