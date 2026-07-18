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
import { SUN_EFFECT_BY_OP, sunEncodeEffect } from './sunEffectMap';

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
  limit: number = h1.length,
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

  // Walk all items in this grammar group until the 0x00 terminator or limit.
  for (;;) {
    if (pos >= limit) break;
    const b = h1[pos];
    const len = sunCommandLen(h1, pos, widths);

    // Truncate consumption at the block boundary — do not read bytes at/after limit.
    if (pos + len > limit) {
      pos = limit;
      break;
    }

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
      // Player gate (SunTronicPlayer.getNextNote:370-371): a pitch byte fires a
      // note-on ONLY when a select has been staged (`stagedSel != 0`). Because a
      // select byte in 0x01..0x7f always maps to a non-zero instrument, that gate
      // is exactly `curInstr != 0` here. A pitch byte with no instrument ever
      // staged sets the Paula period only (silent glide target) — the player does
      // NOT retrigger, so the grid must NOT show a note there (that was a phantom
      // "ghost note"). First qualifying note wins (walkV13Voice behaviour).
      if (cell.note === 0 && curInstr !== 0) {
        cell.note = sunPitchToNote(((~b) & 0xff) - transpose);
        cell.instrument = curInstr;
      }
      pos += len;
      continue;
    }

    if (b === 0x94) {
      // setPitchNoRetrig (player controlOpcode 0x94, SunTronicPlayer.ts:452-454):
      // sets the Paula pitch WITHOUT retriggering the instrument — the player
      // fires NO note-on. So this is a pure glide EFFECT, never a note column;
      // emitting a note here produced a phantom "ghost note" the player never
      // plays. Carry the raw pitch byte verbatim as the effTyp-3 (glide) param so
      // encodeSunGroup reconstructs the exact [0x94, argByte] with no note byte.
      if (len >= 2) {
        const argByte = h1[pos + 1];
        // Use pushFx so the glide lands in the next free slot and does not
        // clobber any prior effect already written to slot 0.
        pushFx(3, argByte);
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
        const readEnd = Math.min(h1.length, limit);
        for (let i = 1; i <= argCount; i++) {
          argBytes.push(pos + i < readEnd ? h1[pos + i] : 0);
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
  cell.sunRaw = Array.from(h1.subarray(groupStart, Math.min(pos, limit)));

  return { cell, nextPos: pos, curInstr };
}

// ---------------------------------------------------------------------------
// encodeSunGroup — display cell → group bytes
// ---------------------------------------------------------------------------

/**
 * Inverse of sunPitchToNote.
 *
 * sunPitchToNote(raw) = raw + 13  (valid when 1 <= raw+13 <= 96)
 * noteToSunPitch(note) = note - 13  (inverse; caller must pass note in 13..96)
 */
export function noteToSunPitch(note: number): number {
  return note - 13;
}

/**
 * FX columns in TrackerCell order (slot 0→4).
 * Returns {effTyp, param} for each occupied slot (effTyp > 0).
 */
function fxColumns(cell: TrackerCell): Array<{ effTyp: number; param: number }> {
  return [
    { effTyp: cell.effTyp  ?? 0, param: cell.eff  ?? 0 },
    { effTyp: cell.effTyp2 ?? 0, param: cell.eff2 ?? 0 },
    { effTyp: cell.effTyp3 ?? 0, param: cell.eff3 ?? 0 },
    { effTyp: cell.effTyp4 ?? 0, param: cell.eff4 ?? 0 },
    { effTyp: cell.effTyp5 ?? 0, param: cell.eff5 ?? 0 },
  ].filter(c => c.effTyp !== 0);
}

/**
 * Encode one SunTronic V1.3 grammar group from a display TrackerCell.
 *
 * **Verbatim path:** if `cell.sunRaw` is present AND re-decoding it with the
 * same `transpose`/`curInstr`/`numSampled`/`widths` produces display fields
 * that match `cell` (note, instrument, effTyp1-5 / eff1-5), the raw bytes are
 * returned unchanged — preserving the exact byte sequence from the original
 * file.
 *
 * **Re-encode path:** FX opcodes (column order, via sunEncodeEffect, with
 * effTyp-40 rate paired onto 0x9a) → note byte (+select byte) → 0x00.
 *
 * @param cell       Display cell to encode (may carry a sunRaw carrier).
 * @param transpose  Per-voice per-position transpose (must match the decode call).
 * @param curInstr   Running instrument cursor (caller maintains across groups,
 *                   mirrors decodeSunGroup's curInstr param).
 * @param numSampled Number of sampled instruments in this module.
 * @param widths     Variant-dependent operand widths.
 * @returns          Array of bytes for this grammar group (includes terminator).
 */
export function encodeSunGroup(
  cell: TrackerCell,
  transpose: number,
  curInstr: number,
  numSampled: number,
  widths: SunCmdWidths,
): number[] {
  // -------------------------------------------------------------------------
  // Verbatim path: re-decode sunRaw and compare display fields.
  // -------------------------------------------------------------------------
  if (cell.sunRaw && cell.sunRaw.length > 0) {
    const raw = new Uint8Array(cell.sunRaw);
    const redecoded = decodeSunGroup(raw, 0, transpose, curInstr, numSampled, widths, raw.length).cell;

    const fieldsMatch =
      redecoded.note       === cell.note       &&
      redecoded.instrument === cell.instrument &&
      (redecoded.effTyp  ?? 0) === (cell.effTyp  ?? 0) && (redecoded.eff  ?? 0) === (cell.eff  ?? 0) &&
      (redecoded.effTyp2 ?? 0) === (cell.effTyp2 ?? 0) && (redecoded.eff2 ?? 0) === (cell.eff2 ?? 0) &&
      (redecoded.effTyp3 ?? 0) === (cell.effTyp3 ?? 0) && (redecoded.eff3 ?? 0) === (cell.eff3 ?? 0) &&
      (redecoded.effTyp4 ?? 0) === (cell.effTyp4 ?? 0) && (redecoded.eff4 ?? 0) === (cell.eff4 ?? 0) &&
      (redecoded.effTyp5 ?? 0) === (cell.effTyp5 ?? 0) && (redecoded.eff5 ?? 0) === (cell.eff5 ?? 0);

    if (fieldsMatch) {
      return [...cell.sunRaw];
    }
  }

  // -------------------------------------------------------------------------
  // Re-encode path: emit FX opcodes → note (+select) → 0x00 terminator.
  // -------------------------------------------------------------------------
  const out: number[] = [];

  // Gather all FX slots.
  const cols = fxColumns(cell);

  // Emit FX opcodes in column order (slot 0→4).
  // effTyp-40 (volSlide rate) has no independent opcode — it is paired onto
  // the preceding 0x9a when widths.volSlideRateFromStream is true.
  for (const col of cols) {
    if (col.effTyp === 40) {
      // No standalone opcode for rate — handled as 0x9a second byte above.
      continue;
    }

    const enc = sunEncodeEffect(col.effTyp, col.param, widths);
    if (!enc) continue; // unknown / unencodable

    if (enc.op === 0x9a && widths.volSlideRateFromStream) {
      // Pair with effTyp-40 sibling: find the first effTyp-40 column.
      const rateSibling = cols.find(c => c.effTyp === 40);
      out.push(enc.op);
      out.push(...enc.argBytes); // amount byte
      if (rateSibling !== undefined) {
        out.push(rateSibling.param & 0xff); // rate byte
      }
    } else {
      out.push(enc.op);
      out.push(...enc.argBytes);
    }
  }

  // Emit note byte (+ optional instrument-select byte).
  // EXCEPTION: when an effTyp-3 (0x94 setPitchNoRetrig) column is present,
  // the pitch is already carried as the 0x94 arg byte — do NOT also emit a
  // standalone note byte (that would produce a double-carrier and corrupt the
  // stream). The instrument-select byte still emits after the 0x94 opcode(s).
  const noteCarriedByGlide = cols.some(c => c.effTyp === 3);

  if (!noteCarriedByGlide && cell.note && cell.note > 0) {
    const pitch = noteToSunPitch(cell.note) + transpose;
    if (pitch < 0 || pitch > 71) {
      throw new Error(
        `encodeSunGroup: note ${cell.note} at transpose ${transpose} is unrepresentable ` +
        `in SunTronic's note range (raw ${pitch} is outside 0..71; ` +
        `byte would be 0x${((~pitch) & 0xff).toString(16).toUpperCase().padStart(2, '0')} < 0xB8)`,
      );
    }
    const noteByte = (~pitch) & 0xff;
    out.push(noteByte);
  }

  // Emit instrument select only when instrument changed from the running cursor.
  // This applies regardless of whether the note was carried by 0x94 or emitted
  // as a standalone note byte.
  if (cell.note && cell.note > 0) {
    const id = cell.instrument ?? 0;
    if (id > 0 && id !== curInstr) {
      const sel = id > numSampled ? (0x40 | (id - numSampled - 1)) : id;
      out.push(sel);
    }
  }

  // Terminator.
  out.push(0x00);

  return out;
}
