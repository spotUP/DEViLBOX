/**
 * Shared constants and types for tracker input handlers.
 */
import type { MutableRefObject } from 'react';
import type { CursorPosition, BlockSelection } from '@/types/tracker';

// Track currently held notes to prevent retriggering and enable proper release
export interface HeldNote {
  note: string;
  xmNote: number;        // XM note number (1-96) for recording note-off
  instrumentId: number;
  channelIndex: number;  // Channel where this note was placed (for multi-channel)
}

// Shared refs passed from the composition hook to sub-hooks
export interface TrackerInputRefs {
  cursorRef: MutableRefObject<CursorPosition>;
  selectionRef: MutableRefObject<BlockSelection | null>;
}

// FT2 piano key mapping (QWERTY → notes)
export const NOTE_MAP: Record<string, { note: string; octaveOffset: number }> = {
  // Bottom row (lower octave)
  z: { note: 'C', octaveOffset: 0 },
  s: { note: 'C#', octaveOffset: 0 },
  x: { note: 'D', octaveOffset: 0 },
  d: { note: 'D#', octaveOffset: 0 },
  c: { note: 'E', octaveOffset: 0 },
  v: { note: 'F', octaveOffset: 0 },
  g: { note: 'F#', octaveOffset: 0 },
  b: { note: 'G', octaveOffset: 0 },
  h: { note: 'G#', octaveOffset: 0 },
  n: { note: 'A', octaveOffset: 0 },
  j: { note: 'A#', octaveOffset: 0 },
  m: { note: 'B', octaveOffset: 0 },
  ',': { note: 'C', octaveOffset: 1 },
  // Top row (higher octave)
  q: { note: 'C', octaveOffset: 1 },
  '2': { note: 'C#', octaveOffset: 1 },
  w: { note: 'D', octaveOffset: 1 },
  '3': { note: 'D#', octaveOffset: 1 },
  e: { note: 'E', octaveOffset: 1 },
  r: { note: 'F', octaveOffset: 1 },
  '5': { note: 'F#', octaveOffset: 1 },
  t: { note: 'G', octaveOffset: 1 },
  '6': { note: 'G#', octaveOffset: 1 },
  y: { note: 'A', octaveOffset: 1 },
  '7': { note: 'A#', octaveOffset: 1 },
  u: { note: 'B', octaveOffset: 1 },
  i: { note: 'C', octaveOffset: 2 },
  '9': { note: 'C#', octaveOffset: 2 },
  o: { note: 'D', octaveOffset: 2 },
  '0': { note: 'D#', octaveOffset: 2 },
  p: { note: 'E', octaveOffset: 2 },
};

// Alt+Q..I track jump mapping (tracks 0-7)
export const ALT_TRACK_MAP_1: Record<string, number> = {
  q: 0, w: 1, e: 2, r: 3, t: 4, y: 5, u: 6, i: 7,
};

// Alt+A..K track jump mapping (tracks 8-15)
export const ALT_TRACK_MAP_2: Record<string, number> = {
  a: 8, s: 9, d: 10, f: 11, g: 12, h: 13, j: 14, k: 15,
};

// Hex digit keys
export const HEX_DIGITS_ALL = '0123456789ABCDEFabcdef';

// FT2 Volume Column Effect Keys (VOL1 position)
export const VOL1_KEY_MAP: Record<string, number> = {
  '0': 0x0,  // 0x00-0x0F - nothing (or set volume 0 with second digit)
  '1': 0x1,  // 0x10-0x1F - set volume 0-15
  '2': 0x2,  // 0x20-0x2F - set volume 16-31
  '3': 0x3,  // 0x30-0x3F - set volume 32-47
  '4': 0x4,  // 0x40-0x4F - set volume 48-63 (0x50 = 64)
  '-': 0x6,  // 0x60-0x6F - volume slide down
  '+': 0x7,  // 0x70-0x7F - volume slide up
  'd': 0x8,  // 0x80-0x8F - fine volume down
  'u': 0x9,  // 0x90-0x9F - fine volume up
  's': 0xA,  // 0xA0-0xAF - set vibrato speed
  'v': 0xB,  // 0xB0-0xBF - vibrato
  'p': 0xC,  // 0xC0-0xCF - set panning
  'l': 0xD,  // 0xD0-0xDF - pan slide left
  'r': 0xE,  // 0xE0-0xEF - pan slide right
  'm': 0xF,  // 0xF0-0xFF - tone portamento
};

// FT2 Effect Type Keys (EFX0 position) - 36 effect commands
export const EFFECT_TYPE_KEY_MAP: Record<string, number> = {
  '0': 0x00, '1': 0x01, '2': 0x02, '3': 0x03, '4': 0x04,
  '5': 0x05, '6': 0x06, '7': 0x07, '8': 0x08, '9': 0x09,
  'a': 0x0A, 'b': 0x0B, 'c': 0x0C, 'd': 0x0D, 'e': 0x0E, 'f': 0x0F,
  'g': 0x10, 'h': 0x11, 'i': 0x12, 'j': 0x13, 'k': 0x14, 'l': 0x15,
  'm': 0x16, 'n': 0x17, 'o': 0x18, 'p': 0x19, 'q': 0x1A, 'r': 0x1B,
  's': 0x1C, 't': 0x1D, 'u': 0x1E, 'v': 0x1F, 'w': 0x20, 'x': 0x21,
  'y': 0x22, 'z': 0x23,
};
