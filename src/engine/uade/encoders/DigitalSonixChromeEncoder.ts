/**
 * DigitalSonixChromeEncoder — Encodes TrackerCell back to Digital Sonix & Chrome
 * (.dsc) sequence-table bytes.
 *
 * A DSC module is fully linear: header, instrument entries, a 4-byte-per-entry
 * sequence table (the only on-disk song data), sample info, then PCM. The player
 * (DigitalSonixChrome_v1.asm, Play routine) walks the sequence table reading
 * per-voice position bytes — there is no separate note grid, so the sequence
 * table IS the song. Its 4-byte entries are a packed position/trigger stream
 * (mostly 0xFF rests with occasional low position bytes), not a clean note/effect
 * cell, so the only faithful byte-exact inverse is a whole-entry carrier.
 *
 * decodeCell (in DigitalSonixChromeParser) stashes the four source bytes in the
 * invisible period/pan/cutoff carriers; this encoder reproduces them verbatim.
 * Edited grid cells lack the carriers and fall back to zero bytes.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeDscCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);

  // Byte-exact carrier restore: reproduce the four source bytes when present.
  if (cell.period !== undefined && cell.pan !== undefined && cell.cutoff !== undefined) {
    out[0] = (cell.period >> 8) & 0xFF;
    out[1] = cell.period & 0xFF;
    out[2] = cell.pan & 0xFF;
    out[3] = cell.cutoff & 0xFF;
  }

  return out;
}

registerPatternEncoder('digitalSonixChrome', () => encodeDscCell);

export { encodeDscCell };
