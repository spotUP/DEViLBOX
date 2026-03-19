/**
 * XMEncoder — Variable-length encoder for FastTracker 2 (.xm) pattern data.
 *
 * XM uses packed pattern data where each cell is 1-5 bytes:
 *   If byte & 0x80 (compressed):
 *     bit 0: note follows
 *     bit 1: instrument follows
 *     bit 2: volume follows
 *     bit 3: effect type follows
 *     bit 4: effect param follows
 *   Else (uncompressed): 5 bytes (note, instr, vol, effTyp, effParam)
 *
 * This encodes a single channel's rows for the VariableLengthEncoder contract.
 * XM patterns interleave all channels per row, so all channels of a pattern
 * share the same file-pattern index in the trackMap.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

export const xmEncoder: VariableLengthEncoder = {
  formatId: 'xm',

  encodePattern(rows: TrackerCell[], _channel: number): Uint8Array {
    const buf: number[] = [];

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;

      // Determine which fields are present
      const hasNote = note !== 0;
      const hasInstr = instr !== 0;
      const hasVol = vol !== 0;
      const hasEffTyp = effTyp !== 0;
      const hasEff = eff !== 0;

      if (!hasNote && !hasInstr && !hasVol && !hasEffTyp && !hasEff) {
        // Fully empty cell: compressed byte with no flags = 1 byte (0x80)
        buf.push(0x80);
        continue;
      }

      // Build compressed pack byte
      let packByte = 0x80;
      if (hasNote) packByte |= 0x01;
      if (hasInstr) packByte |= 0x02;
      if (hasVol) packByte |= 0x04;
      if (hasEffTyp) packByte |= 0x08;
      if (hasEff) packByte |= 0x10;

      buf.push(packByte);
      if (hasNote) buf.push(note & 0xFF);
      if (hasInstr) buf.push(instr & 0xFF);
      if (hasVol) buf.push(vol & 0xFF);
      if (hasEffTyp) buf.push(effTyp & 0xFF);
      if (hasEff) buf.push(eff & 0xFF);
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(xmEncoder);
