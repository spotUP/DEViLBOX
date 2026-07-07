/**
 * TCBTrackerEncoder — Encodes TrackerCell back to TCB Tracker ("AN COOL!") format.
 *
 * Cell encoding (2 bytes per cell):
 *   byte[0]: note byte (0=empty, 0x10-0x3B=valid note)
 *            High nibble = octave (1-3), low nibble = semitone (0-11)
 *   byte[1]: (instrument << 4) | (effect & 0x0F)
 *            Instrument: 0-15 (maps to 1-16 in parser)
 *
 * Note mapping (MUST match TCBTrackerParser.decodeCell — its exact inverse):
 *   Parser: xmNote = octave*12 + semitone + 37 + noteOffset
 *           (octave = noteByte>>4 ∈ 1..3, semitone = noteByte&0x0F ∈ 0..11)
 *   Inverse: base = xmNote - 37 - noteOffset; octave = base/12; semitone = base%12
 *   The OLD formula here (`(xmNote-1)/12`) ignored the +37+noteOffset bias, so every
 *   real note re-encoded to octave 6+ (out of range) and was written as 0x00 — that was
 *   ~8% of cells lost on write-back. noteOffset is a per-song value (3 for non-Amiga
 *   freqs, 0 for Amiga freqs), so the parser threads it into the layout's encodeCell.
 *
 * Effects: the low nibble of byte[1] is stored VERBATIM (native TCB effect code). The
 *   parser's decodeCell puts it in effTyp so this codec is a byte-exact inverse; TCB is
 *   played by the native UADE replayer, not DEViLBOX's XM effect engine, so the raw code
 *   is the correct representation (Tomy Tracker model). The previous encoder only wrote
 *   effect 0x0D and dropped every other command's nibble.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export function encodeTCBTrackerCell(cell: TrackerCell, noteOffset = 3): Uint8Array {
  const out = new Uint8Array(2);
  const xmNote = cell.note ?? 0;

  // Byte 0: TCB note byte — exact inverse of the parser's decode.
  if (xmNote > 0) {
    const base = xmNote - 37 - noteOffset; // = octave*12 + semitone
    const octave = Math.floor(base / 12);
    const semitone = base % 12;
    if (base >= 0 && octave >= 1 && octave <= 3 && semitone >= 0 && semitone <= 11) {
      out[0] = (octave << 4) | semitone;
    } else {
      out[0] = 0; // out of TCB's representable range
    }
  } else {
    out[0] = 0;
  }

  // Byte 1: (instrument << 4) | effect. Parser stores instrument 1-based, effect raw.
  const instr = Math.max(0, (cell.instrument ?? 0) - 1) & 0x0F;
  const effect = (cell.effTyp ?? 0) & 0x0F;
  out[1] = (instr << 4) | effect;

  return out;
}

// Registry entry (used only for coverage/listing; the parser's layout.encodeCell is the
// canonical write path and captures the song's real noteOffset). Default noteOffset=3.
registerPatternEncoder('tcbTracker', () => (cell: TrackerCell) => encodeTCBTrackerCell(cell));
