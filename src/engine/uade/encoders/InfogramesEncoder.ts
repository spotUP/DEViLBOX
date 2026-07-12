/**
 * InfogramesEncoder — Encodes TrackerCell back to Infogrames (.dum) song bytes.
 *
 * The Infogrames (RobHubbard2) format is a TWO-file format: the .dum holds only the
 * song / sequence data (a header-pointer + track / note command streams), while the
 * samples live in an external .dum.set / .ins file loaded at runtime (see LoadFiles
 * in Infogrames.asm). The .dum therefore contains NO sample PCM — every byte is part
 * of the tune — but its note data is an opcode-driven command stream, not a clean
 * note/effect grid, so the faithful byte-exact inverse is a per-byte carrier.
 *
 * decodeCell (in InfogramesParser) stashes the exact source byte in the invisible
 * `period` carrier; this encoder reproduces it verbatim. Edited grid cells lack the
 * carrier and fall back to a zero byte. True note-level editing of the command stream
 * is future work; this codec's job is a byte-exact export round-trip over the song.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export function encodeInfogramesCell(cell: TrackerCell): Uint8Array {
  // Byte-exact carrier restore: reproduce the exact source byte when present.
  if (cell.period !== undefined) {
    return new Uint8Array([cell.period & 0xFF]);
  }
  return new Uint8Array([0x00]);
}

registerPatternEncoder('infogrames', () => encodeInfogramesCell);
