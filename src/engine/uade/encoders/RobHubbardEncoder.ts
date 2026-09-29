/**
 * RobHubbardEncoder — variable-length whole-block encoder for Rob Hubbard.
 *
 * Rob Hubbard modules are compiled 68k Amiga executables whose "song" is a
 * per-channel command BYTE STREAM, not a fixed cell grid. Each channel steps an
 * ordered list of blocks; each block is a contiguous run of variable-length
 * commands ending in the -124 end marker. There is no per-cell file offset, so a
 * fixed-cell codec is meaningless here (the old placeholder round-tripped ~22% of
 * fabricated offsets into player code).
 *
 * The parser (RobHubbardParser) decodes each block into ONE TrackerCell per stream
 * command and stashes that command's exact source bytes in the cell carriers:
 *   cell.cutoff = command byte length (1..2) — also the "real command" marker;
 *                 padding rows leave it undefined
 *   cell.period = source byte 0
 *   cell.pan    = source byte 1 (when length >= 2)
 * encodePattern concatenates those carrier bytes to reproduce the block verbatim.
 */

import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
// ProTracker naming (note 13 = C-1 = 856), one table: src/lib/amiga/periodNotes.ts.
import { noteToPeriod as xmNoteToPeriod } from '@/lib/amiga/periodNotes';

/**
 * Best-effort ProTracker MOD 4-byte cell encoder — retained ONLY for the
 * RobHubbardExporter's "no original binary" fallback path, which produces a
 * non-playable stub file. It is NOT registered for round-trip; RH round-trips via
 * the variable encoder below.
 */
export function encodeRobHubbardCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const period = xmNoteToPeriod(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  out[0] = (instr & 0xF0) | ((period >> 8) & 0x0F);
  out[1] = period & 0xFF;
  out[2] = ((instr & 0x0F) << 4) | (effTyp & 0x0F);
  out[3] = eff & 0xFF;

  return out;
}

/**
 * Encode one channel's block: concatenate each command row's carrier bytes.
 * Rows without a carrier (cutoff === undefined) are grid padding and emit nothing.
 * Reproduces the original block byte-for-byte for an unedited pattern.
 */
export function encodeRobHubbardPattern(rows: TrackerCell[]): Uint8Array {
  const out: number[] = [];
  for (const cell of rows) {
    const len = cell.cutoff;
    if (len === undefined) continue; // padding row — not a real stream command
    out.push((cell.period ?? 0) & 0xFF);
    if (len >= 2) out.push((cell.pan ?? 0) & 0xFF);
    if (len >= 3) out.push((cell.resonance ?? 0) & 0xFF);
  }
  return new Uint8Array(out);
}

export const robHubbardEncoder: VariableLengthEncoder = {
  formatId: 'robHubbard',
  encodePattern: (rows: TrackerCell[]) => encodeRobHubbardPattern(rows),
};

registerVariableEncoder(robHubbardEncoder);
