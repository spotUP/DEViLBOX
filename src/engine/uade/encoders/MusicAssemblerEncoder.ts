/**
 * MusicAssemblerEncoder — Variable-length encoder for Music Assembler (.ma) pattern data.
 *
 * Music Assembler uses variable-length track encoding (2-4 bytes per event):
 *
 *   (b0 & 0x80) == 0:                Note event (no instrument change)
 *     b0 bits 5-0 = note index; bit 6 = legato flag
 *     b1: delay (if high bit clear) or portamento flag + b2 extra byte
 *
 *   (b0 & 0x80) != 0, (b0 & 0x40) == 0:  Release event
 *     b0 bits 5-0 = delay
 *
 *   (b0 & 0x80) != 0, (b0 & 0x40) != 0:  Instrument + note event
 *     b0 bits 5-0 = instrument index (0-based)
 *     b1 bits 5-0 = note index
 *     b2: delay (if high bit clear) or portamento flag + b3 extra byte
 *
 * XM note → MA note index: maNote = xmNote - XM_REFERENCE_NOTE + MA_REFERENCE_IDX
 * where XM_REFERENCE_NOTE = 13 and MA_REFERENCE_IDX = 12.
 * So: maNote = xmNote - 1
 *
 * Key-off (XM note 97) is encoded as a release event.
 *
 * The last byte of each event is the delay counter (row spacing).
 * Track ends with 0xFF terminator.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const XM_REFERENCE_NOTE = 13;
const MA_REFERENCE_IDX = 12;

/** Convert XM note to MA note index. Returns 0 for no note or out-of-range. */
function xmNoteToMA(xmNote: number): number {
  if (xmNote <= 0 || xmNote === 97) return 0;
  const ma = xmNote - XM_REFERENCE_NOTE + MA_REFERENCE_IDX;
  return (ma >= 1 && ma <= 47) ? ma : 0;
}

export const musicAssemblerEncoder: VariableLengthEncoder = {
  formatId: 'musicAssembler',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    const buf: number[] = [];
    let lastInstrument = -1;

    for (let i = 0; i < rows.length; i++) {
      const cell = rows[i];
      const xmNote = cell.note ?? 0;
      const instrument = cell.instrument ?? 0;
      const isRelease = xmNote === 97;
      const maNote = xmNoteToMA(xmNote);

      // Calculate delay: count of empty rows following this one
      let delay = 0;
      for (let j = i + 1; j < rows.length; j++) {
        const next = rows[j];
        if ((next.note ?? 0) !== 0 || (next.instrument ?? 0) !== 0) break;
        delay++;
      }

      if (isRelease) {
        // Release event: b0 = 0x80 | (delay & 0x3F)
        buf.push(0x80 | (delay & 0x3F));
        i += delay; // skip the empty rows we encoded as delay
      } else if (maNote > 0) {
        const instrIdx = instrument > 0 ? instrument - 1 : -1;

        if (instrIdx >= 0 && instrIdx !== lastInstrument) {
          // Instrument + note event: 3 bytes minimum
          // b0 = 0xC0 | (instrIdx & 0x3F)
          // b1 = note & 0x3F
          // b2 = delay
          buf.push(0xC0 | (instrIdx & 0x3F));
          buf.push(maNote & 0x3F);
          buf.push(delay & 0x7F);
          lastInstrument = instrIdx;
        } else {
          // Note event (no instrument change): 2 bytes minimum
          // b0 = note & 0x3F
          // b1 = delay
          buf.push(maNote & 0x3F);
          buf.push(delay & 0x7F);
        }
        i += delay; // skip the empty rows we encoded as delay
      } else if (instrument > 0) {
        // Instrument change with no note — encode as instrument+note event with note=0
        const instrIdx = instrument - 1;
        buf.push(0xC0 | (instrIdx & 0x3F));
        buf.push(0x00); // note = 0
        buf.push(delay & 0x7F);
        lastInstrument = instrIdx;
        i += delay;
      }
      // else: empty row — will be absorbed as delay by the previous or next event
      // If this is a leading empty row with no preceding event, skip it
      // (delay is only encoded as part of an event)
    }

    // Track end marker
    buf.push(0xFF);

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(musicAssemblerEncoder);
