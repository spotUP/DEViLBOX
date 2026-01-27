/**
 * Amiga and XM Period Tables
 *
 * Provides utilities for converting between notes, periods, and frequencies.
 * Supports standard Amiga periods (logarithmic frequency) and XM linear periods.
 */

// ProTracker note range limits
export const PT_MIN_PERIOD = 54;   // Amiga C-5 (approx)
export const PT_MAX_PERIOD = 32000; // Very low note

// Notes per octave
export const NOTES_PER_OCTAVE = 12;

/**
 * ProTracker vibrato sine table (32 values, 0-255 range)
 */
export const VIBRATO_TABLE: readonly number[] = [
  0x00, 0x18, 0x31, 0x4A, 0x61, 0x78, 0x8D, 0xA1,
  0xB4, 0xC5, 0xD4, 0xE0, 0xEB, 0xF4, 0xFA, 0xFD,
  0xFF, 0xFD, 0xFA, 0xF4, 0xEB, 0xE0, 0xD4, 0xC5,
  0xB4, 0xA1, 0x8D, 0x78, 0x61, 0x4A, 0x31, 0x18
];

/**
 * Full ProTracker period table with 16 finetune values.
 * Note indices (0-35) correspond to Amiga octaves 1-3.
 */
export const PERIOD_TABLE: readonly (readonly number[])[] = [
  // Finetune 0 (no finetuning)
  [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
   428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
   214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113],
  // +1
  [850, 802, 757, 715, 674, 637, 601, 567, 535, 505, 477, 450,
   425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 239, 225,
   213, 201, 189, 179, 169, 159, 150, 142, 134, 126, 119, 113],
  // +2
  [844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474, 447,
   422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237, 224,
   211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118, 112],
  // +3
  [838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470, 444,
   419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235, 222,
   209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118, 111],
  // +4
  [832, 785, 741, 699, 660, 623, 588, 555, 524, 495, 467, 441,
   416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233, 220,
   208, 196, 185, 175, 165, 156, 147, 139, 131, 124, 117, 110],
  // +5
  [826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463, 437,
   413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232, 219,
   206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116, 109],
  // +6
  [820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460, 434,
   410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230, 217,
   205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115, 109],
  // +7
  [814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457, 431,
   407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228, 216,
   204, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114, 108],
  // -8
  [907, 856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480,
   453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240,
   226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120],
  // -7
  [900, 850, 802, 757, 715, 675, 636, 601, 567, 535, 505, 477,
   450, 425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 238,
   225, 212, 200, 189, 179, 169, 159, 150, 142, 134, 126, 119],
  // -6
  [894, 844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474,
   447, 422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237,
   223, 211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118],
  // -5
  [887, 838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470,
   444, 419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235,
   222, 209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118],
  // -4
  [881, 832, 785, 741, 699, 660, 623, 588, 555, 524, 494, 467,
   441, 416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233,
   220, 208, 196, 185, 175, 165, 156, 147, 139, 131, 123, 117],
  // -3
  [875, 826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463,
   437, 413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232,
   219, 206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116],
  // -2
  [868, 820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460,
   434, 410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230,
   217, 205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115],
  // -1
  [862, 814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457,
   431, 407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228,
   216, 203, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114],
];

/**
 * Note name lookup
 */
export const NOTE_NAMES: readonly string[] = [
  'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
];

/**
 * Convert finetune value to table index (-8 to +7 -> 0 to 15)
 */
export function finetuneToIndex(finetune: number): number {
  const ft = Math.max(-8, Math.min(7, Math.round(finetune)));
  return ft < 0 ? ft + 16 : ft;
}

/**
 * Unified internal note system: Note 48 = Middle C (Period 428).
 * PERIOD_TABLE[0][0] (856) maps to internal Note 36.
 */

export function getPeriodExtended(noteIndex: number, finetune: number = 0): number {
  // Amiga PERIOD_TABLE range: index 36..71 (3 octaves)
  if (noteIndex >= 36 && noteIndex < 72 && Math.abs(finetune) <= 8) {
    const ftIndex = finetuneToIndex(finetune);
    return PERIOD_TABLE[ftIndex][noteIndex - 36];
  }

  // Linear extrapolation for other ranges
  // Base: Note 48 (Middle C / Amiga C-2) = period 428.
  const semitones = noteIndex - 48 + (finetune / 128);
  return Math.round(428 / Math.pow(2, semitones / 12));
}

