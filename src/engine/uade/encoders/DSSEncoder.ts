/**
 * DSSEncoder — Encodes TrackerCell back to Digital Sound Studio (.dss) binary format.
 *
 * Cell encoding: 4 bytes
 *   AAAAABBB BBBBBBBB CCCCCCCC DDDDDDDD
 *   A = sample number (5 bits)
 *   B = period (11 bits)
 *   C = effect number
 *   D = effect argument
 *
 * Note mapping: XM note → Amiga period (finetune 0 table)
 * Effect mapping: reverse of DSS parser's switch statement
 *
 * This is the exact reverse of DigitalSoundStudioParser's decode logic.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// DSS period table (finetune 0) — 48 entries covering 4 octaves
// Index 0 = lowest pitch (highest period), corresponds to XM note 37 (C-3)
const DSS_PERIODS_FT0 = [
  1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016,  960,  906,
   856,  808,  762,  720,  678,  640,  604,  570,  538,  508,  480,  453,
   428,  404,  381,  360,  339,  320,  302,  285,  269,  254,  240,  226,
   214,  202,  190,  180,  170,  160,  151,  143,  135,  127,  120,  113,
];

/**
 * Convert XM note back to Amiga period.
 * Parser: xmNote = periodTableIndex + 37, so periodTableIndex = xmNote - 37
 */
function xmNoteToPeriod(xmNote: number): number {
  if (xmNote === 0) return 0; // no note
  const idx = xmNote - 37;
  if (idx >= 0 && idx < DSS_PERIODS_FT0.length) return DSS_PERIODS_FT0[idx];
  return 0; // out of range
}

/**
 * Reverse-translate XM effect → DSS effect.
 * This reverses the parser's switch statement.
 */
function reverseEffect(effTyp: number, eff: number): { effect: number; effectArg: number } {
  if (effTyp === 0 && eff === 0) return { effect: 0, effectArg: 0 };

  switch (effTyp) {
    case 0x00: return { effect: 0x00, effectArg: eff }; // Arpeggio
    case 0x01: return { effect: 0x01, effectArg: eff }; // Portamento up
    case 0x02: return { effect: 0x02, effectArg: eff }; // Portamento down
    case 0x03: return { effect: 0x1B, effectArg: eff }; // Tone portamento → DSS 0x1B
    case 0x0A: return { effect: 0x0A, effectArg: eff }; // Volume slide
    case 0x0B: return { effect: 0x06, effectArg: eff }; // Position jump → DSS 0x06
    case 0x0C: return { effect: 0x03, effectArg: eff }; // Set volume → DSS 0x03
    case 0x0F: // Set speed/tempo
      // DSS 0x05 = set speed (low values), DSS 0x0B = set tempo (high values)
      if (eff >= 32) return { effect: 0x0B, effectArg: eff };
      return { effect: 0x05, effectArg: eff };
    default: return { effect: 0, effectArg: 0 };
  }
}

/**
 * Encode a TrackerCell to DSS binary format (4 bytes).
 */
function encodeDSSCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);

  const sample = cell.instrument ?? 0;
  const period = xmNoteToPeriod(cell.note ?? 0);
  const { effect, effectArg } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);

  // Byte 0: sample[4:0] << 3 | period[10:8]
  out[0] = ((sample & 0x1F) << 3) | ((period >> 8) & 0x07);
  // Byte 1: period[7:0]
  out[1] = period & 0xFF;
  // Byte 2: effect number
  out[2] = effect & 0xFF;
  // Byte 3: effect argument
  out[3] = effectArg & 0xFF;

  return out;
}

// Register in the encoder registry
registerPatternEncoder('dss', () => encodeDSSCell);

export { encodeDSSCell };
