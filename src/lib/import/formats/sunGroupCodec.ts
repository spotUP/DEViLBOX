/**
 * sunGroupCodec.ts — SunTronic V1.3 per-group display decoder
 *
 * `decodeSunGroup` converts one grammar group (stream items until 0x00) into a
 * single TrackerCell with note, instrument, effect columns, and the byte-exact
 * sunRaw carrier.  It mirrors `walkV13Voice`'s inner-loop logic but adds
 * effect-column decoding via SUN_EFFECT_BY_OP (Task 1) so the editable grid
 * can surface all control opcodes.
 *
 * Task 5 will replace walkV13Voice's inner loop with this function; behavioral
 * parity on note/instrument is required.
 *
 * Instrument mapping (CRITICAL — must match walkV13Voice, NOT sunSelectToInstrument):
 *   sel >= 0x40  →  numSampled + (sel & 0x3f) + 1
 *   sel <  0x40  →  sel
 * Do NOT use sunSelectToInstrument (fixed 0x40 base, different context).
 */

import type { TrackerCell } from '@/types';
import { sunCommandLen, sunPitchToNote } from './SunTronicV13';
import type { SunCmdWidths } from './SunTronicV13';
import { SUN_EFFECT_BY_OP } from './sunEffectMap';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface SunGroup {
  /** Decoded display cell for this grammar row. */
  cell: TrackerCell;
  /** Stream cursor after the 0x00 terminator. */
  nextPos: number;
}

/**
 * Decode one SunTronic V1.3 grammar group starting at `pos` in hunk#1 (`h1`).
 *
 * @param h1         Hunk#1 byte array (full chip hunk — shared by all voices).
 * @param pos        Start of this grammar group in h1.
 * @param transpose  Per-voice, per-position transpose (from sequence entry).
 * @param curInstr   Running instrument number (caller maintains across groups).
 * @param numSampled Number of sampled instruments in this module (for mapping).
 * @param widths     Variant-dependent operand widths (mirrors audio player).
 * @returns          { cell, nextPos, curInstr } — the updated curInstr MUST be
 *                   threaded back into the next call.
 */
export function decodeSunGroup(
  h1: Uint8Array,
  pos: number,
  transpose: number,
  curInstr: number,
  numSampled: number,
  widths: SunCmdWidths,
): SunGroup & { curInstr: number } {
  // Initialise with all required fields (mirrors emptyV13Cell + TrackerCell shape).
  const cell: TrackerCell = {
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0,
    effTyp2: 0, eff2: 0,
  };

  const groupStart = pos;

  // FX slot index — fills effTyp/eff, effTyp2/eff2, effTyp3/eff3 … effTyp5/eff5.
  // We track a running slot index (0-based); slots beyond 5 are silently dropped.
  let fxSlot = 0;

  /** Write {effTyp, param} into the next free FX slot on `cell`. */
  function pushFx(effTyp: number, param: number): void {
    switch (fxSlot) {
      case 0: cell.effTyp  = effTyp; cell.eff  = param; break;
      case 1: cell.effTyp2 = effTyp; cell.eff2 = param; break;
      case 2: cell.effTyp3 = effTyp; cell.eff3 = param; break;
      case 3: cell.effTyp4 = effTyp; cell.eff4 = param; break;
      case 4: cell.effTyp5 = effTyp; cell.eff5 = param; break;
      // slots 5+ (effTyp6..8) are beyond the 6-slot limit — drop silently.
    }
    fxSlot++;
  }

  // Walk all items in this grammar group until the 0x00 terminator.
  for (;;) {
    if (pos >= h1.length) break;
    const b = h1[pos];
    const len = sunCommandLen(h1, pos, widths);

    if (b === 0x00) {
      // Terminator — consume and stop.
      pos += len;
      break;
    }

    if (b >= 0xb8) {
      // Note byte: optional trailing instrument select byte included in `len`.
      if (len >= 2) {
        const sel = h1[pos + 1];
        curInstr = sel >= 0x40 ? numSampled + (sel & 0x3f) + 1 : sel;
      }
      if (cell.note === 0) {
        // First note wins (walkV13Voice behaviour).
        cell.note = sunPitchToNote(((~b) & 0xff) - transpose);
        cell.instrument = curInstr;
      }
      pos += len;
      continue;
    }

    if (b === 0x94) {
      // setPitchNoRetrig: note (same mapping) + effTyp 3 (glide), no retrigger.
      // Mirror: walkV13Voice case 0x94 (SunTronicParser.ts:523-535).
      if (cell.note === 0 && len >= 2) {
        cell.note = sunPitchToNote(((~h1[pos + 1]) & 0xff) - transpose);
        cell.instrument = curInstr;
        // Use pushFx so the glide lands in the next free slot and does not
        // clobber any prior effect already written to slot 0.
        pushFx(3, 0);
      }
      pos += len;
      continue;
    }

    if (b >= 0x01 && b <= 0x7f) {
      // Instrument-select byte alone (no note).
      curInstr = b >= 0x40 ? numSampled + (b & 0x3f) + 1 : b;
      pos += len;
      continue;
    }

    // Control opcode range: 0x8b..0x9c (0x97 = 151 is already within this range).
    if (b >= 0x8b && b <= 0x9c) {
      const def = SUN_EFFECT_BY_OP.get(b);
      if (def) {
        // Slice the arg bytes (everything after the opcode byte).
        const argCount = len - 1;
        const argBytes: number[] = [];
        for (let i = 1; i <= argCount; i++) {
          argBytes.push(pos + i < h1.length ? h1[pos + i] : 0);
        }

        const { effTyp, param } = def.decode(argBytes);
        pushFx(effTyp, param);

        // 0x9a with 2 arg bytes (volSlideRateFromStream variant): also emit the
        // rate as a sibling effTyp-40 column.
        if (b === 0x9a && argBytes.length === 2) {
          pushFx(40, argBytes[1]);
        }
      }
      pos += len;
      continue;
    }

    // Unknown byte: consume one byte (mirrors sunCommandLen's default:1).
    pos += len;
  }

  // Capture exact source bytes for byte-exact round-trip (sunRaw carrier).
  cell.sunRaw = Array.from(h1.subarray(groupStart, pos));

  return { cell, nextPos: pos, curInstr };
}
