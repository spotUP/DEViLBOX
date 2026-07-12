/**
 * GlueMonEncoder — Encodes TrackerCell back to GlueMon pattern-stream bytes.
 *
 * GlueMon (GLUE magic) stores its song as a header + 4 synth-waveform tables +
 * a 64-entry pattern-pointer table, followed by contiguous fixed-length pattern
 * data. Each pattern is `rowsPerPattern` rows of 4 bytes — one byte per voice
 * (v0,v1,v2,v3). Per the GlueMon replayer (third-party/uade-3.05/players/GlueMon,
 * play routine at code 0x2c4): each byte is 0xFF = rest/hold, 0xFE = note-off
 * (clear voice period), a note index (→ period via the player's note table at
 * code 0x536), or — in the voice-3 lane — a command marker 0xC8-0xCF that selects
 * waveform/sample and sets period/length params. The bytes are a packed
 * command stream, not a clean note/effect cell, so the faithful byte-exact
 * inverse is a per-byte carrier.
 *
 * decodeCell (in GlueMonParser) exposes a best-effort note for display and stashes
 * the exact source byte in the invisible `period` carrier; this encoder reproduces
 * it verbatim. Edited grid cells lack the carrier and fall back to a note-index /
 * rest byte.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/** 0xFF = rest / hold (no change to the voice). */
export const GLUE_REST = 0xff;

/** Last note byte covered by the player's chromatic period table (idx 48). */
const GLUE_NOTE_MAX = 0x60;

function encodeGlueMonCell(cell: TrackerCell): Uint8Array {
  // Byte-exact carrier restore: reproduce the exact source byte when present.
  if (cell.period !== undefined) {
    return new Uint8Array([cell.period & 0xff]);
  }

  // Edited note: invert decodeCell's mapping — visible note (idx+1) → even byte
  // (idx << 1), clamped to the table range. Inexact by the tie/portamento LSB the
  // carrier would have preserved, but faithful for freshly-entered notes.
  const note = cell.note ?? 0;
  if (note > 0) {
    const byte = ((note - 1) << 1) & 0xfe;
    return new Uint8Array([Math.min(byte, GLUE_NOTE_MAX)]);
  }

  // Edited command-lane cell (sample-select): instrument 1..8 → marker 0xC8-0xCF.
  const instr = cell.instrument ?? 0;
  if (instr >= 1 && instr <= 8) {
    return new Uint8Array([0xc7 + instr]);
  }

  return new Uint8Array([GLUE_REST]);
}

registerPatternEncoder('glueMon', () => encodeGlueMonCell);

export { encodeGlueMonCell };
