/**
 * Furnace pattern parsing — pattern data reading, note conversion, effect mapping.
 *
 * Handles both PATN (new) and PATR (old) pattern formats.
 */

import { BinaryReader } from '../../../../utils/BinaryReader';
import { readString } from './FurnaceBinaryReader';

// Note conversion tables from fur.cpp
const newFormatNotes: number[] = [
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -5
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -4
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -3
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -2
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, // -1
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  0
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  1
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  2
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  3
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  4
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  5
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  6
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  7
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, //  8
  12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11  //  9
];

const newFormatOctaves: number[] = [
  250, 251, 251, 251, 251, 251, 251, 251, 251, 251, 251, 251, // -5
  251, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, 252, // -4
  252, 253, 253, 253, 253, 253, 253, 253, 253, 253, 253, 253, // -3
  253, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, // -2
  254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, // -1
  255,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0, //  0
    0,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1, //  1
    1,   2,   2,   2,   2,   2,   2,   2,   2,   2,   2,   2, //  2
    2,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3,   3, //  3
    3,   4,   4,   4,   4,   4,   4,   4,   4,   4,   4,   4, //  4
    4,   5,   5,   5,   5,   5,   5,   5,   5,   5,   5,   5, //  5
    5,   6,   6,   6,   6,   6,   6,   6,   6,   6,   6,   6, //  6
    6,   7,   7,   7,   7,   7,   7,   7,   7,   7,   7,   7, //  7
    7,   8,   8,   8,   8,   8,   8,   8,   8,   8,   8,   8, //  8
    8,   9,   9,   9,   9,   9,   9,   9,   9,   9,   9,   9  //  9
];

// Special note values
export const NOTE_OFF = 180;
export const NOTE_RELEASE = 181;
export const MACRO_RELEASE = 182;

// Pattern cell
export interface FurnacePatternCell {
  note: number;       // 0-179 = note, 180 = off, 181 = release, 182 = macro release
  octave: number;     // -5 to 9 (stored as signed)
  instrument: number; // -1 = none
  volume: number;     // -1 = none
  effects: Array<{ type: number; value: number }>;
}

// Pattern
export interface FurnacePattern {
  subsong: number;
  channel: number;
  index: number;
  name: string;
  rows: FurnacePatternCell[];
}

/** Converted pattern cell in XM-compatible format (supports up to 8 Furnace effect slots) */
export interface ConvertedPatternCell {
  note: number;
  instrument: number;
  volume: number;
  effectType: number;
  effectParam: number;
  effectType2: number;
  effectParam2: number;
  effectType3?: number;  effectParam3?: number;
  effectType4?: number;  effectParam4?: number;
  effectType5?: number;  effectParam5?: number;
  effectType6?: number;  effectParam6?: number;
  effectType7?: number;  effectParam7?: number;
  effectType8?: number;  effectParam8?: number;
}

// Forward-declared subsong type for parsePattern's parameter
export interface FurnaceSubSongRef {
  patLen: number;
  effectColumns: number[];
}

/**
 * Parse pattern
 */
