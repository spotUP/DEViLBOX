/**
 * TFMX7VEncoder.ts — Encode a TrackerCell back into the 2-byte
 * Hippel TFMX-7V pattern row format.
 *
 * Each row in a TFMX-7V pattern is two bytes:
 *   byte 0: note byte
 *           bits 0..6 = TFMX note value (0..63)
 *           bit  7    = portamento marker (1 = no instrument trigger,
 *                       use existing instrument with portamento slide)
 *   byte 1: info byte
 *           bits 0..4 = instrument index (added to per-voice ST sound
 *                       transpose by the replayer)
 *           bits 5..7 = effect / volume / extra flags (format-dependent)
 *
 * The parser's decodeCell names a note byte by the pitch the player looks up
 * for it (HippelTfmxWalk.hippelCellNote, the octave below C-0 included), so
 * the inverse here is the pattern note that plays that pitch
 * (hippelNoteByteFor).
 *
 * This encoder writes a "fresh" cell — it doesn't preserve the existing
 * portamento bit or the high-bit info flags because the encoder signature
 * has no access to the original bytes. For most user edits this is the
 * desired behaviour: the user picked a new note + instrument and the row
 * becomes a regular trigger.
 */

import type { TrackerCell } from '@/types';
import { hippelNoteByteFor } from '@/lib/import/formats/HippelTfmxWalk';

export function encodeTFMX7VCell(cell: TrackerCell): Uint8Array {
  const buf = new Uint8Array(2);

  // XM note 0 means "empty" — both bytes stay zero so the replayer
  // skips the row (note & 0x7f === 0 → empty cell, see TFMX_processPattern
  // in libtfmxaudiodecoder/Jochen/TFMX.cpp:153).
  if (!cell.note) return applyByteExactCarriers(buf, cell);

  // The pattern note the player plays the cell's note with (no transpose: the round-trip codec's view).
  const tfmxNote = hippelNoteByteFor(cell.note, 0);
  if (tfmxNote === null) return applyByteExactCarriers(buf, cell);
  buf[0] = tfmxNote & 0x7f;

  // Instrument 1..N is volume sequence n-1, stored in the info byte's low
  // five bits (the decoder indexes sequences from 0; the grid shows them
  // 1-based like CoSo's). The high 3 bits remain zero — the parser only
  // reads the low 5 bits when computing the replayer's instrument index, so
  // this is safe even when the original byte had non-zero high bits.
  if (cell.instrument && cell.instrument > 0) {
    buf[1] = (cell.instrument - 1) & 0x1f;
  }

  return applyByteExactCarriers(buf, cell);
}

/**
 * Byte-exact carriers set by JochenHippel7VParser.decodeCell hold the exact source
 * note/info bytes that the note/instrument view above cannot reconstruct (portamento
 * bit, note sentinels, info high bits, note-0 rows carrying an info byte). When present
 * (round-trip path) reproduce them verbatim; an edited cell reaches the encoder without
 * carriers and keeps the derivation above.
 */
function applyByteExactCarriers(buf: Uint8Array, cell: TrackerCell): Uint8Array {
  if (cell.period !== undefined) buf[0] = cell.period & 0xff; // raw note byte
  if (cell.pan !== undefined)    buf[1] = cell.pan    & 0xff; // raw info byte
  return buf;
}
