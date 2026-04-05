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

export const faceTheMusicEncoder: VariableLengthEncoder = {
  formatId: 'faceTheMusic',

  encodePattern(rows: TrackerCell[], _channel: number): Uint8Array {
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
      const eff = cell.eff ?? 0;

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

      // Encode note bits
      let noteBits = 0;
      if (note === 97) {
        noteBits = 35; // key-off
      } else if (note > 0) {
        noteBits = note - 48;
        if (noteBits < 1) noteBits = 1;
        if (noteBits > 34) noteBits = 34;
      }

      // Determine event type and encode
      let data0 = 0;
      let data1 = 0;

      // param encoding: param = ((data0 & 0x0F) << 2) | (data1 >> 6)
      // So: data0 low nibble = (param >> 2) & 0x0F, data1 bits 7-6 = param & 0x03
      const param = instr & 0x3F; // instrument/param value (0-63)
      const paramHi = (param >> 2) & 0x0F;
      const paramLo = param & 0x03;

      if (effTyp === 0x41) {
        // Volume set: high nibble = ((volRaw * 9 / 64) + 1)
        // Reverse of: volRaw = ((data0 >> 4) - 1) * 64 / 9
        // volNibble = round(volume * 9 / 64) + 1, clamped to 1-9
        let volNibble = Math.round(volume * 9 / 64) + 1;
        if (volNibble < 1) volNibble = 1;
        if (volNibble > 9) volNibble = 9;
        data0 = (volNibble << 4) | paramHi;
        data1 = (paramLo << 6) | (noteBits & 0x3F);
      } else if (effTyp === 0x1C) {
        // SEL effect
        const selParam = eff & 0x3F;
        data0 = 0xB0 | ((selParam >> 2) & 0x0F);
        data1 = ((selParam & 0x03) << 6) | (noteBits & 0x3F);
      } else if (effTyp === 0x03) {
        // Pitch bend
        const pbParam = eff & 0x3F;
        data0 = 0xC0 | ((pbParam >> 2) & 0x0F);
        data1 = ((pbParam & 0x03) << 6) | (noteBits & 0x3F);
      } else if (effTyp === 0x0A) {
        // Volume down
        const vdParam = eff & 0x3F;
        data0 = 0xD0 | ((vdParam >> 2) & 0x0F);
        data1 = ((vdParam & 0x03) << 6) | (noteBits & 0x3F);
      } else {
        // Default: set instrument with no effect (0x00 high nibble)
        data0 = 0x00 | paramHi;
        data1 = (paramLo << 6) | (noteBits & 0x3F);
      }

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