export function parsePattern(
  reader: BinaryReader,
  _chans: number,
  subsongs: FurnaceSubSongRef[],
  version: number
): FurnacePattern {
  const magic = reader.readMagic(4);

  const pat: FurnacePattern = {
    subsong: 0,
    channel: 0,
    index: 0,
    name: '',
    rows: [],
  };

  if (magic === 'PATN') {
    // New pattern format
    reader.readUint32(); // Block size
    pat.subsong = reader.readUint8();

    // Channel is always 1 byte (reference: readC() / writeC())
    pat.channel = reader.readUint8();

    pat.index = reader.readUint16();

    if (version >= 51) {
      pat.name = readString(reader);
    }

    // Get pattern length from subsong
    const subsong = subsongs[pat.subsong] || subsongs[0];
    const patLen = subsong?.patLen || 64;
    const effectCols = subsong?.effectColumns[pat.channel] || 1;
    void effectCols; // Effect column count for multi-effect parsing

    // Initialize rows
    for (let i = 0; i < patLen; i++) {
      pat.rows.push({
        note: -1,
        octave: 0,
        instrument: -1,
        volume: -1,
        effects: [],
      });
    }

    // Parse pattern data
    let row = 0;
    while (row < patLen && !reader.isEOF()) {
      const cmd = reader.readUint8();

      if (cmd === 0xff) {
        // End of pattern
        break;
      }

      if (cmd & 0x80) {
        // Skip rows
        const skip = (cmd & 0x7f) + 2;
        row += skip;
        continue;
      }

      if (cmd === 0) {
        // Skip 1 row
        row++;
        continue;
      }

      const cell = pat.rows[row];

      // Determine what's present
      const hasNote = (cmd & 0x01) !== 0;
      const hasIns = (cmd & 0x02) !== 0;
      const hasVol = (cmd & 0x04) !== 0;
      const hasEff0 = (cmd & 0x08) !== 0;
      const hasEffVal0 = (cmd & 0x10) !== 0;
      const hasOtherEffs03 = (cmd & 0x20) !== 0;
      const hasOtherEffs47 = (cmd & 0x40) !== 0;

      let effMask03 = 0;
      let effMask47 = 0;

      if (hasOtherEffs03) {
        effMask03 = reader.readUint8();
      }
      if (hasOtherEffs47) {
        effMask47 = reader.readUint8();
      }

      // Read note
      if (hasNote) {
        const noteVal = reader.readUint8();
        if (noteVal >= 180) {
          // Special notes
          cell.note = noteVal;
          cell.octave = 0;
        } else if (noteVal < 180) {
          cell.note = newFormatNotes[noteVal] || 0;
          cell.octave = newFormatOctaves[noteVal] || 0;
          // Convert signed octave
          if (cell.octave >= 250) {
            cell.octave = cell.octave - 256;
          }
        }
      }

      // Read instrument
      if (hasIns) {
        cell.instrument = reader.readUint8();
      }

      // Read volume
      if (hasVol) {
        cell.volume = reader.readUint8();
      }

      // Read effect 0
      if (hasEff0) {
        const effType = reader.readUint8();
        const effVal = hasEffVal0 ? reader.readUint8() : 0;
        cell.effects.push({ type: effType, value: effVal });
      } else if (hasEffVal0) {
        reader.readUint8(); // Skip orphan value
      }

      // Read effects 1-3 (bits 2-7 of effMask03; bits 0-1 are effect 0, handled above)
      for (let fx = 1; fx <= 3; fx++) {
        const hasEff = (effMask03 & (1 << (fx * 2))) !== 0;
        const hasVal = (effMask03 & (1 << (fx * 2 + 1))) !== 0;

        if (hasEff) {
          const effType = reader.readUint8();
          const effVal = hasVal ? reader.readUint8() : 0;
          cell.effects.push({ type: effType, value: effVal });
        } else if (hasVal) {
          reader.readUint8(); // Skip orphan value
        }
      }

      // Read effects 4-7
      for (let fx = 4; fx <= 7; fx++) {
        const hasEff = (effMask47 & (1 << ((fx - 4) * 2))) !== 0;
        const hasVal = (effMask47 & (1 << ((fx - 4) * 2 + 1))) !== 0;

        if (hasEff) {
          const effType = reader.readUint8();
          const effVal = hasVal ? reader.readUint8() : 0;
          cell.effects.push({ type: effType, value: effVal });
        } else if (hasVal) {
          reader.readUint8(); // Skip orphan value
        }
      }

      row++;
    }
  } else if (magic === 'PATR') {
    // Old pattern format
    reader.readUint32(); // Block size
    pat.channel = reader.readUint16();
    pat.index = reader.readUint16();

    if (version >= 95) {
      pat.subsong = reader.readUint16();
    }
    reader.skip(2); // reserved

    // Get pattern length and effect columns
    const subsong = subsongs[pat.subsong] || subsongs[0];
    const patLen = subsong?.patLen || 64;
    const effectCols = subsong?.effectColumns[pat.channel] || 1;

    // Read pattern data
    for (let row = 0; row < patLen; row++) {
      const cell: FurnacePatternCell = {
        note: reader.readInt16(),
        octave: reader.readInt16(),
        instrument: reader.readInt16(),
        volume: reader.readInt16(),
        effects: [],
      };

      // Note conversion for old format (PATR)
      // According to format.md:
      // - 0: empty/invalid (with octave 0)
      // - 1: C#, 2: D, 3: D#, 4: E, 5: F, 6: F#, 7: G, 8: G#, 9: A, 10: A#, 11: B
      // - 12: C (of next octave) - leftover from .dmf format
      // - 100: note off, 101: note release, 102: macro release
      // - octave is signed char (255 = -1)
      if (cell.note === 0 && cell.octave === 0) {
        // Empty note
        cell.note = -1;
      } else if (cell.note === 100) {
        cell.note = NOTE_OFF;
        cell.octave = 0;
      } else if (cell.note === 101) {
        cell.note = NOTE_RELEASE;
        cell.octave = 0;
      } else if (cell.note === 102) {
        cell.note = MACRO_RELEASE;
        cell.octave = 0;
      } else if (cell.note === 12) {
        // C of next octave (legacy .dmf format)
        cell.note = 12;
        cell.octave++;
      } else if (cell.note >= 1 && cell.note <= 11) {
        // Standard notes: 1=C#, 2=D, etc.
        // Note: cell.note is already correct (1-12 maps to our note system)
        // Just need to handle signed octave
        if (cell.octave >= 128) {
          // Signed char stored as short: 255 = -1, 254 = -2, etc.
          cell.octave = cell.octave - 256;
        }
      }

      // Read effects
      for (let fx = 0; fx < effectCols; fx++) {
        const effType = reader.readInt16();
        const effVal = reader.readInt16();
        if (effType >= 0) {
          cell.effects.push({ type: effType, value: effVal >= 0 ? effVal : 0 });
        }
      }

      pat.rows.push(cell);
    }

    if (version >= 51) {
      pat.name = readString(reader);
    }
  } else {
    throw new Error(`Unknown pattern format: "${magic}"`);
  }

  return pat;
}

