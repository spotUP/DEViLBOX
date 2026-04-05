/**
 * MusicLineEncoder.ts — Variable-length encoder for MusicLine Editor (.ml) patterns.
 *
 * MusicLine PART format (decompressed, single-voice):
 *   128 rows × 12 bytes/row = 1536 bytes total
 *   Per row (12 bytes):
 *     byte 0:  note (0=rest, 1-60=musical, 61=end-of-part sentinel)
 *     byte 1:  instrument (1-based; 0=no change; 0xFF=no change sentinel)
 *     bytes 2-3:   effect slot 0 (effectNum, effectPar)
 *     bytes 4-5:   effect slot 1
 *     bytes 6-7:   effect slot 2
 *     bytes 8-9:   effect slot 3
 *     bytes 10-11: effect slot 4
 *
 * Note mapping (from MusicLineParser buildPattern):
 *   ML note 25 = C-1, 37 = C-2, 49 = C-3
 *   XM note = mlNote - 12   (reverse: mlNote = xmNote + 12)
 *   ML note 61 = end-of-part sentinel (not musical)
 *
 * Effect reverse mapping (from mapMLEffect):
 *   XM 0x01 → ML 0x01 (SlideUp) or ML 0x05 (PitchUp) — use 0x01
 *   XM 0x02 → ML 0x02 (SlideDown) or ML 0x06 (PitchDown) — use 0x02
 *   XM 0x03 → ML 0x03 (Portamento)
 *   XM 0x0C → ML 0x10 (Volume)
 *   XM 0x0A up → ML 0x11 (VolumeSlideUp), param = high nibble
 *   XM 0x0A down → ML 0x12 (VolumeSlideDown), param = low nibble
 *   XM 0x0F → ML 0x40 (SpeedPart) or ML 0x42 (SpeedAll) — use 0x40
 *
 * Since PART data is RLE-compressed in the file, this uses UADEVariablePatternLayout.
 * The encoder produces the decompressed 1536-byte (128 rows × 12 bytes) format.
 * RLE re-compression happens at the export layer.
 *
 * Parser reference: MusicLineParser.ts buildPattern lines 645-731
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const PART_ROWS = 128;
const PART_ROW_BYTES = 12;

/** Reverse XM effect → MusicLine effect number + parameter */
function xmEffectToML(effTyp: number, eff: number): { num: number; par: number } {
  switch (effTyp) {
    case 0x01: return { num: 0x01, par: eff };  // SlideUp / portamento up
    case 0x02: return { num: 0x02, par: eff };  // SlideDown / portamento down
    case 0x03: return { num: 0x03, par: eff };  // Portamento / tone portamento
    case 0x0C: return { num: 0x10, par: eff };  // Volume → set volume
    case 0x0A: {
      // Volume slide: XM high nibble = up, low nibble = down
      const upVal = (eff >> 4) & 0x0F;
      const downVal = eff & 0x0F;
      if (upVal > 0) return { num: 0x11, par: upVal };   // VolumeSlideUp
      if (downVal > 0) return { num: 0x12, par: downVal }; // VolumeSlideDown
      return { num: 0, par: 0 };
    }
    case 0x0F: return { num: 0x40, par: eff };  // SpeedPart
    default:   return { num: 0, par: 0 };
  }
}

export const musicLineEncoder: VariableLengthEncoder = {
  formatId: 'musicLine',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    // Always produce exactly 128 rows × 12 bytes = 1536 bytes (decompressed PART)
    const out = new Uint8Array(PART_ROWS * PART_ROW_BYTES);

    for (let row = 0; row < PART_ROWS; row++) {
      const rowBase = row * PART_ROW_BYTES;

      if (row >= rows.length) {
        // Past end of provided rows — fill with empty
        // (all zeros = note 0 = rest, instrument 0 = no change)
        continue;
      }

      const cell = rows[row];

      // Byte 0: note (reverse: xmNote + 12 → mlNote; 0 → 0 rest)
      const xmNote = cell.note ?? 0;
      if (xmNote > 0) {
        out[rowBase] = Math.max(1, Math.min(60, xmNote + 12));
      } else {
        out[rowBase] = 0; // rest
      }

      // Byte 1: instrument
      // Parser: instrRaw > 0 && instrRaw !== 0xFF → cell.instrument = instrRaw
      // Reverse: cell.instrument > 0 → instrRaw = instrument; else 0 (no change)
      const instr = cell.instrument ?? 0;
      out[rowBase + 1] = instr > 0 ? (instr & 0xFF) : 0;

      // Effect slots 0-4 (bytes 2-11, 2 bytes each: effectNum + effectPar)
      const effs: Array<{ typ: number; par: number }> = [
        { typ: cell.effTyp ?? 0, par: cell.eff ?? 0 },
        { typ: cell.effTyp2 ?? 0, par: cell.eff2 ?? 0 },
        { typ: cell.effTyp3 ?? 0, par: cell.eff3 ?? 0 },
        { typ: cell.effTyp4 ?? 0, par: cell.eff4 ?? 0 },
        { typ: cell.effTyp5 ?? 0, par: cell.eff5 ?? 0 },
      ];

      for (let slot = 0; slot < 5; slot++) {
        const e = effs[slot];
        if (e.typ !== 0 || e.par !== 0) {
          const { num, par } = xmEffectToML(e.typ, e.par);
          out[rowBase + 2 + slot * 2] = num & 0xFF;
          out[rowBase + 3 + slot * 2] = par & 0xFF;
        }
      }
    }

    return out;
  },
};

registerVariableEncoder(musicLineEncoder);
