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
 * The reference parser maps TFMX note 0..63 to XM note 1..64 via
 * `xmNote = tfmxNote + 1` (see `tfmxNoteToXM` in JochenHippel7VParser.ts),
 * so the inverse here is `tfmxNote = xmNote - 1` clamped to 0..63.
 *
 * This encoder writes a "fresh" cell — it doesn't preserve the existing
 * portamento bit or the high-bit info flags because the encoder signature
 * has no access to the original bytes. For most user edits this is the
 * desired behaviour: the user picked a new note + instrument and the row
 * becomes a regular trigger.
 */

import type { TrackerCell } from '@/types';

export function encodeTFMX7VCell(cell: TrackerCell): Uint8Array {
  const buf = new Uint8Array(2);

  // XM note 0 means "empty" — both bytes stay zero so the replayer
  // skips the row (note & 0x7f === 0 → empty cell, see TFMX_processPattern
  // in libtfmxaudiodecoder/Jochen/TFMX.cpp:153).
  if (!cell.note || cell.note <= 0) return buf;

  // XM 1..96 → TFMX 0..63 (clamp into the 6-bit note range; the period
  // table only has 64 entries so anything past that is silently clamped).
  const tfmxNote = Math.max(0, Math.min(63, (cell.note - 1) | 0));
  buf[0] = tfmxNote & 0x7f;

  // Instrument 1..N stored as (n & 0x1f) in the info byte. The high
  // 3 bits remain zero — the parser only reads the low 5 bits when
  // computing the replayer's instrument index, so this is safe even
  // when the original byte had non-zero high bits.
  if (cell.instrument && cell.instrument > 0) {
    buf[1] = cell.instrument & 0x1f;
  }

  return buf;
}