/**
 * Convert a FurnacePatternCell's note+octave to a flat note value for native data.
 * Returns: -1=empty, 0-179=notes, 253=off, 254=release, 255=macro-release
 */
export function convertFurnaceNoteValue(cell: FurnacePatternCell): number {
  if (cell.note === 0 && cell.octave === 0) return -1; // Empty
  if (cell.note === 180 || cell.note === 100) return 253; // Note off
  if (cell.note === 181 || cell.note === 101) return 254; // Release
  if (cell.note === 182 || cell.note === 102) return 255; // Macro release
  // Normal note: octave * 12 + (note - 1) for old format, or direct for new format
  if (cell.note >= 1 && cell.note <= 12) {
    // Old format: note 1-12 = C#..C, octave is separate (signed byte: 255=-1, 254=-2)
    const octave = cell.octave > 127 ? cell.octave - 256 : cell.octave;
    const val = octave * 12 + (cell.note - 1);
    return Math.max(0, Math.min(179, val));
  }
  // New format note values (0-179)
  if (cell.note >= 0 && cell.note < 180) {
    return cell.note;
  }
  return -1;
}

/**
 * Convert Furnace pattern cell to XM-compatible format
 * @param cell The Furnace pattern cell
 * @param isChipSynth If true, skip the -24 octave offset (chip synths use native Furnace octaves)
 * @param grooves Optional groove table — used to resolve 0x09 groove-index → speed value
 */
