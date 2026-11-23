/**
 * AProSysEncoder - the AProSys track entry codec (one grid cell = one 4-byte track entry).
 *
 * Entry bytes (nuade players/aprosys/aprosys_module.c aps_track_entry):
 *   0: key 0x80 | arpeggio 0x40 | note 0..0x3e (0x3f = no note, the voice releases)
 *   1: instrument, added to the step cell's instrument
 *   2: instrument-direct 0x80 | tempo 0x40 | level 0..0x3f (with tempo: the row length, else the volume)
 *   3: arpeggio table offset (arpeggio flag) or slide speed towards the note
 * The stored note is a period-table index; index 0 is period 1710 (C-0 in periodNotes naming). The step cell's note
 * and the order list's octave are added by the player: the parser's noteOffset carries them.
 * Grid: note = index + APS_NOTE0, instrument = byte 1 + 1, volume 0x10 + level (0 when the tempo flag is set),
 * effect 0xy = arpeggio offset, 3xx = slide speed. Flag bits the grid does not show come from the stored bytes.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { periodToNote } from '@/lib/amiga/periodNotes';

export const APS_NOTE0 = periodToNote(1710);
const NO_NOTE = 0x3f;

export function decodeAProSysCell(bytes: Uint8Array): TrackerCell {
  const n = bytes[0] & 0x3f;
  const arp = (bytes[0] & 0x40) !== 0;
  const tempo = (bytes[2] & 0x40) !== 0;
  return {
    note: n === NO_NOTE ? 0 : n + APS_NOTE0,
    instrument: bytes[1] + 1,
    volume: tempo ? 0 : 0x10 + (bytes[2] & 0x3f),
    effTyp: arp || bytes[3] === 0 ? 0 : 3,
    eff: bytes[3],
    effTyp2: 0,
    eff2: 0,
  };
}

export function encodeAProSysCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const s = stored ?? new Uint8Array([NO_NOTE, 0, 0, 0]);
  const out = new Uint8Array(4);
  const idx = (cell.note ?? 0) - APS_NOTE0;
  const hasNote = (cell.note ?? 0) > 0 && cell.note < 97 && idx >= 0 && idx < NO_NOTE;
  const wasEmpty = (s[0] & 0x3f) === NO_NOTE;
  // A note typed on an empty entry starts the note (key flag); an out-of-range note keeps the stored one.
  const noteBits = hasNote ? idx : (cell.note ?? 0) === 0 || cell.note >= 97 ? NO_NOTE : s[0] & 0x3f;
  const key = hasNote && wasEmpty ? 0x80 : s[0] & 0x80;
  const eff = (cell.eff ?? 0) & 0xff;
  const arp = cell.effTyp === 3 ? 0 : cell.effTyp === 0 && eff !== 0 ? 0x40 : s[0] & 0x40;
  out[0] = key | arp | noteBits;
  out[1] = (cell.instrument ?? 0) > 0 ? (cell.instrument - 1) & 0xff : s[1];
  const vol = cell.volume ?? 0;
  out[2] = vol >= 0x10 && vol <= 0x4f ? (s[2] & 0xc0) | (vol - 0x10) : s[2];
  out[3] = eff;
  return out;
}

registerPatternEncoder('aProSys', () => encodeAProSysCell);
