/**
 * SonicArrangerEncoder — Encodes TrackerCell back to Sonic Arranger (.sa) format.
 *
 * Cell encoding (4 bytes per track row):
 *   byte[0]: note (0=empty, 1-108=SA note index, 0x7F=force quiet, 0x80=release)
 *   byte[1]: instrument (1-based, 0=none)
 *   byte[2]: (disableST<<7 | disableNT<<6 | arpTable<<4 | effect)
 *   byte[3]: effect argument
 *
 * Note mapping: the parser decodes saNote2XM as xmNote = saNote - 36, so the inverse is
 * saNote = xmNote + 36. (An earlier version used +12, a 24-semitone mismatch that rewrote
 * every note byte on round-trip.)
 *   xmNote 97 (note-off) → saNote 0x7F (force quiet)
 *
 * The parser stores original SA effect/arpeggio values on TrackerCell as
 * saEffect/saEffectArg/saArpTable. For byte-exact round-trip, layout.decodeCell also
 * stashes the exact source note byte and flags+arp+effect byte in the invisible
 * cutoff/pan carriers — this preserves the disableST/disableNT flags (byte2 bits 6-7),
 * the 0x80 release vs 0x7F force-quiet distinction, and note bytes whose XM mapping falls
 * out of range. Edited grid cells carry no cutoff/pan and use the canonical derivation.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

const SA_NOTE_OFFSET = 36;

export function encodeSonicArrangerCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;

  // Byte 0: SA note (inverse of saNote2XM = saNote - 36)
  if (xmNote === 97) {
    out[0] = 0x7F; // note-off → force quiet
  } else if (xmNote > 0) {
    out[0] = Math.max(1, Math.min(108, xmNote + SA_NOTE_OFFSET));
  } else {
    out[0] = 0;
  }

  // Byte 1: instrument (1-based)
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Byte 2: flags + arp + effect
  // We don't track disableST/disableNT flags for user-edited cells, so those bits are 0
  // (transpose enabled) on the canonical path — correct for edits.
  const arpTable = (cell as unknown as Record<string, unknown>).saArpTable as number ?? 0;
  const saEffect = (cell as unknown as Record<string, unknown>).saEffect as number ?? 0;
  out[2] = ((arpTable & 0x03) << 4) | (saEffect & 0x0F);

  // Byte 3: effect argument
  const saEffectArg = (cell as unknown as Record<string, unknown>).saEffectArg as number ?? 0;
  out[3] = saEffectArg & 0xFF;

  // Byte-exact carrier restore: layout.decodeCell stashes the exact source byte0/byte2 in
  // the cutoff/pan carriers (fields the SA grid loop leaves unset). Reproduce them so the
  // flags, release/force-quiet distinction, and out-of-range note bytes survive round-trip.
  if (cell.cutoff !== undefined) out[0] = cell.cutoff & 0xFF;
  if (cell.pan !== undefined)    out[2] = cell.pan & 0xFF;

  return out;
}

registerPatternEncoder('sonicArranger', () => encodeSonicArrangerCell);