export function periodToNoteIndex(period: number, _finetune: number = 0): number {
  if (period <= 0) return -1;
  const halfClock = 3546895;
  const frequency = halfClock / period;
  // freq = 8287.13 * 2^((note - 48)/12)
  const note = 48 + 12 * Math.log2(frequency / 8287.13);
  return Math.round(note);
}

export function getPeriod(noteIndex: number, finetune: number = 0): number {
  // ProTracker noteIndex 0 is C-1. In our system, Note 36 is Amiga C-1.
  return getPeriodExtended(noteIndex + 36, finetune);
}

export function noteStringToPeriod(note: string, finetune: number = 0, format?: string): number {
  if (!note || note === '...' || note === '---') return 0;
  if (note === '===' || note === '^^^') return -1;

  const match = note.match(/^([A-G][#-]?)[-]?(\d)$/i);
  if (!match) return 0;

  const noteName = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const semitone = NOTE_NAMES.findIndex(n => n === noteName || n.replace('-', '') === noteName.replace('#', '#'));
  if (semitone === -1) return 0;

  // Format-specific base octaves.
  // These map display octave numbers to internal note indices:
  // - internalIndex = (displayOctave - baseOctave) * 12 + semitone + 48
  // - Table covers indices 36-71 (periods 856-113)
  let baseOctave = 4; // XM: C-5 = index 48 (middle C at period 428)
  if (format === 'MOD') baseOctave = 1; // MOD: C-1 = index 48 (period 428), B-3 = index 83 (extrapolated)
  if (format === 'IT' || format === 'S3M') baseOctave = 2; // IT/S3M: C-3 = index 60 (period 214)

  const internalIndex = (octave - baseOctave) * 12 + semitone + 48;
  return getPeriodExtended(internalIndex, finetune);
}

export function periodToNoteString(period: number, finetune: number = 0, format?: string): string {
  if (period <= 0) return '---';
  if (period === -1) return '===';

  const internalIndex = periodToNoteIndex(period, finetune);
  const noteName = NOTE_NAMES[((internalIndex % 12) + 12) % 12];
  
  let baseOctave = 4;
  if (format === 'MOD') baseOctave = 1;
  if (format === 'IT' || format === 'S3M') baseOctave = 2;
  
  const octave = Math.floor((internalIndex - 48) / 12) + baseOctave;
  return `${noteName}${octave}`;
}

export function noteStringToXMLinearPeriod(note: string, finetune: number = 0): number {
  if (!note || note === '...' || note === '---') return 0;
  if (note === '===' || note === '^^^') return -1;

  const match = note.match(/^([A-G][#-]?)[-]?(\d)$/i);
  if (!match) return 0;

  const noteName = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const semitoneIndex = NOTE_NAMES.findIndex(n => n === noteName || n.replace('-', '') === noteName.replace('#', '#'));
  if (semitoneIndex === -1) return 0;

  // XM note index where Middle C (C-4) is internal note 49 in replayer formula.
  const internalIndex = (octave - 4) * 12 + semitoneIndex + 49;
  
  return 7680 - (internalIndex * 64) - Math.floor(finetune / 2);
}

export function xmLinearPeriodToFrequency(linearPeriod: number): number {
  if (linearPeriod <= 0) return 0;
  return 8363 * Math.pow(2, (4608 - linearPeriod) / 768);
}

export function periodToFrequency(period: number, ntsc: boolean = false): number {
  if (period <= 0) return 0;
  return (ntsc ? 3579545 : 3546895) / period;
}

export function getArpeggioPeriod(period: number, offset: number, finetune: number = 0, emulateBugs: boolean = false): number {
  if (period <= 0) return 0;
  const noteIndex = periodToNoteIndex(period, finetune);
  if (noteIndex === -1) return period;
  let targetIndex = noteIndex + offset;
  if (emulateBugs) {
    // ProTracker boundary check: Note 72 (C-4) returns 0.
    // Note 73 wraps around to index 36 (C-1).
    if (targetIndex === 72) return 0;
    if (targetIndex > 72) targetIndex -= 37;
  }
  return getPeriodExtended(targetIndex, finetune);
}

export function snapPeriodToSemitone(period: number, finetune: number = 0): number {
  if (period <= 0) return 0;
  const noteIndex = periodToNoteIndex(period, finetune);
  return getPeriodExtended(noteIndex, finetune);
}
