/**
 * CDFM67Encoder — Encodes TrackerCell back to Composer 670 (.c67) binary format.
 *
 * C67 uses a command-stream pattern format:
 *   cmd 0x00-0x0C: note + instrVol on channel (cmd = channel index)
 *   cmd 0x20-0x2C: volume only on channel (cmd - 0x20 = channel)
 *   cmd 0x40: delay (advance N rows)
 *   cmd 0x60: end of pattern
 *
 * Note encoding:
 *   bits[3:0] = semitone, bits[6:4] = octave, bit[7] = instrument bit 4
 *   instrVol: bits[7:4] = instrument low 4 bits, bits[3:0] = volume
 *
 * Since the format uses a command stream (not fixed-size cells), this
 * encoder uses UADEVariablePatternLayout for full-pattern re-serialization.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const NUM_PCM_CHANNELS = 4;
const NUM_FM_INSTRS = 32;

// Reverse volume translation tables
const FM_VOLUME_REVERSE: Map<number, number> = new Map([
  [0x08, 0], [0x10, 1], [0x18, 2], [0x20, 3],
  [0x28, 4], [0x2C, 5], [0x30, 6], [0x34, 7],
  [0x36, 8], [0x38, 9], [0x3A, 10], [0x3C, 11],
  [0x3D, 12], [0x3E, 13], [0x3F, 14], [0x40, 15],
]);

function reverseVolume(vol: number, isFM: boolean): number {
  if (isFM) {
    // Find closest FM volume nibble
    let bestNibble = 0;
    let bestDist = 999;
    for (const [fmVol, nibble] of FM_VOLUME_REVERSE) {
      const dist = Math.abs(fmVol - vol);
      if (dist < bestDist) { bestDist = dist; bestNibble = nibble; }
    }
    return bestNibble;
  }
  // PCM: vol = 4 + nibble*4 → nibble = (vol - 4) / 4
  return Math.max(0, Math.min(15, Math.round((vol - 4) / 4)));
}

/**
 * Encode a full pattern (all channels) into C67 command stream.
 * This encoder handles ALL channels at once since C67 interleaves them.
 */
function encodeC67Pattern(allChannelRows: TrackerCell[][], numRows: number): Uint8Array {
  const parts: number[] = [];
  let skipCount = 0;

  for (let row = 0; row < numRows; row++) {
    let hasData = false;

    for (let ch = 0; ch < allChannelRows.length; ch++) {
      const cell = allChannelRows[ch][row];
      if (!cell) continue;

      const hasNote = (cell.note ?? 0) !== 0;
      const hasVol = (cell.volume ?? 0) !== 0;
      const isFM = ch >= NUM_PCM_CHANNELS;

      if (hasNote) {
        // Flush any pending delay
        if (skipCount > 0) {
          parts.push(0x40);
          parts.push(skipCount);
          skipCount = 0;
        }

        const xmNote = cell.note ?? 0;
        const instr = (cell.instrument ?? 1) - 1; // 1-based → 0-based

        // Reverse note: xmNote = 1 + noteBase + semitone + octave * 12
        const noteBase = isFM ? 12 : 36;
        const raw = xmNote - 1 - noteBase;
        const octave = Math.max(0, Math.min(7, Math.floor(raw / 12)));
        const semitone = Math.max(0, Math.min(11, raw - octave * 12));

        // Reverse instrument: PCM uses 0-31, FM uses 32-63 in pattern
        const instrBase = isFM ? NUM_FM_INSTRS : 0;
        const instrIdx = Math.max(0, instr - instrBase);

        // note byte: bits[3:0]=semitone, bits[6:4]=octave, bit[7]=instr bit4
        const noteByte = semitone | (octave << 4) | ((instrIdx & 0x10) << 3);
        // instrVol byte: bits[7:4]=instr low 4 bits, bits[3:0]=volume
        const volNibble = reverseVolume(cell.volume ?? 0, isFM);
        const instrVolByte = ((instrIdx & 0x0F) << 4) | (volNibble & 0x0F);

        parts.push(ch); // channel command
        parts.push(noteByte);
        parts.push(instrVolByte);
        hasData = true;
      } else if (hasVol) {
        // Volume-only command
        if (skipCount > 0) {
          parts.push(0x40);
          parts.push(skipCount);
          skipCount = 0;
        }
        const volNibble = reverseVolume(cell.volume ?? 0, isFM);
        parts.push(0x20 + ch);
        parts.push(volNibble & 0x0F);
        hasData = true;
      }
    }

    if (!hasData) {
      skipCount++;
    } else {
      skipCount = 0;
    }
  }

  // End of pattern
  parts.push(0x60);

  return new Uint8Array(parts);
}

const cdfm67Encoder: VariableLengthEncoder = {
  formatId: 'c67',
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    // C67 patterns must be encoded with all channels at once.
    // When called per-channel, we just encode this single channel's data.
    // The caller must aggregate. Return a placeholder per-channel encoding.
    return encodeC67SingleChannel(rows, channel);
  },
};

/** Per-channel encoding for C67 (single channel command stream). */
function encodeC67SingleChannel(rows: TrackerCell[], channel: number): Uint8Array {
  const parts: number[] = [];
  const isFM = channel >= NUM_PCM_CHANNELS;

  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    const hasNote = (cell.note ?? 0) !== 0;
    const hasVol = (cell.volume ?? 0) !== 0;

    if (hasNote) {
      const xmNote = cell.note ?? 0;
      const instr = (cell.instrument ?? 1) - 1;
      const noteBase = isFM ? 12 : 36;
      const raw = xmNote - 1 - noteBase;
      const octave = Math.max(0, Math.min(7, Math.floor(raw / 12)));
      const semitone = Math.max(0, Math.min(11, raw - octave * 12));
      const instrBase = isFM ? NUM_FM_INSTRS : 0;
      const instrIdx = Math.max(0, instr - instrBase);

      const noteByte = semitone | (octave << 4) | ((instrIdx & 0x10) << 3);
      const volNibble = reverseVolume(cell.volume ?? 0, isFM);
      const instrVolByte = ((instrIdx & 0x0F) << 4) | (volNibble & 0x0F);

      parts.push(channel);
      parts.push(noteByte);
      parts.push(instrVolByte);
    } else if (hasVol) {
      const volNibble = reverseVolume(cell.volume ?? 0, isFM);
      parts.push(0x20 + channel);
      parts.push(volNibble & 0x0F);
    }
  }

  return new Uint8Array(parts);
}

registerVariableEncoder(cdfm67Encoder);

export { cdfm67Encoder, encodeC67Pattern, encodeC67SingleChannel };
