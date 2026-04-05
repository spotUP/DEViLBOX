/**
 * MDLEncoder — Encodes TrackerCell back to Digitrakker (.mdl) binary format.
 *
 * MDL uses compressed per-track data with run-length encoding and back-references.
 * The encoding format is:
 *   byte = (x << 2) | y
 *   y=0: skip (x+1) empty rows
 *   y=1: repeat previous note (x+1) times
 *   y=2: copy note from row x
 *   y=3: new note data; x = flags bitmask:
 *     bit 0 = note byte follows
 *     bit 1 = sample byte follows
 *     bit 2 = volume byte follows
 *     bit 3 = effects byte follows (low=e1, high=e2)
 *     bit 4 = param1 byte follows
 *     bit 5 = param2 byte follows
 *
 * Since MDL uses complex per-track compression with variable-length encoding,
 * this encoder uses UADEVariablePatternLayout.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const MDLNOTE_NOTE    = 1 << 0;
const MDLNOTE_SAMPLE  = 1 << 1;
const MDLNOTE_VOLUME  = 1 << 2;
const MDLNOTE_EFFECTS = 1 << 3;
const MDLNOTE_PARAM1  = 1 << 4;
const MDLNOTE_PARAM2  = 1 << 5;

/**
 * Reverse-translate XM effect → MDL effect command pair.
 * Returns { e1, e2, p1, p2 } where e1/e2 are 4-bit MDL command indices
 * and p1/p2 are 8-bit parameters.
 */
function reverseEffects(cell: TrackerCell): { e1: number; e2: number; p1: number; p2: number } {
  let e1 = 0, p1 = 0, e2 = 0, p2 = 0;

  // Primary effect → MDL command 1
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  if (effTyp !== 0 || eff !== 0) {
    const { cmd, param } = xmToMDL(effTyp, eff);
    e1 = cmd;
    p1 = param;
  }

  // Secondary effect → MDL command 2
  const effTyp2 = cell.effTyp2 ?? 0;
  const eff2 = cell.eff2 ?? 0;
  if (effTyp2 !== 0 || eff2 !== 0) {
    const { cmd, param } = xmToMDL(effTyp2, eff2);
    // MDL command 2 uses values 1-6 (mapped from G-L = 16-21 in convertMDLCommand)
    // Commands 1-6 map back directly for column 2
    if (cmd >= 16 && cmd <= 21) {
      e2 = cmd - 15;
    } else {
      e2 = cmd;
    }
    p2 = param;
  }

  return { e1, e2, p1, p2 };
}

/** Reverse XM effect type to MDL command index */
function xmToMDL(effTyp: number, eff: number): { cmd: number; param: number } {
  switch (effTyp) {
    case 0x01: return { cmd: 0x01, param: eff }; // Porta up
    case 0x02: return { cmd: 0x02, param: eff }; // Porta down
    case 0x03: return { cmd: 0x03, param: eff }; // Tone porta
    case 0x04: return { cmd: 0x04, param: eff }; // Vibrato
    case 0x00: return { cmd: eff !== 0 ? 0x05 : 0x00, param: eff }; // Arpeggio
    case 0x0F: return { cmd: eff >= 0x20 ? 0x07 : 0x0F, param: eff }; // Tempo/Speed
    case 0x08: return { cmd: 0x08, param: Math.min(0x7F, eff >> 1) }; // Panning
    case 0x0B: return { cmd: 0x0B, param: eff }; // Position jump
    case 0x10: return { cmd: 0x0C, param: Math.min(0xFF, eff * 2 - 1) }; // Global vol
    case 0x0D: return { cmd: 0x0D, param: eff }; // Pattern break
    case 0x0A: return { cmd: 0x10, param: eff }; // Vol slide → G/H
    case 0x1B: return { cmd: 0x12, param: eff }; // Retrig
    case 0x07: return { cmd: 0x13, param: eff }; // Tremolo
    case 0x1D: return { cmd: 0x14, param: eff }; // Tremor
    default: return { cmd: 0, param: 0 };
  }
}

/** Check if a cell is empty */
function isCellEmpty(cell: TrackerCell): boolean {
  return (cell.note ?? 0) === 0
    && (cell.instrument ?? 0) === 0
    && (cell.volume ?? 0) === 0
    && (cell.effTyp ?? 0) === 0
    && (cell.eff ?? 0) === 0
    && (cell.effTyp2 ?? 0) === 0
    && (cell.eff2 ?? 0) === 0;
}

/**
 * Encode one channel's pattern rows into MDL compressed track format.
 * Uses simple encoding: skip empty rows, emit new note data for non-empty.
 */
function encodeMDLTrack(rows: TrackerCell[]): Uint8Array {
  const parts: number[] = [];
  let emptyCount = 0;

  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];

    if (isCellEmpty(cell)) {
      emptyCount++;
      // Flush when we reach max skip (63+1 = 64 rows) or end of pattern
      if (emptyCount >= 64 || row === rows.length - 1) {
        // y=0: skip (x+1) empty rows → x = emptyCount - 1
        parts.push(((emptyCount - 1) << 2) | 0);
        emptyCount = 0;
      }
      continue;
    }

    // Flush any pending empty rows
    if (emptyCount > 0) {
      parts.push(((emptyCount - 1) << 2) | 0);
      emptyCount = 0;
    }

    // y=3: new note data
    let flags = 0;
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const vol = cell.volume ?? 0;
    const { e1, e2, p1, p2 } = reverseEffects(cell);

    if (note !== 0) flags |= MDLNOTE_NOTE;
    if (instr !== 0) flags |= MDLNOTE_SAMPLE;
    if (vol !== 0) flags |= MDLNOTE_VOLUME;
    const hasEffects = e1 !== 0 || e2 !== 0;
    if (hasEffects) flags |= MDLNOTE_EFFECTS;
    if (p1 !== 0) flags |= MDLNOTE_PARAM1;
    if (p2 !== 0) flags |= MDLNOTE_PARAM2;

    parts.push((flags << 2) | 3);

    if (flags & MDLNOTE_NOTE) {
      // MDL note: 1-based, >120 = key-off
      if (note === 97) parts.push(0xFF); // key-off
      else parts.push(note); // 1-based XM note = 1-based MDL note
    }
    if (flags & MDLNOTE_SAMPLE) parts.push(instr);
    if (flags & MDLNOTE_VOLUME) {
      // Reverse: MDL vol 1-255 → XM vol = (vol + 2) / 4
      // So MDL vol = xmVol * 4 - 2
      parts.push(Math.max(1, Math.min(255, vol * 4 - 2)));
    }
    if (flags & MDLNOTE_EFFECTS) {
      parts.push((e2 << 4) | (e1 & 0x0F));
    }
    if (flags & MDLNOTE_PARAM1) parts.push(p1);
    if (flags & MDLNOTE_PARAM2) parts.push(p2);
  }

  return new Uint8Array(parts);
}

const mdlEncoder: VariableLengthEncoder = {
  formatId: 'mdl',
  encodePattern(rows: TrackerCell[], _channel: number): Uint8Array {
    return encodeMDLTrack(rows);
  },
};

registerVariableEncoder(mdlEncoder);

export { mdlEncoder, encodeMDLTrack };