export function convertFurnaceCell(cell: FurnacePatternCell, isChipSynth: boolean = false, grooves?: Array<{ len: number; val: number[] }>): ConvertedPatternCell {
  let note = 0;

  if (cell.note === NOTE_OFF || cell.note === NOTE_RELEASE || cell.note === MACRO_RELEASE) {
    note = 97; // XM note off
  } else if (cell.note >= 1 && cell.note <= 12) {
    // Furnace new format: note 12 = C, 1 = C#, 2 = D, ..., 11 = B
    // XM format: semitone 0 = C, 1 = C#, ..., 11 = B
    // Furnace stores C with octave one less than the actual octave
    const semitone = cell.note === 12 ? 0 : cell.note;
    // Adjust octave for C (note 12) - Furnace stores it one lower
    const adjustedOctave = cell.note === 12 ? cell.octave + 1 : cell.octave;

    // For chip synths (SID, NES, GB, etc.), use native Furnace octave numbering
    // For Amiga/sample-based, apply -24 offset (Furnace C-4 = MOD C-2)
    const octaveOffset = isChipSynth ? 0 : -24;
    note = (adjustedOctave * 12) + semitone + 1 + octaveOffset;

    // Clamp to valid XM range (1-96 playable, 97 = note off)
    // Notes out of range are silenced (0 = empty) rather than transposed
    if (note > 96) note = 96;
    if (note < 1) note = 0;
  }

  // Convert volume
  let volume = 0;
  if (cell.volume >= 0) {
    volume = 0x10 + Math.min(64, Math.round(cell.volume * 64 / 127));
  }

  // Convert up to 8 Furnace effect slots
  const convertedEffects: Array<{ type: number; param: number }> = [];
  for (let i = 0; i < Math.min(8, cell.effects.length); i++) {
    const fx = cell.effects[i];
    let t = mapFurnaceEffect(fx.type);
    if (t < 0) t = fx.type; // Preserve Furnace-native effects for WASM dispatch routing
    let p = fx.value & 0xFF;
    // Groove effect 0x09: param is groove index — preserved as-is for replayer groove activation
    // Split composite XM extended effects (E1x-EFx)
    // mapFurnaceEffect returns e.g. 0xE9 for retrigger; replayer expects
    // effectType=0x0E with sub-command in param high nibble: param = 0x9y
    if (t >= 0xE0 && t <= 0xEF) {
      const subCmd = t & 0x0F;
      t = 0x0E;
      p = (subCmd << 4) | (p & 0x0F);
    }
    convertedEffects.push({ type: t, param: p });
  }

  const e = (i: number) => convertedEffects[i] ?? { type: 0, param: 0 };

  const result: ConvertedPatternCell = {
    note,
    instrument: cell.instrument >= 0 ? cell.instrument + 1 : 0,
    volume,
    effectType:  e(0).type,  effectParam:  e(0).param,
    effectType2: e(1).type,  effectParam2: e(1).param,
  };

  if (convertedEffects.length > 2) { result.effectType3 = e(2).type; result.effectParam3 = e(2).param; }
  if (convertedEffects.length > 3) { result.effectType4 = e(3).type; result.effectParam4 = e(3).param; }
  if (convertedEffects.length > 4) { result.effectType5 = e(4).type; result.effectParam5 = e(4).param; }
  if (convertedEffects.length > 5) { result.effectType6 = e(5).type; result.effectParam6 = e(5).param; }
  if (convertedEffects.length > 6) { result.effectType7 = e(6).type; result.effectParam7 = e(6).param; }
  if (convertedEffects.length > 7) { result.effectType8 = e(7).type; result.effectParam8 = e(7).param; }

  return result;
}

/**
 * Map Furnace effect to XM/IT effect
 * Returns the mapped effect code, or the original if it's a Furnace-specific effect
 * that needs custom handling in the replayer
 */
