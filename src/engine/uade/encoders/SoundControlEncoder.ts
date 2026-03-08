/**
 * SoundControlEncoder — Encodes TrackerCell back to Sound Control native format.
 *
 * Sound Control tracks use variable-length events:
 *   Note event:  4 bytes { noteByte, sampleOrInstr, unused(0), volume }
 *   Wait event:  2 bytes { 0x00, numTicks }
 *   End marker:  2 bytes { 0xFF, 0xFF }
 *
 * Only note cells (4 bytes) can be edited in-place without changing track length.
 * Wait/empty cells cannot be converted to notes (would change byte count).
 *
 * Note encoding:
 *   SC 3.x: hi-nibble = octave (1-8), lo-nibble = note (0-9)
 *   SC 4.0+: 1-based index into period table
 *
 * The parser records each note event's file offset during parsing, enabling
 * getCellFileOffset to return the correct address for chip RAM patching.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/**
 * Reverse of sc40NoteToXm: XM note → SC 4.0+ period table index (1-based).
 * sc40NoteToXm does: idx + 13 → xmNote, so reverse: xmNote - 13 + 1 = xmNote - 12
 */
function xmToSc40Note(xmNote: number): number {
  if (xmNote === 0) return 0;
  const idx = xmNote - 13;
  if (idx < 0 || idx >= 36) return 0;
  return idx + 1; // 1-based index
}

/**
 * Reverse of sc3xNoteToXm: XM note → SC 3.x note byte (octave<<4 | noteInOct).
 * sc3xNoteToXm does: (octave-1)*12 + round(noteInOct/10*12) + 13
 * Reverse: subtract 13, divide by 12 to get octave, find closest noteInOct
 */
function xmToSc3xNote(xmNote: number): number {
  if (xmNote === 0) return 0;
  const raw = xmNote - 13;
  if (raw < 0) return 0;
  const octave = Math.floor(raw / 12) + 1;
  const semitone = raw % 12;
  // Reverse: noteInOct = round(semitone * 10 / 12)
  const noteInOct = Math.round((semitone * 10) / 12);
  if (octave < 1 || octave > 8 || noteInOct > 9) return 0;
  return (octave << 4) | noteInOct;
}

/**
 * Encode a TrackerCell to SC 4.0+ format (4 bytes).
 */
function encodeSoundControl40Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = xmToSc40Note(cell.note ?? 0);
  out[1] = (cell.instrument ?? 0) & 0xFF;
  out[2] = 0; // unused byte (yy)
  out[3] = (cell.volume ?? 0) & 0x7F;
  return out;
}

/**
 * Encode a TrackerCell to SC 3.x format (4 bytes).
 */
function encodeSoundControl3xCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = xmToSc3xNote(cell.note ?? 0);
  out[1] = (cell.instrument ?? 0) & 0xFF;
  out[2] = 0; // unused byte (yy)
  out[3] = (cell.volume ?? 0) & 0x7F;
  return out;
}

// Register the 4.0+ encoder as default (most common)
registerPatternEncoder('soundControl', () => encodeSoundControl40Cell);

export { encodeSoundControl40Cell, encodeSoundControl3xCell, xmToSc40Note, xmToSc3xNote };
