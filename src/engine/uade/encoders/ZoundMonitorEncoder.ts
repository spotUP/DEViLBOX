/**
 * ZoundMonitorEncoder — Encodes TrackerCell back to ZoundMonitor (.sng) format.
 *
 * Cell encoding (4 bytes, stored as u32BE bitfield):
 *   Bit 31:      DMA control flag (always 0 on encode — runtime-only flag)
 *   Bits 29-24:  Note number (0=none, 1-36=notes, 63=note-off)
 *   Bits 23-20:  Sample number (0-15)
 *   Bits 19-16:  Control nibble (effect flags)
 *   Bits 15-8:   Volume add (signed byte, stored unsigned)
 *   Bits 7-0:    Effect parameter
 *
 * Note mapping:
 *   Parser: zmNote → zmNoteToXM: zmNote + 36 = xmNote; 63 → 97 (note-off)
 *   Reverse: xmNote → zmNote = xmNote - 36; 97 → 63
 *
 * Effect mapping:
 *   Parser: zmEffectToXM maps control nibble bits to XM effects
 *     bit 0 only:  Arpeggio → XM 0xy
 *     bit 1 only:  Slide → XM 1xx/2xx
 *     bits 0+1:    Portamento → XM 3xx
 *   Reverse: XM effect → control nibble + param
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeZoundMonitorCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  // Reverse note mapping: xmNote → zmNote
  let zmNote = 0;
  if (note === 97) {
    zmNote = 63; // note-off
  } else if (note > 36 && note <= 72) {
    zmNote = note - 36; // XM 37 → ZM 1, XM 72 → ZM 36
  }

  // Reverse effect mapping: XM effect → control nibble + param
  let control = 0;
  let effectParam = 0;

  switch (effTyp) {
    case 0x00: // Arpeggio
      if (eff !== 0) {
        control = 0x01; // bit 0 = arpeggio
        effectParam = eff;
      }
      break;
    case 0x01: // Portamento up → slide with negative param
      control = 0x02; // bit 1 = slide
      effectParam = (256 - Math.min(eff, 255)) & 0xFF; // negative = slide up
      break;
    case 0x02: // Portamento down → slide with positive param
      control = 0x02; // bit 1 = slide
      effectParam = Math.min(eff, 255);
      break;
    case 0x03: // Tone portamento → ultra-slide
      control = 0x03; // bits 0+1
      effectParam = eff;
      break;
    default:
      break;
  }

  // Volume column: parser encodes as 0x10 + effectiveVol when volAdd or table volume present
  // Reverse: if volume column has 0x10-0x50, compute volAdd as delta from 64
  let volAdd = 0;
  const vol = cell.volume ?? 0;
  if (vol >= 0x10 && vol <= 0x50) {
    volAdd = (vol - 0x10) - 64; // effective vol - base 64
  }
  // Clamp volAdd to signed byte range
  const volAddByte = volAdd < 0 ? (256 + volAdd) & 0xFF : volAdd & 0xFF;

  // Pack as u32BE: [bit31=dma][bit30=0][bits29-24=note][bits23-20=sample][bits19-16=control][bits15-8=volAdd][bits7-0=param]
  const word = ((zmNote & 0x3F) << 24)
    | ((instr & 0x0F) << 20)
    | ((control & 0x0F) << 16)
    | ((volAddByte & 0xFF) << 8)
    | (effectParam & 0xFF);

  out[0] = (word >>> 24) & 0xFF;
  out[1] = (word >>> 16) & 0xFF;
  out[2] = (word >>> 8) & 0xFF;
  out[3] = word & 0xFF;

  return out;
}

registerPatternEncoder('zoundMonitor', () => encodeZoundMonitorCell);

export { encodeZoundMonitorCell };
