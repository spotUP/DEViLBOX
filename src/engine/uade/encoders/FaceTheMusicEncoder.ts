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

export const faceTheMusicEncoder: VariableLengthEncoder = {
  formatId: 'faceTheMusic',

  encodePattern(rows: TrackerCell[], _channel: number): Uint8Array {
    // Carrier path (byte-exact): rows produced by FaceTheMusicParser's blockRows
    // are per-byte carriers of the real per-channel event stream (cutoff=1,
    // period=byte). FTM events are variable-length with spacing updates, so
    // per-byte carriers cover the whole stream; concatenating them reproduces the
    // channel chunk verbatim. The editable display grid stays carrier-less and
    // re-derives the event stream below.
    if (rows.some(c => c.cutoff !== undefined)) {
      const carried: number[] = [];
      for (const cell of rows) {
        if (cell.cutoff === undefined) continue; // padding — emits nothing
        carried.push((cell.period ?? 0) & 0xFF);
      }
      return new Uint8Array(carried);
    }

    const buf: number[] = [];

    // FTM stores events as a stream with spacing between them.
    // We need to track the globalRow and emit spacing updates + events.
    // Since we encode per-channel, each event advances globalRow by (1 + spacing).
    // For simplicity we emit each non-empty row as an event with spacing=0,
    // preceded by spacing updates to skip empty rows.

    let currentSpacing = 0; // Will be set by first spacing update
    let emptyRows = 0;

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const volume = cell.volume ?? 0;
      const effTyp = cell.effTyp ?? 0;

      const hasContent = note !== 0 || instr !== 0 || volume !== 0 || (effTyp !== 0 && effTyp !== 0x41);

      if (!hasContent && effTyp !== 0x41) {
        emptyRows++;
        continue;
      }

      // Emit spacing update if needed to skip empty rows
      // Each event advances globalRow by (1 + spacing).
      // To place an event after N empty rows, we need spacing = N.
      const neededSpacing = emptyRows;

      if (neededSpacing !== currentSpacing) {
        // Emit spacing update: 0xF0 | (spacing >> 8), spacing & 0xFF
        const sp = neededSpacing & 0xFFF;
        buf.push(0xF0 | ((sp >> 8) & 0x0F));
        buf.push(sp & 0xFF);
        currentSpacing = neededSpacing;
      }

      emptyRows = 0;

      const { note: noteBits, effect, arg } = ftmCellFields(cell);
      const data0 = (effect << 4) | ((arg >> 2) & 0x0F);
      const data1 = ((arg & 0x03) << 6) | (noteBits & 0x3F);

      buf.push(data0);
      buf.push(data1);

      // After emitting an event, reset spacing tracking
      // Next event will need spacing = 0 by default (adjacent row)
      currentSpacing = neededSpacing;
      emptyRows = 0;
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(faceTheMusicEncoder);
