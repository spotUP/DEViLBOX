/**
 * RonKlarenEncoder — Encodes TrackerCell back to Ron Klaren (.rk) format.
 *
 * Ron Klaren tracks use a variable-length command stream:
 *   0x00-0x7F: note byte (period table index) + waitCount byte = 2 bytes
 *   0x80: SetArpeggio + 1 byte
 *   0x81: SetPortamento + 3 bytes
 *   0x82: SetInstrument + 1 byte
 *   0x83/0x85: EndSong (0 bytes)
 *   0x84: ChangeAdsrSpeed + 1 byte
 *   0xFF: EndOfTrack
 *
 * Note mapping (reverse of parser's rkNoteToXM):
 *   Parser: xmNote = XM_REFERENCE_NOTE + (noteIdx - RK_REFERENCE_IDX)
 *           where XM_REFERENCE_NOTE = 13, RK_REFERENCE_IDX = 36
 *   Encoder: noteIdx = xmNote - XM_REFERENCE_NOTE + RK_REFERENCE_IDX = xmNote - 13 + 36 = xmNote + 23
 *
 * The encoder produces 2-byte note cells (note byte + waitCount).
 * For note cells, getCellFileOffset points to the note byte in the track stream.
 * For SetInstrument commands that precede notes, those are at separate offsets.
 *
 * Since the parser flattens note+waitCount into rows (1 note row + (waitCount*4-2) empty rows),
 * the encoder writes 2 bytes: [noteIdx, waitCount].
 * Empty rows that are part of a duration hold are not separately encoded (they don't
 * have independent file offsets).
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

const XM_REFERENCE_NOTE = 13;
const RK_REFERENCE_IDX = 36;
const RK_PERIODS_LEN = 70;

export function encodeRonKlarenCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(2);
  const xmNote = cell.note ?? 0;

  if (xmNote > 0 && xmNote <= 96) {
    // Reverse rkNoteToXM: xmNote = XM_REFERENCE_NOTE + (noteIdx - RK_REFERENCE_IDX)
    // → noteIdx = xmNote - XM_REFERENCE_NOTE + RK_REFERENCE_IDX
    let noteIdx = xmNote - XM_REFERENCE_NOTE + RK_REFERENCE_IDX;
    noteIdx = Math.max(0, Math.min(RK_PERIODS_LEN - 1, noteIdx));
    out[0] = noteIdx;
    // Default waitCount = 1 (triggers note and waits 1*4-1=3 ticks)
    out[1] = 1;
  } else {
    // Empty cell: note 0 + waitCount 0 (no wait, no note trigger)
    out[0] = 0;
    out[1] = 0;
  }

  return out;
}

registerPatternEncoder('ronKlaren', () => encodeRonKlarenCell);
