/**
 * GenericEncoderFactory — Declarative encoder generator for common cell layouts.
 *
 * Instead of writing each encoder from scratch, describe the cell layout and
 * let this factory generate the encode function. Covers the three dominant
 * Amiga tracker cell patterns:
 *
 * 1. ProTracker-style (4 bytes): period(12-bit) + instr(4+4) + effect(4+8)
 * 2. Note-index style (3-5 bytes): note-byte + instr-byte + [vol] + effect
 * 3. Compact packed (2-3 bytes): bit-level packing with split fields
 *
 * For truly unique formats, write a custom encoder instead.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from './UADEPatternEncoder';

// ── Amiga period table (C-1 to B-3, indices 0-35) ─────────────────────────────
const PERIOD_TABLE = [
  856,808,762,720,678,640,604,570,538,508,480,453,  // octave 1
  428,404,381,360,339,320,302,285,269,254,240,226,  // octave 2
  214,202,190,180,170,160,151,143,135,127,120,113,  // octave 3
];

/**
 * Convert XM note (1-96) to Amiga period. Returns 0 if out of range.
 * XM note range 13-48 maps to period table indices 0-35.
 */
function xmNoteToPeriod(xmNote: number): number {
  const idx = xmNote - 13;
  if (idx < 0 || idx >= PERIOD_TABLE.length) return 0;
  return PERIOD_TABLE[idx];
}

// ── Layout descriptors ──────────────────────────────────────────────────────────

/** Note encoding method */
export type NoteEncoding =
  | { type: 'period'; bits: 12 | 16 }         // Amiga period table
  | { type: 'index'; offset: number; max: number; noteOff?: number }  // Direct note index: raw = xmNote - offset
  | { type: 'bcd'; offset: number }            // BCD: (octave << 4 | semitone)
  ;

/** Effect command mapping: XM effect type → format-specific command byte */
export type EffectMap = Record<number, number>;

/** Describe a note-index style cell (most common after MOD) */
export interface NoteIndexLayout {
  kind: 'noteIndex';
  bytesPerCell: number;
  /** Byte layout: which field goes in which byte */
  fields: CellField[];
  /** How notes are encoded */
  noteEncoding: NoteEncoding;
  /** XM effect type → native effect command mapping (identity if omitted) */
  effectMap?: EffectMap;
}

/** A field in the cell byte layout */
export interface CellField {
  name: 'note' | 'instrument' | 'volume' | 'effTyp' | 'effParam';
  /** Byte offset in the cell */
  byte: number;
  /** Bit shift within the byte (0 = LSB-aligned) */
  shift?: number;
  /** Bit mask after shifting (default: 0xFF for full byte) */
  mask?: number;
  /** For split fields: additional fragment */
  highBits?: { byte: number; shift: number; mask: number; width: number };
}

/** Describe a ProTracker-compatible 4-byte cell */
export interface ProTrackerLayout {
  kind: 'protracker';
  /** XM effect type → native effect command mapping */
  effectMap?: EffectMap;
}

export type CellLayout = NoteIndexLayout | ProTrackerLayout;

// ── Standard ProTracker effect map (identity for most formats) ─────────────────
const PROTRACKER_EFFECTS: EffectMap = {
  0x00: 0x00, 0x01: 0x01, 0x02: 0x02, 0x03: 0x03,
  0x04: 0x04, 0x05: 0x05, 0x06: 0x06, 0x07: 0x07,
  0x08: 0x08, 0x09: 0x09, 0x0A: 0x0A, 0x0B: 0x0B,
  0x0C: 0x0C, 0x0D: 0x0D, 0x0E: 0x0E, 0x0F: 0x0F,
};

// ── Encoder generation ──────────────────────────────────────────────────────────

function encodeNote(note: number, encoding: NoteEncoding): number {
  if (note === 0) return 0;
  if (note === 97) {
    // Note-off: use noteOff value if defined
    if (encoding.type === 'index' && encoding.noteOff !== undefined) return encoding.noteOff;
    return 0;
  }
  switch (encoding.type) {
    case 'period':
      return xmNoteToPeriod(note);
    case 'index': {
      const raw = note - encoding.offset;
      return (raw >= 0 && raw <= encoding.max) ? raw : 0;
    }
    case 'bcd': {
      const raw = note - encoding.offset;
      if (raw < 0 || raw > 95) return 0;
      const octave = Math.floor(raw / 12);
      const semi = raw % 12;
      return (octave << 4) | semi;
    }
  }
}

function generateProTrackerEncoder(layout: ProTrackerLayout): (cell: TrackerCell) => Uint8Array {
  const effectMap = layout.effectMap ?? PROTRACKER_EFFECTS;

  return (cell: TrackerCell): Uint8Array => {
    const out = new Uint8Array(4);
    const period = xmNoteToPeriod(cell.note ?? 0);
    const instr = cell.instrument ?? 0;
    const effTyp = effectMap[cell.effTyp ?? 0] ?? 0;
    const eff = cell.eff ?? 0;

    // Standard MOD 4-byte packing
    out[0] = ((instr & 0xF0) | ((period >> 8) & 0x0F));
    out[1] = period & 0xFF;
    out[2] = ((instr & 0x0F) << 4) | (effTyp & 0x0F);
    out[3] = eff & 0xFF;
    return out;
  };
}

function generateNoteIndexEncoder(layout: NoteIndexLayout): (cell: TrackerCell) => Uint8Array {
  const effectMap = layout.effectMap ?? PROTRACKER_EFFECTS;

  return (cell: TrackerCell): Uint8Array => {
    const out = new Uint8Array(layout.bytesPerCell);
    const noteVal = encodeNote(cell.note ?? 0, layout.noteEncoding);
    const instrVal = cell.instrument ?? 0;
    const volVal = cell.volume ?? 0;
    const effTypVal = effectMap[cell.effTyp ?? 0] ?? (cell.effTyp ?? 0);
    const effParamVal = cell.eff ?? 0;

    const values: Record<string, number> = {
      note: noteVal,
      instrument: instrVal,
      volume: volVal,
      effTyp: effTypVal,
      effParam: effParamVal,
    };

    for (const field of layout.fields) {
      const val = values[field.name] ?? 0;
      const shift = field.shift ?? 0;
      const mask = field.mask ?? 0xFF;
      out[field.byte] |= ((val & mask) << shift);

      // Handle split fields (high bits in a different byte)
      if (field.highBits) {
        const hb = field.highBits;
        const highVal = (val >> (hb.width > 0 ? (Math.log2(mask + 1)) : 0)) & hb.mask;
        out[hb.byte] |= (highVal << hb.shift);
      }
    }

    return out;
  };
}

/**
 * Generate an encoder function from a declarative cell layout description.
 */
export function generateEncoder(layout: CellLayout): (cell: TrackerCell) => Uint8Array {
  switch (layout.kind) {
    case 'protracker':
      return generateProTrackerEncoder(layout);
    case 'noteIndex':
      return generateNoteIndexEncoder(layout);
  }
}

/**
 * Register a format encoder using a declarative layout description.
 * Convenience wrapper around generateEncoder + registerPatternEncoder.
 */
export function registerGenericEncoder(formatId: string, layout: CellLayout): void {
  const encoder = generateEncoder(layout);
  registerPatternEncoder(formatId, () => encoder);
}
