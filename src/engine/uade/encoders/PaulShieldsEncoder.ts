/**
 * PaulShieldsEncoder — Encodes TrackerCell back to Paul Shields (.ps)
 * sequence/note-command-stream bytes.
 *
 * A Paul Shields module (player from Paul Shields.AMP.asm) stores its song as a
 * header + sample records + instrument/waveform tables, then a set of per-channel
 * sequence streams addressed by a 4-entry song-pointer table. Each channel stream
 * is an opcode-driven command byte-stream (JMP (PC,D0.W) dispatch), not a clean
 * note/effect grid, so the faithful byte-exact inverse is a per-byte carrier.
 *
 * decodeCell (in PaulShieldsParser) stashes the exact source byte in the invisible
 * `period` carrier; this encoder reproduces it verbatim. Edited grid cells lack the
 * carrier and fall back to a rest byte. True note-level editing of the command
 * stream is future work (the command-stream tick-grid recipe); this codec's job is
 * a byte-exact export round-trip over the real located sequence region.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// A zero byte reads as a no-op / stream terminator in the dispatch table.
const PS_REST = 0x00;

function encodePaulShieldsCell(cell: TrackerCell): Uint8Array {
  // Byte-exact carrier restore: reproduce the exact source byte when present.
  if (cell.period !== undefined) {
    return new Uint8Array([cell.period & 0xFF]);
  }
  // Edited cell: no clean note→command mapping for a dispatch stream — emit a rest.
  return new Uint8Array([PS_REST]);
}

registerPatternEncoder('paulShields', () => encodePaulShieldsCell);

export { encodePaulShieldsCell, PS_REST };
