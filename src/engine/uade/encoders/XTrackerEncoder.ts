/**
 * XTrackerEncoder — Encodes TrackerCell back to X-Tracker DMF (.dmf) format.
 *
 * DMF uses a complex per-channel RLE pattern format with a global track
 * for tempo/BPM commands and per-channel note/effect data.
 *
 * Since DMF patterns are heavily compressed with run-length counters and
 * complex effect transformations, this encoder uses UADEVariablePatternLayout
 * for full-pattern re-serialization.
 *
 * The encoding is simplified compared to the original DMF format:
 * - No run-length packing (counter byte always 0)
 * - Note effects use simplified INS_EFF/NOTE_EFF encoding
 * - Volume effects are translated back to DMF volume commands
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

// DMF note effect commands (InsEff / NoteEff / VolEff)
// These are simplified reverse mappings from XM effects

/**
 * Reverse XM effect → DMF note effect.
 * Returns { noteEff, noteParam, volEff }
 */
function reverseXMToDMF(
  effTyp: number,
  eff: number,
): { noteEff: number; noteParam: number; volEff: number } {
  let noteEff = 0, noteParam = 0, volEff = 0;

  switch (effTyp) {
    case 0x01: noteEff = 3; noteParam = eff; break; // Porta up
    case 0x02: noteEff = 4; noteParam = eff; break; // Porta down
    case 0x03: noteEff = 5; noteParam = eff; break; // Tone porta
    case 0x04: noteEff = 6; noteParam = eff; break; // Vibrato
    case 0x0A: volEff = 1; noteParam = eff; break;   // Volume slide
    case 0x09: noteEff = 9; noteParam = eff; break;  // Sample offset
    case 0x0B: noteEff = 11; noteParam = eff; break; // Position jump
    case 0x0D: noteEff = 13; noteParam = eff; break; // Pattern break
    case 0x08: noteEff = 8; noteParam = eff; break;  // Panning
    default: break;
  }

  return { noteEff, noteParam, volEff };
}

/**
 * Encode one channel's rows into a simplified DMF note-channel format.
 * The output is a flat byte stream of per-row data, without RLE packing.
 */
function encodeDMFChannel(rows: TrackerCell[], _channel: number): Uint8Array {
  const parts: number[] = [];

  for (let row = 0; row < rows.length; row++) {
    const cell = rows[row];
    const note = cell.note ?? 0;
    const instr = cell.instrument ?? 0;
    const vol = cell.volume ?? 0;
    const { noteEff, noteParam, volEff } = reverseXMToDMF(cell.effTyp ?? 0, cell.eff ?? 0);

    // DMF channel data: info byte + optional fields
    // Info byte bits: 0x01=note, 0x02=instr, 0x04=insEff, 0x08=noteEff,
    //                 0x10=volume, 0x20=insParam, 0x40=noteParam, 0x80=pack
    let info = 0;
    if (note !== 0) info |= 0x01;
    if (instr !== 0) info |= 0x02;
    if (noteEff !== 0) info |= 0x08;
    if (vol !== 0 || volEff !== 0) info |= 0x10;
    if (noteParam !== 0) info |= 0x40;

    parts.push(info);

    if (info & 0x01) {
      // DMF note: xmNote directly (1-based)
      parts.push(note === 97 ? 0xFF : note);
    }
    if (info & 0x02) parts.push(instr);
    if (info & 0x08) parts.push(noteEff);
    if (info & 0x10) {
      // Volume: store as DMF volume (0-255, center=128)
      parts.push(Math.min(255, vol * 4));
    }
    if (info & 0x40) parts.push(noteParam);
  }

  return new Uint8Array(parts);
}

const xTrackerEncoder: VariableLengthEncoder = {
  formatId: 'dmf',
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    return encodeDMFChannel(rows, channel);
  },
};

registerVariableEncoder(xTrackerEncoder);

export { xTrackerEncoder, encodeDMFChannel };
