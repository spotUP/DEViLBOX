/**
 * DesireEncoder - the Desire (DSR.*) note byte codec.
 *
 * A song voice is a command stream (thoughts/spot/2026-11-18-desire-format-spec.md): byte 0x00 is a rest, 0x01..0x7f a note
 * (the pitch is the byte plus the stream's transpose), every byte >= 0x80 a command. The grid shows the note byte of a note or
 * rest item; durations (0x80), loops, transpose and the instrument select (0x88) are not cell fields.
 * The stored note is the byte; the grid note is byte + the stream's transpose - DESIRE_PITCH_BASE (layout.noteOffset, DesireParser).
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/** offset: grid note minus stored note at this cell (0 for the stored note itself). */
export function decodeDesireCell(raw: Uint8Array, offset = 0): TrackerCell {
  const b = raw[0];
  return { note: b > 0 && b < 0x80 && b + offset >= 1 && b + offset <= 96 ? b + offset : 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** A note writes its byte; an emptied cell makes the item a rest; anything else (note off, out of range) keeps the stored byte. */
export function encodeDesireCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const keep = stored ? stored[0] : 0;
  if (cell.note === 0) return new Uint8Array([0]);
  const b = cell.note;
  return new Uint8Array([b >= 1 && b < 0x80 ? b : keep]);
}

registerPatternEncoder('desire', () => encodeDesireCell);
