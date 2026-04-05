/**
 * ImagoOrpheusEncoder — Encodes TrackerCell back to Imago Orpheus (.imf) binary format.
 *
 * Cell encoding uses mask-byte packed format:
 *   mask byte per event:
 *     mask & 0x1F = channel (0-based)
 *     mask & 0x20 → note (uint8) + instrument (uint8)
 *     mask & 0xC0 == 0x40 → one effect (cmd + data, 2 bytes)
 *     mask & 0xC0 == 0x80 → one effect (cmd + data, 2 bytes)
 *     mask & 0xC0 == 0xC0 → two effects (4 bytes)
 *
 * Note encoding:
 *   0xA0 = key off
 *   0xFF = empty
 *   else: ((octave) << 4) | (semitone)
 *     where xmNote = octave*12 + semitone + 12 + 1
 *     reverse: raw = xmNote - 13, octave = floor(raw/12), semi = raw%12
 *
 * IMF uses its own effect numbering. The parser translates to XM effects;
 * the encoder reverses those translations.
 *
 * Since IMF uses packed pattern data (variable length per pattern), this format
 * uses UADEVariablePatternLayout for full-pattern re-serialization.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const NOTE_KEYOFF = 97;

// Reverse IMF_EFFECTS table: XM effect → IMF command
// This is an approximation since the mapping is many-to-one in some cases.
function reverseIMFEffect(effTyp: number, eff: number): { cmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };

  switch (effTyp) {
    case 0x0F: // Speed or tempo
      if (eff < 0x20) return { cmd: 0x01, param: eff }; // Set speed (Axx)
      return { cmd: 0x02, param: eff }; // Set BPM (Bxx)
    case 0x03: return { cmd: 0x03, param: eff }; // Tone porta (Cxx)
    case 0x05: return { cmd: 0x04, param: eff }; // Tone porta + vol slide (Dxy)
    case 0x04: return { cmd: 0x05, param: eff }; // Vibrato (Exy)
    case 0x06: return { cmd: 0x06, param: eff }; // Vibrato + vol slide (Fxy)
    case 0x07: return { cmd: 0x08, param: eff }; // Tremolo (Hxy)
    case 0x08: return { cmd: 0x0A, param: eff }; // Set pan (Jxx)
    case 0x19: return { cmd: 0x0B, param: eff }; // Pan slide (Kxy)
    case 0x0C: return { cmd: 0x0C, param: eff }; // Set volume (Lxx)
    case 0x0A: return { cmd: 0x0D, param: eff }; // Volume slide (Mxy)
    case 0x01: return { cmd: 0x12, param: eff }; // Porta up (Rxx)
    case 0x02: return { cmd: 0x13, param: eff }; // Porta down (Sxx)
    case 0x09: return { cmd: 0x18, param: eff }; // Sample offset (Xxx)
    case 0x14: return { cmd: 0x1A, param: eff }; // Key off (Zxx)
    case 0x1B: return { cmd: 0x1B, param: eff }; // Retrig (Rxy)
    case 0x0B: return { cmd: 0x1D, param: eff }; // Position jump (Txx)
    case 0x0D: return { cmd: 0x1E, param: eff }; // Pattern break (Uxx)
    case 0x10: return { cmd: 0x1F, param: Math.min(0x7F, eff >> 1) }; // Master vol
    case 0x11: return { cmd: 0x20, param: eff }; // Master vol slide (Wxy)
    case 0x0E: return { cmd: 0x21, param: eff }; // Extended (Xxx)
    default: return { cmd: 0, param: 0 };
  }
}

/** Encode note to IMF raw byte */
function encodeIMFNote(xmNote: number): number {
  if (xmNote === 0) return 0xFF; // empty
  if (xmNote === NOTE_KEYOFF) return 0xA0;
  // Reverse: xmNote = (note >> 4)*12 + (note & 0x0F) + 12 + 1
  // So raw = xmNote - 13, octave = floor(raw/12), semi = raw%12
  const raw = xmNote - 13;
  if (raw < 0 || raw >= 96) return 0xFF;
  const octave = Math.floor(raw / 12);
  const semi = raw % 12;
  return (octave << 4) | semi;
}

/**
 * Encode one channel's worth of pattern rows into IMF packed format.
 * Each cell produces: mask byte + optional note/instr + optional effect(s).
 */
function encodeIMFPatternChannel(rows: TrackerCell[], channel: number): Uint8Array {
  const parts: number[] = [];

  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    const hasNote = (cell.note ?? 0) !== 0 || (cell.instrument ?? 0) !== 0;
    const e1 = reverseIMFEffect(cell.effTyp ?? 0, cell.eff ?? 0);
    const e2 = reverseIMFEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);
    const hasEff1 = e1.cmd !== 0 || e1.param !== 0;
    const hasEff2 = e2.cmd !== 0 || e2.param !== 0;
    // Volume in effect column as CMD_VOLUME (0x0C)
    const hasVol = (cell.volume ?? 0) > 0 && !hasEff1;

    if (!hasNote && !hasEff1 && !hasEff2 && !hasVol) {
      // Empty row — write mask=0 to advance
      parts.push(0);
      continue;
    }

    let mask = channel & 0x1F;
    if (hasNote) mask |= 0x20;

    if (hasEff1 && hasEff2) {
      mask |= 0xC0; // two effects
    } else if (hasEff1 || hasVol) {
      mask |= 0x40; // one effect
    } else if (hasEff2) {
      mask |= 0x80; // one effect (second slot)
    }

    parts.push(mask);

    if (hasNote) {
      parts.push(encodeIMFNote(cell.note ?? 0));
      parts.push(cell.instrument ?? 0);
    }

    if ((mask & 0xC0) === 0xC0) {
      // Two effects
      if (hasVol) {
        parts.push(0x0C); // CMD_VOLUME
        parts.push(cell.volume ?? 0);
      } else {
        parts.push(e1.cmd);
        parts.push(e1.param);
      }
      parts.push(e2.cmd);
      parts.push(e2.param);
    } else if (mask & 0xC0) {
      // One effect
      if (hasVol) {
        parts.push(0x0C);
        parts.push(cell.volume ?? 0);
      } else if (hasEff1) {
        parts.push(e1.cmd);
        parts.push(e1.param);
      } else {
        parts.push(e2.cmd);
        parts.push(e2.param);
      }
    }
  }

  return new Uint8Array(parts);
}

const imagoOrpheusEncoder: VariableLengthEncoder = {
  formatId: 'imf',
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    return encodeIMFPatternChannel(rows, channel);
  },
};

registerVariableEncoder(imagoOrpheusEncoder);

export { imagoOrpheusEncoder, encodeIMFNote, reverseIMFEffect };
