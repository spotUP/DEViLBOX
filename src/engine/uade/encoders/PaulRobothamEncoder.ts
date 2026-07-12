/**
 * PaulRobothamEncoder — Encodes TrackerCell back to Paul Robotham (.dat)
 * pattern-stream bytes.
 *
 * A Paul Robotham module (player from Starlord, Paul Robotham_v1.asm) stores its
 * song as a header + voice/sequence/pattern pointer tables + instrument records,
 * followed by the pattern data: each pattern pointer addresses a fixed 256-byte
 * per-voice note/command stream (note indices 0x1c-0x3e, 0x3f = rest, plus high
 * command bytes 0x80+). The bytes are a packed command stream, not a clean
 * note/effect cell, so the faithful byte-exact inverse is a per-byte carrier.
 *
 * decodeCell (in PaulRobothamParser) exposes a best-effort note for display and
 * stashes the exact source byte in the invisible `period` carrier; this encoder
 * reproduces it verbatim. Edited grid cells lack the carrier and fall back to a
 * note-index / rest byte.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// Note index base: pattern byte 0x1c ↔ XM note 36 (see decode in the parser).
const PR_NOTE_BASE = 0x1c;
const PR_XM_BASE = 36;
const PR_REST = 0x3f;

function encodePaulRobothamCell(cell: TrackerCell): Uint8Array {
  // Byte-exact carrier restore: reproduce the exact source byte when present.
  if (cell.period !== undefined) {
    return new Uint8Array([cell.period & 0xFF]);
  }

  // Edited cell: derive a note-index byte, or a rest.
  const note = cell.note ?? 0;
  if (note >= PR_XM_BASE) {
    const idx = note - PR_XM_BASE + PR_NOTE_BASE;
    return new Uint8Array([idx <= 0x3e ? idx & 0xFF : PR_REST]);
  }
  return new Uint8Array([PR_REST]);
}

registerPatternEncoder('paulRobotham', () => encodePaulRobothamCell);

export { encodePaulRobothamCell, PR_NOTE_BASE, PR_XM_BASE, PR_REST };
