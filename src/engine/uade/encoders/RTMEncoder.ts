/**
 * RTMEncoder — Encodes TrackerCell back to Real Tracker 2 (.rtm) packed format.
 *
 * Pattern cell encoding (packed RLE):
 *   byte 0x00 = end of row
 *   bit 0x01 = explicit channel index byte follows
 *   bit 0x02 = note byte follows (0xFE = key-off, <120: note - 1)
 *   bit 0x04 = instrument byte follows
 *   bit 0x08 = command1 byte follows
 *   bit 0x10 = param1 byte follows
 *   bit 0x20 = command2 byte follows
 *   bit 0x40 = param2 byte follows
 *
 * Note mapping:
 *   Parser: xmNote = nr + 1 (for nr < 120), 0xFE → key-off (97)
 *   Reverse: nr = xmNote - 1 (for xmNote 1-96), key-off → 0xFE
 *
 * Effect mapping:
 *   RTM uses XM-style effect numbering for commands 1-33.
 *   Panning (cmd 8): param = eff / 2 (parser doubles)
 *   Extended commands 36-40 map back from XM effects.
 *
 * Since RTM uses packed pattern data, this uses UADEVariablePatternLayout.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const XM_NOTE_OFF = 97;

/**
 * Reverse XM effect → RTM effect command + param.
 */
function reverseRTMEffect(effTyp: number, eff: number): { cmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };

  // Check for extended RTM commands first
  switch (effTyp) {
    case 0x0A: return { cmd: 36, param: eff };  // volume slide
    case 0x01: return { cmd: 37, param: eff };  // portamento up
    case 0x02: return { cmd: 38, param: eff };  // portamento down
    case 0x06: return { cmd: 39, param: eff };  // vibrato + vol
    default: break;
  }

  // Panning: parser doubled, so halve
  if (effTyp === 0x08) {
    return { cmd: 8, param: Math.min(127, Math.round(eff / 2)) };
  }

  // Standard XM effect range (1-33)
  if (effTyp >= 1 && effTyp <= 33) {
    return { cmd: effTyp, param: eff };
  }

  // Speed (0x0F) — maps to cmd 40 or standard XM 0x0F
  if (effTyp === 0x0F) {
    return { cmd: 40, param: eff };
  }

  return { cmd: 0, param: 0 };
}

/**
 * Encode one channel's rows into RTM packed format for a single channel.
 * The packed format encodes row-by-row with flag bytes.
 */
function encodeRTMChannel(rows: TrackerCell[], channel: number): Uint8Array {
  const parts: number[] = [];

  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const e1 = reverseRTMEffect(cell.effTyp ?? 0, cell.eff ?? 0);
    const e2 = reverseRTMEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);

    const hasNote = note !== 0;
    const hasInstr = instr !== 0;
    const hasCmd1 = e1.cmd !== 0;
    const hasParam1 = e1.param !== 0;
    const hasCmd2 = e2.cmd !== 0;
    const hasParam2 = e2.param !== 0;

    if (!hasNote && !hasInstr && !hasCmd1 && !hasParam1 && !hasCmd2 && !hasParam2) {
      // Empty cell — just end-of-row marker at end of each row
      parts.push(0x00);
      continue;
    }

    let flags = 0x01; // always include channel index for safety
    if (hasNote) flags |= 0x02;
    if (hasInstr) flags |= 0x04;
    if (hasCmd1) flags |= 0x08;
    if (hasParam1) flags |= 0x10;
    if (hasCmd2) flags |= 0x20;
    if (hasParam2) flags |= 0x40;

    parts.push(flags);
    parts.push(channel); // channel index

    if (hasNote) {
      if (note === XM_NOTE_OFF) {
        parts.push(0xFE);
      } else {
        parts.push(Math.max(0, note - 1)); // reverse: nr = xmNote - 1
      }
    }
    if (hasInstr) parts.push(instr);
    if (hasCmd1) parts.push(e1.cmd);
    if (hasParam1) parts.push(e1.param);
    if (hasCmd2) parts.push(e2.cmd);
    if (hasParam2) parts.push(e2.param);

    // End of row
    parts.push(0x00);
  }

  return new Uint8Array(parts);
}

const rtmEncoder: VariableLengthEncoder = {
  formatId: 'rtm',
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    return encodeRTMChannel(rows, channel);
  },
};

registerVariableEncoder(rtmEncoder);

export { rtmEncoder, encodeRTMChannel };
