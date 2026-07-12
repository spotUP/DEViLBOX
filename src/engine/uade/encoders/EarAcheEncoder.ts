/**
 * EarAcheEncoder — Encodes TrackerCell back to EarAche (.ea) score bytes.
 *
 * An EarAche module is an "EASO" container: a 4-byte magic + a 6-entry u32 section
 * offset table (relative to byte 4), then a score command-stream at section[0]
 * followed by instrument / envelope / sample tables. The score is an opcode-driven
 * event byte-stream (0x19/0x1b/0x1c note+control ops, 0x31/0x36/0x38 args), not a
 * clean note/effect grid, so the faithful byte-exact inverse is a per-byte carrier.
 *
 * decodeCell (in EarAcheParser) stashes the exact source byte in the invisible
 * `period` carrier; this encoder reproduces it verbatim. Edited grid cells lack the
 * carrier and fall back to a rest byte. True note-level editing of the opcode stream
 * is future work; this codec's job is a byte-exact export round-trip over the real
 * located score region.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// A zero byte reads as a no-op / stream padding in the opcode dispatch.
const EA_REST = 0x00;

export function encodeEarAcheCell(cell: TrackerCell): Uint8Array {
  // Byte-exact carrier restore: reproduce the exact source byte when present.
  if (cell.period !== undefined) {
    return new Uint8Array([cell.period & 0xFF]);
  }
  return new Uint8Array([EA_REST]);
}

registerPatternEncoder('earAche', () => encodeEarAcheCell);

export { EA_REST };
