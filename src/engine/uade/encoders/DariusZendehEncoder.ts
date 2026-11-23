/**
 * DariusZendehEncoder.ts - Darius Zendeh (.dz) 4-byte pattern row.
 *
 * Layout (nuade third-party/nuade/players/dariuszendeh/dariuszendeh.c, read_row / set_voice):
 *   byte 0: instrument table index (0-based; 0xff in pattern 0 ends the rows of every pattern)
 *   byte 1: note; the voice plays period_table[note + step transpose] (bit 7 = slide on modules with slides)
 *   byte 2: volume, 7 bits; values above 64 play as 64, 0 plays as 1
 *   byte 3: flags; decides whether the voice is switched off on the tick between rows
 *
 * The stored note byte rides in the `period` carrier (the layout's storeNote puts it there, taken back through the
 * step transpose). The raw volume byte rides in `flag2` so that a volume above 64 survives; the volume column shows
 * 0x10 + min(volume, 64). The flags byte rides in `flag1`.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

const MAX_VOLUME = 64;
const shownVolume = (raw: number) => 0x10 + Math.min(raw & 0x7f, MAX_VOLUME);

export function decodeDariusZendehCell(bytes: Uint8Array): TrackerCell {
  return {
    note: bytes[1],
    instrument: bytes[0] + 1,
    volume: shownVolume(bytes[2]),
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
    period: bytes[1],
    flag1: bytes[3],
    flag2: bytes[2],
  };
}

export function encodeDariusZendehCell(cell: TrackerCell): Uint8Array {
  const instrument = cell.instrument ? (cell.instrument - 1) & 0xff : 0;
  const raw = cell.flag2 ?? 0;
  const volume = cell.volume >= 0x10 && cell.volume !== shownVolume(raw)
    ? Math.min(cell.volume - 0x10, MAX_VOLUME)
    : raw & 0xff;
  return new Uint8Array([instrument, (cell.period ?? 0) & 0xff, volume, (cell.flag1 ?? 0) & 0xff]);
}

registerPatternEncoder('dariusZendeh', () => encodeDariusZendehCell);
