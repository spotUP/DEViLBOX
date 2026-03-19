/**
 * GDMEncoder — Variable-length encoder for General DigiMusic (.gdm) pattern data.
 *
 * GDM pattern format:
 *   Each row: channel events followed by 0x00 (end of row)
 *   Channel event byte: channel (bits 0-4) + flags (bits 5-6)
 *     bit 5 (NOTE_FLAG): note + instrument follow (2 bytes)
 *     bit 6 (EFFECT_FLAG): effect chain follows
 *       Each effect: effByte (type in bits 0-4, EFFECT_MORE=bit 5), param
 *
 * Note encoding:
 *   0 = no note
 *   ((octave << 4) | semitone) + 1  (from parser: noteByte = (rawNote & 0x7F) - 1)
 *
 * Effect reverse mapping: XM effTyp → GDM effect index (reverse of GDM_EFF_TRANS).
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

// Reverse of GDM_EFF_TRANS: XM effTyp → GDM effect index
const XM_TO_GDM: Map<number, number> = new Map([
  // [0x00, 0x10],  // Arpeggio → GDM 0x10 (NOT 0x00 which is "none")
  [0x01, 0x01],  // Porta up
  [0x02, 0x02],  // Porta down
  [0x03, 0x03],  // Tone porta
  [0x04, 0x04],  // Vibrato
  [0x05, 0x05],  // Tone porta + vol slide
  [0x06, 0x06],  // Vibrato + vol slide
  [0x07, 0x07],  // Tremolo
  [0x09, 0x09],  // Sample offset
  [0x0A, 0x0A],  // Volume slide
  [0x0B, 0x0B],  // Position jump
  [0x0C, 0x0C],  // Set volume
  [0x0D, 0x0D],  // Pattern break
  [0x0E, 0x0E],  // Mod cmd extended
  [0x0F, 0x0F],  // Set speed
  [0x10, 0x13],  // Global volume
  [0x15, 0x14],  // Fine vibrato
  [0x1B, 0x12],  // Retrig
  [0x1D, 0x08],  // Tremor
  [0x1E, 0x1E],  // S3M cmd extended
  [0x1F, 0x1F],  // Tempo
]);

/**
 * Convert XM note back to GDM raw note byte.
 * Parser: xmNote = octave * 12 + semitone + 13
 * Reverse: semi = xmNote - 13; octave = floor(semi / 12); noteInOctave = semi % 12
 * GDM byte: ((octave << 4) | noteInOctave) + 1
 */
function xmNoteToGDM(xmNote: number): number {
  if (xmNote <= 0) return 0;
  const semi = xmNote - 13;
  if (semi < 0 || semi >= 120) return 0;
  const octave = Math.floor(semi / 12);
  const noteInOctave = semi % 12;
  return ((octave << 4) | noteInOctave) + 1;
}

function reverseGDMEffect(effTyp: number, eff: number): { gdmCmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { gdmCmd: 0, param: 0 };

  // Special case: arpeggio (XM 0x00 with non-zero param)
  if (effTyp === 0x00 && eff !== 0) return { gdmCmd: 0x10, param: eff };

  const gdmCmd = XM_TO_GDM.get(effTyp);
  if (gdmCmd === undefined) return { gdmCmd: 0, param: 0 };

  let param = eff;

  // Reverse specific fixups from translateGDMEffect
  switch (gdmCmd) {
    case 0x01: // portaUp: parser clamped >= 0xE0 to 0xDF
    case 0x02: // portaDn: same clamp
      break;
    case 0x05: // tonePortaVol: parser kept only non-zero nibble
    case 0x06: // vibratoVol: same
      break;
    case 0x0E: {
      // modCmdEx: parser converted E8x → portaUp(0xE0|x), E9x → portaDn(0xE0|x)
      // Those were redirected to effTyp 0x01/0x02, not 0x0E, so they won't reach here
      break;
    }
    default:
      break;
  }

  return { gdmCmd, param };
}

export const gdmEncoder: VariableLengthEncoder = {
  formatId: 'gdm',

  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    const buf: number[] = [];
    const ch = channel & 0x1F;

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;
      const effTyp2 = cell.effTyp2 ?? 0;
      const eff2 = cell.eff2 ?? 0;
      const vol = cell.volume ?? 0;

      const hasNote = note !== 0 || instr !== 0;
      const fx1 = reverseGDMEffect(effTyp, eff);
      const hasFx1 = fx1.gdmCmd !== 0 || fx1.param !== 0;
      // Volume column: GDM stores volume as effect CMD_VOLUME (0x0C)
      const hasVol = vol > 0;
      const fx2 = reverseGDMEffect(effTyp2, eff2);
      const hasFx2 = fx2.gdmCmd !== 0 || fx2.param !== 0;

      const hasAnyEffect = hasFx1 || hasVol || hasFx2;

      if (!hasNote && !hasAnyEffect) {
        buf.push(0x00); // end of row
        continue;
      }

      let channelByte = ch;
      if (hasNote) channelByte |= 0x20;  // NOTE_FLAG
      if (hasAnyEffect) channelByte |= 0x40;  // EFFECT_FLAG

      buf.push(channelByte);

      if (hasNote) {
        buf.push(xmNoteToGDM(note));
        buf.push(instr & 0xFF);
      }

      if (hasAnyEffect) {
        // Build chain of effects. Each effect byte: type (bits 0-4), EFFECT_MORE (bit 5)
        const effects: Array<{ cmd: number; param: number }> = [];

        if (hasFx1) effects.push({ cmd: fx1.gdmCmd, param: fx1.param });
        if (hasVol) effects.push({ cmd: 0x0C, param: Math.min(vol, 64) }); // CMD_VOLUME
        if (hasFx2) effects.push({ cmd: fx2.gdmCmd, param: fx2.param });

        for (let i = 0; i < effects.length; i++) {
          const isLast = (i === effects.length - 1);
          let effByte = effects[i].cmd & 0x1F;
          if (!isLast) effByte |= 0x20; // EFFECT_MORE
          buf.push(effByte);
          buf.push(effects[i].param & 0xFF);
        }
      }

      buf.push(0x00); // end of row
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(gdmEncoder);
