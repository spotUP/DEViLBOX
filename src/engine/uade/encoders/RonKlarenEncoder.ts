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

/**
 * Grid note → Ron Klaren period-table index (reverse of the parser's rkNoteToXM:
 * xmNote = XM_REFERENCE_NOTE + (noteIdx - RK_REFERENCE_IDX)). The one mapping
 * for file bytes and live edits of the WASM replayer. -1 for an empty cell.
 */
export function ronKlarenNoteIndex(xmNote: number): number {
  if (!(xmNote > 0 && xmNote <= 96)) return -1;
  return Math.max(0, Math.min(RK_PERIODS_LEN - 1, xmNote - XM_REFERENCE_NOTE + RK_REFERENCE_IDX));
}

export function encodeRonKlarenCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const out = new Uint8Array(2);
  const noteIdx = ronKlarenNoteIndex(cell.note ?? 0);
  // The wait byte is the row's duration: the grid derives its rows from it and
  // has no field for it, so an edit keeps the stored one (as rk_set_cell does
  // on the native replayer). A different byte would shift every later row.
  const storedWait = stored && stored.length >= 2 && stored[0] < 0x80 ? stored[1] : undefined;

  if (noteIdx >= 0) {
    out[0] = noteIdx;
    // No stored command to keep (a new file): wait 1 (triggers note and waits 1*4-1=3 ticks)
    out[1] = storedWait ?? 1;
  } else {
    // Empty cell: note 0, the command's duration kept
    out[0] = 0;
    out[1] = storedWait ?? 0;
  }

  // Byte-exact carrier restore. RonKlarenParser.decodeCell stashes both source bytes in the
  // invisible period carrier (the note is a lossy clamp and waitCount is dropped from the XM
  // view). Reproduce both verbatim for an unedited cell; edited grid cells lack the carrier
  // and keep the derivation above.
  if (cell.period !== undefined) {
    out[0] = (cell.period >> 8) & 0xFF;
    out[1] = cell.period & 0xFF;
  }

  return out;
}

registerPatternEncoder('ronKlaren', () => encodeRonKlarenCell);
