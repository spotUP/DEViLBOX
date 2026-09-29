/**
 * DavidWhittakerEncoder — variable-length whole-block encoder for David Whittaker.
 *
 * David Whittaker modules are compiled 68k Amiga executables whose "song" is a
 * per-channel command BYTE STREAM, not a fixed cell grid. Each contiguous block
 * runs from a pattern-start address to its -128 end marker. There is no per-cell
 * file offset to address, so a fixed-cell codec is meaningless here (the old
 * placeholder encoder round-tripped ~7% of fabricated offsets into player code).
 *
 * The parser (DavidWhittakerParser) decodes each block into ONE TrackerCell per
 * stream command, and stashes that command's exact source bytes in the cell
 * carriers:
 *   cell.cutoff    = command byte length (1..3)  — also the "this row is a real
 *                    command" marker; padding rows leave it undefined
 *   cell.period    = source byte 0
 *   cell.pan       = source byte 1 (when length >= 2)
 *   cell.resonance = source byte 2 (when length >= 3)
 *
 * encodePattern concatenates those carrier bytes back in row order, reproducing
 * the block byte-for-byte. This is a legitimate carrier (each row maps 1:1 to a
 * real command at a real file offset — not a fabricated grid), and it is the
 * only faithful byte-exact inverse for a variable command stream.
 */

import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';
// ProTracker naming (note 13 = C-1 = 856), one table: src/lib/amiga/periodNotes.ts.
import { noteToPeriod as xmNoteToPeriod } from '@/lib/amiga/periodNotes';

/**
 * Best-effort ProTracker MOD 4-byte cell encoder — retained ONLY for the
 * DavidWhittakerExporter's "no original binary" fallback path, which produces a
 * non-playable stub file. It is NOT registered for round-trip; DW round-trips via
 * the variable encoder below.
 */
export function encodeDavidWhittakerCell(cell: TrackerCell): Uint8Array {
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
export function encodeDavidWhittakerPattern(rows: TrackerCell[]): Uint8Array {
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

export const davidWhittakerEncoder: VariableLengthEncoder = {
  formatId: 'davidWhittaker',
  encodePattern: (rows: TrackerCell[]) => encodeDavidWhittakerPattern(rows),
};

registerVariableEncoder(davidWhittakerEncoder);
// NOTE: the fixed-cell placeholder registration was removed — DW round-trips via
// the variable encoder above. encodeDavidWhittakerCell stays exported only for the
// exporter's non-playable fallback path.
