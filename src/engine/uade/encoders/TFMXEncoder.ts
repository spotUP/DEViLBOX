/**
 * TFMXEncoder — Encodes TrackerCell back to TFMX pattern command longword (4 bytes).
 *
 * TFMX pattern commands are 4-byte big-endian longwords:
 *   byte[0]: note/command type
 *     < 0x80: note with immediate fetch (byte[3] = detune)
 *     0x80-0xBF: note with wait (byte[3] = wait jiffies)
 *     0xC0-0xEF: portamento
 *     0xF0-0xFF: pattern command (end, loop, wait, stop, key-up, etc.)
 *   byte[1]: macro (instrument) number
 *   byte[2]: (relVolume << 4) | lower nibble
 *   byte[3]: wait/detune/param
 *
 * Note mapping (reverse of parser):
 *   tfmxNote = (xmNote - 13) & 0x3F
 *   macro = instrument - 1 (0-based)
 *   relVol = Math.round(volume / 4)  (0-15)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeTFMXCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  const vol = cell.volume ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  // Pattern commands: encode special effect types back to TFMX commands
  if (note === 0 && instr === 0) {
    if (effTyp === 0x0D) {
      // Pattern break → F0 (End pattern)
      out[0] = 0xF0;
      return out;
    }
    if (effTyp === 0x0F && eff > 0) {
      // Speed effect with no note → F3 (Wait command)
      out[0] = 0xF3;
      out[1] = Math.max(0, eff - 1) & 0xFF; // F3 waits b1+1 jiffies
      return out;
    }
  }

  // Key-off → F5 (Key-up)
  if (note === 97) {
    out[0] = 0xF5;
    return out;
  }

  // Note event
  if (note > 0 && note < 97) {
    const tfmxNote = Math.max(0, Math.min(0x3F, note - 13));
    const macro = Math.max(0, instr - 1) & 0x7F;
    const relVol = Math.min(15, Math.round(vol / 4));
    const wait = (effTyp === 0x0F) ? eff : 0;

    // If wait > 0, set bit 7 (note with wait); otherwise immediate fetch
    out[0] = wait > 0 ? (tfmxNote | 0x80) : tfmxNote;
    out[1] = macro;
    out[2] = (relVol << 4) & 0xF0;
    out[3] = wait > 0 ? (wait & 0xFF) : 0;
    return out;
  }

  // Portamento (effTyp 0x03)
  if (effTyp === 0x03 && note > 0) {
    const tfmxNote = Math.max(0, Math.min(0x3F, note - 13));
    out[0] = tfmxNote | 0xC0;
    out[1] = Math.max(0, instr - 1) & 0x7F;
    out[2] = (Math.min(15, Math.round(vol / 4)) << 4) & 0xF0;
    out[3] = eff & 0xFF;
    return out;
  }

  // Empty cell or unrecognised → NOP (0xFF)
  out[0] = 0xFF;
  return out;
}

registerPatternEncoder('tfmx', () => encodeTFMXCell);

export { encodeTFMXCell };
