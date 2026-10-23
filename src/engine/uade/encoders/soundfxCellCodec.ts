/**
 * soundfxCellCodec -- the ONE SoundFX (.sfx) cell codec (pure functions).
 *
 * Cell layout (4 bytes): int16 BE note word, byte2 = (sample & 0x0F) << 4 | effect nibble,
 * byte3 = effect param. v2 (SO31): bit 12 of a positive note word extends the sample
 * number to 16-31.
 *
 * Semantics follow FlodJS FXPlayer and soundfx-wasm/src/soundfx.c:
 *   1 arpeggio, 2 pitch bend (hi nibble > 0: period += hi, else period -= lo),
 *   3 LED on, 4 LED off, 5 volume up by param, 6 volume down by param,
 *   7 step up, 8 step down, 9 auto slide.
 *   Note word -2 = volume off, -4 = pattern break, -3/-5 = no action.
 * The file has no volume column; cell.volume stays 0.
 *
 * `sfxEffect`/`sfxEffectArg` carry the raw nibble and param for byte-exact round-trip;
 * they are used on encode only while the XM display still matches them.
 */
import type { TrackerCell } from '@/types';
import { periodToNoteIndex } from '@/lib/import/formats/AmigaUtils';
import { xmNoteToPeriod } from './MODEncoder';

export type SoundFXVersion = 'v1' | 'v2';

const XM_NOTE_OFF = 97;

/** SoundFX period -> XM note (0 when the period has no table match). */
export function sfxPeriodToNote(period: number): number {
  if (period <= 0) return 0;
  const idx = periodToNoteIndex(period);
  return idx === 0 ? 0 : idx + 12;
}

/** True when `period` is the exact source period the decoder turned into `note`. */
function periodMatchesNote(period: number, note: number): boolean {
  return period > 0 && sfxPeriodToNote(period) === note;
}

/** Display (XM effTyp/eff) of a raw SoundFX effect; pattern break (note word -4) wins. */
export function sfxDisplayEffect(
  noteWord: number, effect: number, param: number,
): { effTyp: number; eff: number } {
  if (noteWord === -4) return { effTyp: 0x0D, eff: 0 };
  switch (effect) {
    case 1: return param !== 0 ? { effTyp: 0x00, eff: param } : { effTyp: 0, eff: 0 };
    case 2: {
      const hi = param >> 4;
      const lo = param & 0x0F;
      if (hi > 0) return { effTyp: 0x02, eff: hi };
      if (lo > 0) return { effTyp: 0x01, eff: lo };
      return { effTyp: 0, eff: 0 };
    }
    case 3: return { effTyp: 0x0E, eff: 0x01 };
    case 4: return { effTyp: 0x0E, eff: 0x00 };
    case 5: return param !== 0 ? { effTyp: 0x0A, eff: Math.min(param, 15) << 4 } : { effTyp: 0, eff: 0 };
    case 6: return param !== 0 ? { effTyp: 0x0A, eff: Math.min(param, 15) } : { effTyp: 0, eff: 0 };
    case 7: { const s = param & 0x0F; return s > 0 ? { effTyp: 0x01, eff: s } : { effTyp: 0, eff: 0 }; }
    case 8: { const s = param & 0x0F; return s > 0 ? { effTyp: 0x02, eff: s } : { effTyp: 0, eff: 0 }; }
    case 9: return param !== 0 && (param & 0x0F) !== 0
      ? { effTyp: 0x02, eff: param & 0x0F } : { effTyp: 0, eff: 0 };
    default: return { effTyp: 0, eff: 0 };
  }
}

/** Inverse of the display map, for cells whose effect the user edited. */
function reverseDisplayEffect(effTyp: number, eff: number): { effect: number; param: number } {
  switch (effTyp) {
    case 0x00: return eff !== 0 ? { effect: 1, param: eff } : { effect: 0, param: 0 };
    case 0x01: return { effect: 2, param: eff & 0x0F };
    case 0x02: return { effect: 2, param: (eff & 0x0F) << 4 };
    case 0x0E:
      if (eff === 0x01) return { effect: 3, param: 0 };
      if (eff === 0x00) return { effect: 4, param: 0 };
      return { effect: 0, param: 0 };
    case 0x0A:
      if ((eff >> 4) > 0) return { effect: 5, param: eff >> 4 };
      if ((eff & 0x0F) > 0) return { effect: 6, param: eff & 0x0F };
      return { effect: 0, param: 0 };
    default: return { effect: 0, param: 0 };
  }
}

/** Decode one 4-byte cell into a TrackerCell (no volume column). */
export function decodeSoundFXCell(bytes: Uint8Array, version: SoundFXVersion): TrackerCell {
  const word = ((bytes[0] << 8) | bytes[1]) << 16 >> 16; // signed int16 BE
  const effect = bytes[2] & 0x0F;
  const param = bytes[3];
  let instrument = bytes[2] >> 4;
  let noteWord = word;
  if (version === 'v2' && word > 0 && (word & 0x1000)) {
    instrument += 16;
    noteWord = word & 0xEFFF;
  }
  let note = 0;
  if (noteWord === -2) note = XM_NOTE_OFF;
  else if (noteWord > 0) note = sfxPeriodToNote(noteWord);
  const { effTyp, eff } = sfxDisplayEffect(noteWord, effect, param);
  return {
    note, instrument, volume: 0, effTyp, eff, effTyp2: 0, eff2: 0,
    // Exact source note word (periods without a table match, and -3/-4/-5, have no XM note).
    period: noteWord !== 0 && noteWord !== -2 ? noteWord : undefined,
    sfxEffect: effect,
    sfxEffectArg: param,
  };
}

/** Encode one TrackerCell into 4 bytes. */
export function encodeSoundFXCell(cell: TrackerCell, version: SoundFXVersion = 'v1'): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const rawPeriod = cell.period ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  // Effect: raw carrier while the display still matches it, else inverse of the display map.
  let effect: number;
  let param: number;
  if (cell.sfxEffect !== undefined) {
    const shown = sfxDisplayEffect(rawPeriod === -4 ? -4 : 0, cell.sfxEffect, cell.sfxEffectArg ?? 0);
    if (shown.effTyp === effTyp && shown.eff === eff) {
      effect = cell.sfxEffect & 0x0F;
      param = cell.sfxEffectArg ?? 0;
    } else {
      ({ effect, param } = reverseDisplayEffect(effTyp, eff));
    }
  } else {
    ({ effect, param } = reverseDisplayEffect(effTyp, eff));
  }

  // Note word.
  let word = 0;
  if (note === XM_NOTE_OFF) {
    word = -2;
  } else if (note > 0) {
    word = periodMatchesNote(rawPeriod, note) ? rawPeriod : xmNoteToPeriod(note);
  } else if (rawPeriod !== 0) {
    // Out-of-table period or -3/-4/-5, carried with no XM note: write back verbatim,
    // unless the user replaced a pattern break by another effect.
    word = rawPeriod === -4 && !(effTyp === 0x0D && eff === 0) ? 0 : rawPeriod;
  } else if (effTyp === 0x0D && eff === 0) {
    word = -4;
  }

  // Sample: v2 bit 12 of a positive note word extends to samples 16-31.
  const instr = cell.instrument ?? 0;
  if (version === 'v2' && word > 0 && instr >= 16) word |= 0x1000;

  out[0] = (word >> 8) & 0xFF;
  out[1] = word & 0xFF;
  out[2] = ((instr & 0x0F) << 4) | (effect & 0x0F);
  out[3] = param & 0xFF;
  return out;
}
