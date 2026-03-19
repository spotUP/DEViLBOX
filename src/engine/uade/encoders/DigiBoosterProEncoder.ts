/**
 * DigiBoosterProEncoder — Variable-length encoder for DigiBooster Pro (.dbm) pattern data.
 *
 * DBM uses packed pattern data with a mask-based compression:
 *   0x00 = end of row
 *   ch (1-based), then mask byte:
 *     bit 0: note follows
 *     bit 1: instrument follows
 *     bit 2: c2 (command2) follows
 *     bit 3: p2 (param2) follows
 *     bit 4: c1 (command1) follows
 *     bit 5: p1 (param1) follows
 *
 * Note encoding: key-off → 0x1F; else ((xmNote - 13) / 12 << 4) | ((xmNote - 13) % 12)
 *   Reverse of parser: cell.note = ((rawNote >> 4) * 12) + (rawNote & 0x0F) + 13
 *
 * Effect reverse mapping (XM effTyp → DBM command):
 *   Must reverse the convertDBMEffect() mapping from the parser.
 *
 * This encodes an entire pattern (all channels, all rows) as one byte stream,
 * matching the packed PATT chunk format.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

// Reverse of DBM_EFFECT_MAP from parser: XM effTyp → DBM command
// Only for effects that have a clean 1:1 mapping
const XM_TO_DBM: Map<number, number> = new Map([
  [0x00, 0],   // Arpeggio
  [0x01, 1],   // Portamento Up
  [0x02, 2],   // Portamento Down
  [0x03, 3],   // Tone Portamento
  [0x04, 4],   // Vibrato
  [0x05, 5],   // Tone Porta + Vol Slide
  [0x06, 6],   // Vibrato + Vol Slide
  [0x07, 7],   // Tremolo
  [0x08, 8],   // Set Panning
  [0x09, 9],   // Sample Offset
  [0x0A, 10],  // Volume Slide
  [0x0B, 11],  // Position Jump
  [0x0C, 12],  // Set Volume
  [0x0D, 13],  // Pattern Break
  [0x0E, 14],  // Extended (Exx)
  [0x0F, 15],  // Set Tempo/Speed
  [0x10, 16],  // Global Volume
  [0x11, 17],  // Global Vol Slide
  [0x14, 20],  // Key Off
  [0x15, 21],  // Set Envelope Position
  [0x19, 25],  // Panning Slide
]);

function reverseDBMEffect(effTyp: number, eff: number): { cmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };

  const dbmCmd = XM_TO_DBM.get(effTyp);
  if (dbmCmd === undefined) return { cmd: 0, param: 0 };

  let param = eff;

  switch (dbmCmd) {
    case 13: // Pattern break: decimal → packed BCD
      param = ((Math.floor(eff / 10) & 0x0F) << 4) | (eff % 10);
      break;
    case 16: // Global volume: XM 0-128 → DBM 0-64
      param = Math.min(64, Math.floor(eff / 2));
      break;
    default:
      break;
  }

  return { cmd: dbmCmd, param };
}

/**
 * Convert XM note to DBM raw note byte.
 * Parser: ((rawNote >> 4) * 12) + (rawNote & 0x0F) + 13
 * Reverse: semi = xmNote - 13; rawNote = (floor(semi/12) << 4) | (semi % 12)
 */
function xmNoteToDBM(xmNote: number): number {
  if (xmNote === 97) return 0x1F; // key-off
  if (xmNote <= 0) return 0;
  const semi = xmNote - 13;
  if (semi < 0 || semi >= 120) return 0;
  const octave = Math.floor(semi / 12);
  const noteInOctave = semi % 12;
  return (octave << 4) | noteInOctave;
}

export const digiBoosterProEncoder: VariableLengthEncoder = {
  formatId: 'digiBoosterPro',

  /**
   * Encode all rows across all channels for one pattern.
   * The `rows` parameter here receives rows for a SINGLE channel (per VariableLengthEncoder contract).
   * But DBM packs all channels row-by-row. So this encoder handles one channel at a time —
   * the UADEVariablePatternLayout's trackMap maps each (pattern, channel) to a file pattern.
   *
   * Actually, DBM packs ALL channels in a single stream per pattern.
   * Since VariableLengthEncoder works per-channel, we encode just this channel's
   * contribution. The chip editor must re-assemble all channels.
   *
   * For simplicity, we encode this single channel's data with row terminators.
   * Each row: [ch(1-based), mask, ...fields, 0x00 end-of-row]
   */
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    const buf: number[] = [];
    const ch1 = channel + 1; // 1-based

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const effTyp2 = cell.effTyp2 ?? 0;
      const eff2 = cell.eff2 ?? 0;

      const hasNote = note !== 0;
      const hasInstr = instr !== 0;
      const fx1 = reverseDBMEffect(effTyp, eff);
      const fx2 = reverseDBMEffect(effTyp2, eff2);
      const hasFx1Cmd = fx1.cmd !== 0 || fx1.param !== 0;
      const hasFx2Cmd = fx2.cmd !== 0 || fx2.param !== 0;

      // Skip completely empty cells
      if (!hasNote && !hasInstr && !hasFx1Cmd && !hasFx2Cmd) {
        // Still need row terminator if this is the only channel
        // But since we encode per-channel, we just emit the row end
        buf.push(0x00);
        continue;
      }

      buf.push(ch1);

      // Build mask
      let mask = 0;
      if (hasNote) mask |= 0x01;
      if (hasInstr) mask |= 0x02;
      if (hasFx2Cmd) {
        if (fx2.cmd !== 0) mask |= 0x04; // c2
        if (fx2.param !== 0 || fx2.cmd !== 0) mask |= 0x08; // p2
      }
      if (hasFx1Cmd) {
        if (fx1.cmd !== 0) mask |= 0x10; // c1
        if (fx1.param !== 0 || fx1.cmd !== 0) mask |= 0x20; // p1
      }

      buf.push(mask);

      // Emit fields in read order: note, instr, c2, p2, c1, p1
      if (mask & 0x01) buf.push(xmNoteToDBM(note));
      if (mask & 0x02) buf.push(instr & 0xFF);
      if (mask & 0x04) buf.push(fx2.cmd & 0xFF);
      if (mask & 0x08) buf.push(fx2.param & 0xFF);
      if (mask & 0x10) buf.push(fx1.cmd & 0xFF);
      if (mask & 0x20) buf.push(fx1.param & 0xFF);

      // Row end
      buf.push(0x00);
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(digiBoosterProEncoder);
