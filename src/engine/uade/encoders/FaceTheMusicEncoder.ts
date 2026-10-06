/**
 * FaceTheMusicEncoder — Variable-length encoder for Face The Music (.ftm) pattern data.
 *
 * FTM stores channel event data as compressed 2-byte event pairs in a stream:
 *
 *   Spacing update: (data0 & 0xF0) == 0xF0
 *     spacing = data1 | ((data0 & 0x0F) << 8)
 *
 *   Note event (2 bytes):
 *     data0 high nibble determines event type:
 *       0x00: set instrument, no volume; param = (data0 & 0x0F) << 2 | data1 >> 6
 *       0xB0: SEL effect; param encoded same way
 *       0xC0: pitch bend; param encoded same way
 *       0xD0: volume down; param encoded same way
 *       0xE0: loop point (skip)
 *       0x10-0x90: set volume ((data0 >> 4) - 1 scaled 0-8 → 0-64) + instrument
 *     data1 low 6 bits = note:
 *       0 = no note
 *       1-34 = note (XM note = 48 + noteBits)
 *       35+ = key-off (XM note 97)
 *
 * Reverse mapping:
 *   XM note → FTM note bits: noteBits = xmNote - 48 (range 1-34)
 *   Key-off → noteBits = 35
 *   param = ((data0 & 0x0F) << 2) | (data1 >> 6)
 *     → data0 low nibble = (param >> 2) & 0x0F
 *     → data1 high 2 bits = param & 0x03
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

/** A Face The Music track event in the replayer's own terms (what ftm_set_cell takes). */
export interface FtmCellFields {
  /** 0 none, 1-34 note, 35 release. */
  note: number;
  /** 0 instrument only, 1-10 volume step + instrument, 11 SEL, 12 pitch bend, 13 volume down. */
  effect: number;
  /** 6-bit argument: the instrument, or the SEL / bend / volume-down parameter. */
  arg: number;
}

/**
 * TrackerCell → FTM event fields, the reverse of FaceTheMusicParser's grid
 * mapping: the one mapping for file bytes and live edits of the WASM replayer.
 */
export function ftmCellFields(cell: Pick<TrackerCell, 'note' | 'instrument' | 'volume' | 'effTyp' | 'eff'>): FtmCellFields {
  const xm = cell.note ?? 0;
  const note = xm === 97 ? 35 : xm > 0 ? Math.max(1, Math.min(34, xm - 48)) : 0;
  const instrument = (cell.instrument ?? 0) & 0x3F;
  switch (cell.effTyp ?? 0) {
    case 0x1C: return { note, effect: 11, arg: (cell.eff ?? 0) & 0x3F };
    case 0x03: return { note, effect: 12, arg: (cell.eff ?? 0) & 0x3F };
    case 0x0A: return { note, effect: 13, arg: (cell.eff ?? 0) & 0x3F };
    case 0x41: {
      // Volume steps 0-9 are (step * 64 / 9); effect nibble = step + 1.
      const step = Math.max(0, Math.min(9, Math.round(((cell.volume ?? 0) * 9) / 64)));
      return { note, effect: step + 1, arg: instrument };
    }
    default: return { note, effect: 0, arg: instrument };
  }
}

/** The FTM grid effects that are events of their own (volume, SEL, pitch bend, volume down). */
const FTM_EVENT_EFFECTS = new Set([0x41, 0x1C, 0x03, 0x0A]);

function isFtmEvent(cell: TrackerCell): boolean {
  return (cell.note ?? 0) !== 0 || (cell.instrument ?? 0) !== 0 || FTM_EVENT_EFFECTS.has(cell.effTyp ?? 0);
}

/**
 * One channel's grid rows (all measures, in order) -> its FTM event stream.
 *
 * PlayFTM's track walk (and FaceTheMusicParser): an event sits `spacing` rows
 * after the row following the previous event. `spacing` is 0 before the first
 * event and the channel's `defaultSpacing` after every event; a spacing line
 * (0xFx xx) sets it for the NEXT event only. So a spacing line is due before
 * every event whose gap differs from that value, not only when the gap
 * changes. A gap is at most 0xFFF rows (12 bits).
 */
export function encodeFtmEventStream(rows: readonly TrackerCell[], defaultSpacing: number): Uint8Array {
  const buf: number[] = [];
  let nextRow = 0;   // the row after the previous event
  let spacing = 0;   // what the replayer adds without a spacing line
  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    if (!cell || !isFtmEvent(cell)) continue;
    const gap = Math.min(0xFFF, row - nextRow);
    if (gap !== spacing) {
      buf.push(0xF0 | ((gap >> 8) & 0x0F), gap & 0xFF);
    }
    const { note, effect, arg } = ftmCellFields(cell);
    buf.push((effect << 4) | ((arg >> 2) & 0x0F), ((arg & 0x03) << 6) | (note & 0x3F));
    nextRow = row + 1;
    spacing = defaultSpacing;
  }
  return new Uint8Array(buf);
}

/**
 * The variable-length encoder for a song whose channels carry these default
 * spacings (the u16 before each channel chunk, which the chip-RAM rewrite
 * keeps). Carrier rows reproduce the stream verbatim.
 */
export function faceTheMusicEncoderFor(defaultSpacings: readonly number[]): VariableLengthEncoder {
  return {
    formatId: 'faceTheMusic',
    encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
      // Carrier path (byte-exact): rows produced by FaceTheMusicParser's
      // blockRows are per-byte carriers of the channel's event stream
      // (cutoff=1, period=byte); concatenating them reproduces the chunk.
      if (rows.some(c => c.cutoff !== undefined)) {
        const carried: number[] = [];
        for (const cell of rows) {
          if (cell.cutoff === undefined) continue; // padding — emits nothing
          carried.push((cell.period ?? 0) & 0xFF);
        }
        return new Uint8Array(carried);
      }
      return encodeFtmEventStream(rows, defaultSpacings[channel] ?? 0);
    },
  };
}

/** Registry entry: channels with default spacing 0 (what FaceTheMusicExporter writes for a new file). */
export const faceTheMusicEncoder: VariableLengthEncoder = faceTheMusicEncoderFor([]);

registerVariableEncoder(faceTheMusicEncoder);
