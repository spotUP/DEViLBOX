/**
 * Chip waveform targets — length/depth/step constraints per chip.
 *
 * Switching targets resamples and requantizes the waveform to match.
 * Each target drives the grid, the length controls, and the visual
 * constraint shading.
 */

export type ChipTargetId =
  | 'generic-32x16'
  | 'generic-32x32'
  | 'generic-64x256'
  | 'generic-128x256'
  | 'generic-256x256'
  | 'gameboy'
  | 'fds'
  | 'n163'
  | 'gtultra';

export interface ChipTarget {
  id: ChipTargetId;
  name: string;
  maxValue: number;   // max sample value (0 .. maxValue inclusive)
  defaultLen: number; // default length in samples
  minLen: number;
  maxLen: number;
  lenStep: number;    // length quantum (N163 must be 4-aligned)
  lockedLen?: boolean; // disables length controls
  lockedDepth?: boolean; // disables height controls
  bitDepth: number;   // for display
  description: string;
}

export const CHIP_TARGETS: Record<ChipTargetId, ChipTarget> = {
  'generic-32x16': {
    id: 'generic-32x16',
    name: 'Generic 32×16',
    maxValue: 15,
    defaultLen: 32,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 4,
    description: '4-bit, 32 samples — Game Boy, Namco, WonderSwan',
  },
  'generic-32x32': {
    id: 'generic-32x32',
    name: 'Generic 32×32',
    maxValue: 31,
    defaultLen: 32,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 5,
    description: '5-bit, 32 samples',
  },
  'generic-64x256': {
    id: 'generic-64x256',
    name: 'Generic 64×256',
    maxValue: 255,
    defaultLen: 64,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 8,
    description: '8-bit, 64 samples',
  },
  'generic-128x256': {
    id: 'generic-128x256',
    name: 'Generic 128×256',
    maxValue: 255,
    defaultLen: 128,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 8,
    description: '8-bit, 128 samples',
  },
  'generic-256x256': {
    id: 'generic-256x256',
    name: 'Generic 256×256',
    maxValue: 255,
    defaultLen: 256,
    minLen: 4,
    maxLen: 256,
    lenStep: 1,
    bitDepth: 8,
    description: '8-bit, 256 samples (max resolution)',
  },
  gameboy: {
    id: 'gameboy',
    name: 'Game Boy',
    maxValue: 15,
    defaultLen: 32,
    minLen: 32,
    maxLen: 32,
    lenStep: 32,
    lockedLen: true,
    lockedDepth: true,
    bitDepth: 4,
    description: 'Wave RAM: 32 × 4-bit (fixed)',
  },
  fds: {
    id: 'fds',
    name: 'FDS',
    maxValue: 63,
    defaultLen: 32,
    minLen: 32,
    maxLen: 32,
    lenStep: 32,
    lockedLen: true,
    lockedDepth: true,
    bitDepth: 6,
    description: 'Famicom Disk System: 32 × 6-bit (fixed)',
  },
  n163: {
    id: 'n163',
    name: 'Namco N163',
    maxValue: 15,
    defaultLen: 32,
    minLen: 4,
    maxLen: 252,
    lenStep: 4,
    bitDepth: 4,
    description: 'N163: variable length, 4-byte aligned, 4-bit',
  },
  gtultra: {
    id: 'gtultra',
    name: 'GT Ultra (C64 SID)',
    maxValue: 255,
    defaultLen: 255,
    minLen: 1,
    maxLen: 255,
    lenStep: 1,
    bitDepth: 8,
    description: 'GoatTracker wave table: 255 × 8-bit entries',
  },
};

export const CHIP_TARGET_ORDER: ChipTargetId[] = [
  'generic-32x16',
  'generic-32x32',
  'generic-64x256',
  'generic-128x256',
  'generic-256x256',
  'gameboy',
  'fds',
  'n163',
  'gtultra',
];

/**
 * Snap a length value to the target's lenStep, within minLen/maxLen.
 */
export function snapLength(target: ChipTarget, len: number): number {
  const clamped = Math.max(target.minLen, Math.min(target.maxLen, len));
  return Math.round(clamped / target.lenStep) * target.lenStep;
}

/**
 * Pick the best-matching chip target for an existing wavetable.
 * Used to initialize the dropdown when editing an existing waveform.
 */
export function detectChipTarget(length: number, maxValue: number): ChipTargetId {
  if (length === 32 && maxValue === 15) return 'gameboy';
  if (length === 32 && maxValue === 63) return 'fds';
  if (length === 32 && maxValue === 31) return 'generic-32x32';
  if (maxValue === 15 && length % 4 === 0 && length >= 4 && length <= 252) {
    // Could be N163 or generic 32x16
    return length === 32 ? 'generic-32x16' : 'n163';
  }
  if (maxValue === 255) {
    if (length === 255) return 'gtultra';
    if (length === 64) return 'generic-64x256';
    if (length === 128) return 'generic-128x256';
    return 'generic-256x256';
  }
  return 'generic-32x16';
}