export function mapFurnaceEffect(furEffect: number): number {
  // Comprehensive Furnace to XM/IT effect mapping
  // Based on Furnace source: src/engine/playback.cpp

  const mapping: Record<number, number> = {
    // === Standard Effects (0x00-0x0F) - mostly 1:1 with XM ===
    0x00: 0x00, // Arpeggio
    0x01: 0x01, // Pitch slide up
    0x02: 0x02, // Pitch slide down
    0x03: 0x03, // Portamento (tone porta)
    0x04: 0x04, // Vibrato
    0x05: 0x06, // Vol slide + vibrato (Furnace swaps 05/06 vs XM)
    0x06: 0x05, // Vol slide + porta
    0x07: 0x07, // Tremolo
    0x08: 0x08, // Panning (4-bit split)
    0x09: 0x09, // Groove/speed — preserve for groove table activation in replayer
    0x0A: 0x0A, // Volume slide
    0x0B: 0x0B, // Position jump
    0x0C: 0xE9, // Retrigger → XM extended retrigger (E9x)
    0x0D: 0x0D, // Pattern break
    0x0F: 0x0F, // Set speed/tempo

    // === Global Effects (0x10-0x1F) ===
    0x10: 0x10, // Set global volume (G in IT)
    0x11: 0x11, // Global volume slide (H in IT)

    // === Panning Effects (0x80-0x8F) ===
    0x80: 0x08, // Panning linear → standard panning
    0x81: 0x08, // Panning left → standard panning
    0x82: 0x08, // Panning right → standard panning
    0x83: 0x19, // Pan slide → IT P command
    0x84: 0x19, // Panbrello → approximate with pan slide
    0x88: 0x08, // Panning rear → standard panning
    0x89: 0x08, // Panning left (8-bit) → standard panning
    0x8A: 0x08, // Panning right (8-bit) → standard panning

    // === Sample Position Effects (0x90-0x9F) ===
    0x90: 0x09, // Set sample position → sample offset
    0x91: 0x09,
    0x92: 0x09,
    0x93: 0x09,
    0x94: 0x09,
    0x95: 0x09,
    0x96: 0x09,
    0x97: 0x09,
    0x98: 0x09,
    0x99: 0x09,
    0x9A: 0x09,
    0x9B: 0x09,
    0x9C: 0x09,
    0x9D: 0x09,
    0x9E: 0x09,
    0x9F: 0x09,

    // === Frequency Effects (0xC0-0xC3) ===
    // These set Hz directly - map to speed/tempo as approximation
    0xC0: 0x0F,
    0xC1: 0x0F,
    0xC2: 0x0F,
    0xC3: 0x0F,

    // === Volume Effects (0xD0-0xDF) ===
    0xD3: 0x0A, // Volume portamento → volume slide
    0xD4: 0x0A, // Volume portamento fast → volume slide
    0xDC: 0xEC, // Delayed mute → note cut

    // === Extended Effects (0xE0-0xEF) ===
    0xE0: -1,   // Arp speed → no XM equivalent (param is speed, not note offsets)
    0xE1: 0xE1, // Fine porta up → XM fine porta up
    0xE2: 0xE2, // Fine porta down → XM fine porta down
    0xE3: 0xE4, // Vibrato shape → XM vibrato waveform
    0xE4: 0x04, // Vibrato fine → standard vibrato
    0xE5: -1,   // Set pitch → no XM equivalent (would misfire as arpeggio)
    0xE6: 0x03, // Delayed legato → portamento
    0xE7: -1,   // Delayed macro release → no XM equivalent
    0xE8: 0x03, // Delayed legato up → portamento
    0xE9: 0x03, // Delayed legato down → portamento
    0xEA: -1,   // Legato mode → no XM equivalent
    0xEB: -1,   // Sample bank → no XM equivalent
    0xEC: 0xEC, // Note cut → XM note cut
    0xED: 0xED, // Note delay → XM note delay
    0xEE: -1,   // External command → no XM equivalent

    // === Fine Control Effects (0xF0-0xFF) ===
    0xF0: 0x0F, // Set Hz by tempo → speed
    0xF1: 0xE1, // Single pitch up → fine porta up
    0xF2: 0xE2, // Single pitch down → fine porta down
    0xF3: 0xEA, // Fine vol up → XM fine vol up
    0xF4: 0xEB, // Fine vol down → XM fine vol down
    0xF5: -1,   // Disable macro → no XM equivalent
    0xF6: -1,   // Enable macro → no XM equivalent
    0xF7: -1,   // Restart macro → no XM equivalent
    0xF8: 0xEA, // Single vol up → fine vol up
    0xF9: 0xEB, // Single vol down → fine vol down
    0xFA: 0x0A, // Fast vol slide → vol slide
    0xFC: 0xEC, // Note release → note cut
    0xFD: 0x0F, // Virtual tempo num → speed
    0xFE: 0x0F, // Virtual tempo den → speed
    0xFF: -1,   // Stop song → no XM equivalent (drop; param is always 0 anyway)
  };

  return mapping[furEffect] ?? furEffect; // Pass through unmapped effects
}
