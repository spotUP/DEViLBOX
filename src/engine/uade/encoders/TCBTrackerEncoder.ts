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
 * Effects: the low nibble of byte[1] is the native TCB effect nibble. 0x0D is pattern break; 1-10 are pitch bends whose
 *   size is the song's specialValues table, shown as XM portamento up/down (tcbEffectFromNibble). Several nibbles can show
 *   the same effect, so the cell's stored bytes decide which nibble an unedited cell writes back.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/** The grid effect of a TCB effect nibble: XM portamento for the pitch bends 1..10, pattern break for 0x0D, else none. */
export function tcbEffectFromNibble(nibble: number, specialValues: ArrayLike<number>): { effTyp: number; eff: number } {
  if (nibble === 0x0D) return { effTyp: 0x0D, eff: 0 };
  if (nibble < 1 || nibble > 10) return { effTyp: 0, eff: 0 };
  // OpenMPT Load_tcb.cpp: a positive special value bends the pitch down (2xx), a negative one up (1xx).
  const value = specialValues[nibble] ?? 0;
  if (value > 0) return { effTyp: 2, eff: Math.min(255, (value + 16) >> 5) };
  if (value < 0) return { effTyp: 1, eff: Math.min(255, (-value + 16) >> 5) };
  return { effTyp: 0, eff: 0 };
}

/**
 * The effect nibble for a grid effect. Several nibbles share one portamento (their values round to the same
 * step), so the stored nibble wins when it maps to the same effect; nibbles the grid does not show (11, 12, 14,
 * 15) are kept while the cell has no effect.
 */
export function tcbNibbleFromEffect(effTyp: number, eff: number, specialValues: ArrayLike<number>, stored = 0): number {
  const same = (n: number) => { const e = tcbEffectFromNibble(n, specialValues); return e.effTyp === effTyp && e.eff === eff; };
  if (effTyp === 0) return stored === 0x0D || tcbEffectFromNibble(stored, specialValues).effTyp !== 0 ? 0 : stored;
  if (stored && same(stored)) return stored;
  if (effTyp === 0x0D) return 0x0D;
  for (let n = 1; n <= 10; n++) if (same(n)) return n;
  return 0;
}

export function encodeTCBTrackerCell(cell: TrackerCell, noteOffset = 3, specialValues: ArrayLike<number> = [], stored?: Uint8Array): Uint8Array {
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
  const effect = tcbNibbleFromEffect(cell.effTyp ?? 0, cell.eff ?? 0, specialValues, (stored?.[1] ?? 0) & 0x0F);
  out[1] = (instr << 4) | effect;

  return out;
}

// Registry entry (used only for coverage/listing; the parser's layout.encodeCell is the
// canonical write path and captures the song's real noteOffset). Default noteOffset=3.
registerPatternEncoder('tcbTracker', () => (cell: TrackerCell) => encodeTCBTrackerCell(cell));
