/**
 * DigitalSymphonyEncoder — Variable-length encoder for Digital Symphony (.dsym) patterns.
 *
 * DSym track encoding (4 bytes per row, 64 rows per track = 256 bytes):
 *   byte[0] = (note & 0x3F) | ((instr & 0x03) << 6)
 *   byte[1] = ((instr >> 2) & 0x0F) | ((command & 0x03) << 6)
 *   byte[2] = ((command >> 2) & 0x0F) | ((param & 0x0F) << 4)
 *   byte[3] = (param >> 4) & 0xFF
 *
 * Note mapping: XM note → DSym raw note = xmNote - 48 (XM note 49 = rawNote 1)
 *   rawNote 0 = no note, 1–63 valid range.
 *
 * Effect mapping: XM effects map 1:1 for standard MOD effects 0x00–0x0F.
 *   Extended DSym commands (0x10–0x32) are reverse-mapped from the parser's
 *   conversion to XM Exx sub-commands and other XM effects.
 *
 * Since DSym uses track indirection (sequence table maps pattern+channel → trackIdx),
 * this encoder outputs per-channel tracks. Each track is exactly 256 bytes.
 *
 * Parser reference: DigitalSymphonyParser.ts buildCell() (lines 912–1242)
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

/**
 * Reverse-map XM effects back to DSym command + param.
 *
 * The parser's buildCell() maps DSym commands to XM effects. This function
 * reverses that mapping. Note: some DSym commands share XM effect types
 * (e.g., 0x11 and 0x1A both produce XM E1x). Where ambiguous, we use the
 * simpler/more common DSym command.
 */
function reverseEffect(effTyp: number, eff: number, effTyp2: number, _eff2: number): { command: number; param: number } {
  if (effTyp === 0 && eff === 0 && effTyp2 === 0) return { command: 0, param: 0 };

  switch (effTyp) {
    case 0x00: // Arpeggio
      return { command: 0x00, param: eff };
    case 0x01: // Portamento up
      return { command: 0x01, param: eff };
    case 0x02: // Portamento down
      return { command: 0x02, param: eff };
    case 0x03: // Tone portamento
      return { command: 0x03, param: eff };
    case 0x04: // Vibrato
      return { command: 0x04, param: eff };
    case 0x05: // Tone porta + vol slide
      return { command: 0x05, param: eff };
    case 0x06: // Vibrato + vol slide
      return { command: 0x06, param: eff };
    case 0x07: // Tremolo
      return { command: 0x07, param: eff };
    case 0x08: // Set panning → DSym 0x30
      return { command: 0x30, param: eff };
    case 0x09: // Sample offset → DSym 0x09 (param << 1)
      return { command: 0x09, param: (eff << 1) & 0xFFF };
    case 0x0A: // Volume slide
      return { command: 0x0A, param: eff };
    case 0x0B: // Position jump
      return { command: 0x0B, param: eff };
    case 0x0C: // Set volume
      return { command: 0x0C, param: eff };
    case 0x0D: // Pattern break → DSym 0x0D (not BCD)
      return { command: 0x0D, param: eff };
    case 0x0E: {
      // Extended MOD commands → various DSym commands
      const subCmd = (eff >> 4) & 0x0F;
      const subParam = eff & 0x0F;
      switch (subCmd) {
        case 0x0: // Filter control → DSym 0x10
          return { command: 0x10, param: subParam };
        case 0x1: // Fine slide up → DSym 0x11
          return { command: 0x11, param: subParam };
        case 0x2: // Fine slide down → DSym 0x12
          return { command: 0x12, param: subParam };
        case 0x3: // Glissando → DSym 0x13
          return { command: 0x13, param: subParam };
        case 0x4: // Vibrato waveform → DSym 0x14
          return { command: 0x14, param: subParam };
        case 0x5: // Set finetune → DSym 0x15
          return { command: 0x15, param: subParam };
        case 0x6: // Jump to loop → DSym 0x16
          return { command: 0x16, param: subParam };
        case 0x7: // Tremolo waveform → DSym 0x17
          return { command: 0x17, param: subParam };
        case 0x9: // Retrig → DSym 0x19
          return { command: 0x19, param: subParam };
        case 0xA: // Fine vol slide up → DSym 0x11 (hi param)
          return { command: 0x11, param: subParam << 8 };
        case 0xB: // Fine vol slide down → DSym 0x1B (hi param)
          return { command: 0x1B, param: subParam << 8 };
        case 0xC: // Note cut → DSym 0x1C
          return { command: 0x1C, param: subParam };
        case 0xD: // Note delay → DSym 0x1D
          return { command: 0x1D, param: subParam };
        case 0xE: // Pattern delay → DSym 0x1E
          return { command: 0x1E, param: subParam };
        case 0xF: // Invert loop → DSym 0x1F
          return { command: 0x1F, param: subParam };
        default:
          return { command: 0, param: 0 };
      }
    }
    case 0x0F: // Set speed/tempo
      if (eff >= 0x20) {
        // BPM → DSym 0x2F: param = bpm * 8 - 4
        return { command: 0x2F, param: Math.max(0, eff * 8 - 4) };
      }
      return { command: 0x0F, param: eff };
    default:
      return { command: 0, param: 0 };
  }
}

export const digitalSymphonyEncoder: VariableLengthEncoder = {
  formatId: 'digitalSymphony',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    // Each track is exactly 64 rows × 4 bytes = 256 bytes
    const ROWS = 64;
    const out = new Uint8Array(ROWS * 4);

    for (let row = 0; row < ROWS; row++) {
      const cell = rows[row];
      const off = row * 4;

      if (!cell) {
        out[off] = 0;
        out[off + 1] = 0;
        out[off + 2] = 0;
        out[off + 3] = 0;
        continue;
      }

      // Note: XM note → DSym rawNote (0 = none, 1-63 valid)
      let rawNote = 0;
      const note = cell.note ?? 0;
      if (note > 0 && note !== 97) { // 97 = key-off
        rawNote = Math.max(0, Math.min(63, note - 48));
        if (rawNote <= 0) rawNote = 0;
      }

      // Key-off → DSym command 0x32 (Unset Sample Repeat)
      let keyOff = note === 97;

      // Instrument (0-63)
      const instr = (cell.instrument ?? 0) & 0x3F;

      // Effect
      let { command, param } = reverseEffect(
        cell.effTyp ?? 0, cell.eff ?? 0, cell.effTyp2 ?? 0, cell.eff2 ?? 0,
      );

      // Handle key-off: if note is 97, use command 0x32
      if (keyOff && command === 0) {
        command = 0x32;
        param = 0;
      }

      // Encode 4 bytes:
      //   byte[0] = (rawNote & 0x3F) | ((instr & 0x03) << 6)
      //   byte[1] = ((instr >> 2) & 0x0F) | ((command & 0x03) << 6)
      //   byte[2] = ((command >> 2) & 0x0F) | ((param & 0x0F) << 4)
      //   byte[3] = (param >> 4) & 0xFF
      out[off]     = (rawNote & 0x3F) | ((instr & 0x03) << 6);
      out[off + 1] = ((instr >> 2) & 0x0F) | ((command & 0x03) << 6);
      out[off + 2] = ((command >> 2) & 0x0F) | ((param & 0x0F) << 4);
      out[off + 3] = (param >> 4) & 0xFF;
    }

    return out;
  },
};

registerVariableEncoder(digitalSymphonyEncoder);
