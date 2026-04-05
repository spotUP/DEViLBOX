/**
 * AMOSMusicBankEncoder — Variable-length encoder for AMOS Music Bank (.abk) patterns.
 *
 * ABK per-channel pattern is a sequence of 2-byte big-endian words:
 *   bit15=1 → command: bits14-8=cmd(7-bit), bits7-0=param(7-bit)
 *   bit15=0 → note:
 *     bit14=0 (new format): bits11-0 = Amiga period
 *     bit14=1 (old format): bits7-0 = row delay; next word bits11-0 = period
 *   0x8000 = end of pattern
 *
 * Commands (reverse of parser decode):
 *   XM 0x01 → ABK 0x01 (portamento up)
 *   XM 0x02 → ABK 0x02 (portamento down)
 *   XM vol 0x10+v → ABK 0x03 (set volume, param=v)
 *   XM 0x0E 0x50 → ABK 0x05 param=0 (repeat mark)
 *   XM 0x0E 0x6x → ABK 0x05 param=x (repeat loop)
 *   XM 0x0E 0x00 → ABK 0x06 (filter off)
 *   XM 0x0E 0x01 → ABK 0x07 (filter on)
 *   XM 0x0F → ABK 0x08 (tempo = 100/speed)
 *   instrument → ABK 0x09 (set instrument, 0-based)
 *   XM 0x00 → ABK 0x0A (arpeggio, persistent)
 *   XM 0x03 → ABK 0x0B (tone portamento, persistent)
 *   XM 0x04 → ABK 0x0C (vibrato, persistent)
 *   XM 0x0A → ABK 0x0D (volume slide, persistent)
 *   delay → ABK 0x10 (advance rows)
 *   XM 0x0B → ABK 0x11 (position jump)
 *
 * The encoder outputs new-format patterns (no old-format flag).
 * Persistent effects are tracked: arpeggio, tone porta, vibrato, volume slide.
 * A delay command (0x10) is emitted after each row or group of rows.
 *
 * Parser reference: AMOSMusicBankParser.ts decodeABKChannelPattern() (lines 77-222)
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

// XM note → Amiga period (ProTracker period table, same as AmigaUtils)
const AMIGA_PERIODS = [
  // C-1 to B-1
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // C-2 to B-2
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // C-3 to B-3
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert XM note to Amiga period.
 * Parser uses periodToNoteIndex (1-based) + 12 offset:
 *   periodToXM(period) = periodToNoteIndex(period) + 12
 * So reverse: xmNote - 12 = noteIndex (1-based), then AMIGA_PERIODS[noteIndex-1]
 */
function xmNoteToPeriod(xmNote: number): number {
  if (xmNote === 0) return 0;
  const idx = xmNote - 12 - 1; // -12 for XM offset, -1 for 0-based
  if (idx < 0 || idx >= AMIGA_PERIODS.length) return 0;
  return AMIGA_PERIODS[idx];
}

/** Encode a big-endian 16-bit word into the buffer. */
function pushWord(buf: number[], word: number): void {
  buf.push((word >> 8) & 0xFF);
  buf.push(word & 0xFF);
}

/** Encode a command word: bit15=1, bits14-8=cmd, bits7-0=param */
function cmdWord(cmd: number, param: number): number {
  return 0x8000 | ((cmd & 0x7F) << 8) | (param & 0x7F);
}

export const amosMusicBankEncoder: VariableLengthEncoder = {
  formatId: 'amosMusicBank',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    const buf: number[] = [];
    let lastInstr = 0;

    let row = 0;
    while (row < rows.length) {
      const cell = rows[row];

      if (cell) {
        // Emit instrument change if needed
        const instr = cell.instrument ?? 0;
        if (instr > 0 && instr !== lastInstr) {
          pushWord(buf, cmdWord(0x09, instr - 1)); // 0-based
          lastInstr = instr;
        }

        // Emit volume if present (volume column)
        const vol = cell.volume ?? 0;
        if (vol >= 0x10 && vol <= 0x50) {
          pushWord(buf, cmdWord(0x03, vol - 0x10));
        }

        // Emit effect commands
        const effTyp = cell.effTyp ?? 0;
        const eff = cell.eff ?? 0;

        if (effTyp !== 0 || eff !== 0) {
          switch (effTyp) {
            case 0x00: // Arpeggio (persistent)
              if (eff !== 0) {
                pushWord(buf, cmdWord(0x0A, eff & 0x7F));
              }
              break;
            case 0x01: // Portamento up
              pushWord(buf, cmdWord(0x01, eff & 0x7F));
              break;
            case 0x02: // Portamento down
              pushWord(buf, cmdWord(0x02, eff & 0x7F));
              break;
            case 0x03: // Tone portamento (persistent)
              pushWord(buf, cmdWord(0x0B, eff & 0x7F));
              break;
            case 0x04: // Vibrato (persistent)
              pushWord(buf, cmdWord(0x0C, eff & 0x7F));
              break;
            case 0x0A: // Volume slide (persistent)
              if (eff !== 0) {
                pushWord(buf, cmdWord(0x0D, eff & 0x7F));
              } else {
                // Stop persistent effect
                pushWord(buf, cmdWord(0x04, 0));
              }
              break;
            case 0x0B: // Position jump
              pushWord(buf, cmdWord(0x11, eff & 0x7F));
              break;
            case 0x0E: {
              const sub = (eff >> 4) & 0x0F;
              const subP = eff & 0x0F;
              if (sub === 0x0 && subP <= 1) {
                // Filter: E00 = off (cmd 0x06), E01 = on (cmd 0x07)
                pushWord(buf, cmdWord(subP === 0 ? 0x06 : 0x07, 0));
              } else if (sub === 0x5) {
                // Repeat mark/loop
                pushWord(buf, cmdWord(0x05, subP));
              } else if (sub === 0x6) {
                pushWord(buf, cmdWord(0x05, subP));
              }
              break;
            }
            case 0x0F: // Speed/tempo → ABK tempo = round(100 / speed)
              if (eff > 0) {
                const amosTempo = Math.max(1, Math.min(100, Math.round(100 / eff)));
                pushWord(buf, cmdWord(0x08, amosTempo));
              }
              break;
          }
        }

        // Emit note (new format: bit15=0, bit14=0, bits11-0=period)
        const period = xmNoteToPeriod(cell.note ?? 0);
        if (period > 0) {
          pushWord(buf, period & 0x0FFF);
        }
      }

      // Count consecutive empty rows ahead for delay compression
      let delay = 1;
      while (row + delay < rows.length) {
        const nextCell = rows[row + delay];
        if (nextCell && (
          (nextCell.note ?? 0) !== 0 ||
          (nextCell.instrument ?? 0) !== 0 ||
          (nextCell.effTyp ?? 0) !== 0 ||
          (nextCell.eff ?? 0) !== 0 ||
          ((nextCell.volume ?? 0) >= 0x10 && (nextCell.volume ?? 0) <= 0x50)
        )) {
          break;
        }
        delay++;
      }

      // Emit delay command
      if (delay > 0) {
        pushWord(buf, cmdWord(0x10, Math.min(delay, 0x7F)));
      }

      row += delay;
    }

    // End of pattern marker
    pushWord(buf, 0x8000);

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(amosMusicBankEncoder);
