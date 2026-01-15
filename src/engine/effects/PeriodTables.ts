/**
 * Amiga Period Tables
 *
 * Authentic ProTracker period tables with all 16 finetune values.
 * These are the exact values from the original PT2.3D source code.
 *
 * Period = CPU clock / (2 * frequency * 124)
 * For PAL: clock = 3546895 Hz
 * For NTSC: clock = 3579545 Hz
 *
 * Lower period = higher frequency
 * C-1 (period 856) to B-3 (period 113) = 3 octaves
 */

// ProTracker note range limits
export const PT_MIN_PERIOD = 113;  // B-3 (highest note)
export const PT_MAX_PERIOD = 856;  // C-1 (lowest note)

// Extended period limits (for portamento)
export const PT_PORTA_MIN_PERIOD = 113;
export const PT_PORTA_MAX_PERIOD = 856;

// Notes per octave
export const NOTES_PER_OCTAVE = 12;

// Periods per finetune table
export const PERIODS_PER_FINETUNE = 36; // 3 octaves * 12 notes

/**
 * Full ProTracker period table with 16 finetune values.
 * Index order: [finetune][note]
 *
 * Finetune values:
 *   0-7:  +0 to +7 (sharper)
 *   8-15: -8 to -1 (flatter)
 *
 * Note indices (0-35):
 *   0-11:  C-1 to B-1
 *   12-23: C-2 to B-2
 *   24-35: C-3 to B-3
 */
export const PERIOD_TABLE: readonly (readonly number[])[] = [
  // Finetune 0 (no finetuning)
  [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
   428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
   214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113],

  // Finetune +1
  [850, 802, 757, 715, 674, 637, 601, 567, 535, 505, 477, 450,
   425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 239, 225,
   213, 201, 189, 179, 169, 159, 150, 142, 134, 126, 119, 113],

  // Finetune +2
  [844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474, 447,
   422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237, 224,
   211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118, 112],

  // Finetune +3
  [838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470, 444,
   419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235, 222,
   209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118, 111],

  // Finetune +4
  [832, 785, 741, 699, 660, 623, 588, 555, 524, 495, 467, 441,
   416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233, 220,
   208, 196, 185, 175, 165, 156, 147, 139, 131, 124, 117, 110],

  // Finetune +5
  [826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463, 437,
   413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232, 219,
   206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116, 109],

  // Finetune +6
  [820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460, 434,
   410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230, 217,
   205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115, 109],

  // Finetune +7
  [814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457, 431,
   407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228, 216,
   204, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114, 108],

  // Finetune -8
  [907, 856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480,
   453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240,
   226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120],

  // Finetune -7
  [900, 850, 802, 757, 715, 675, 636, 601, 567, 535, 505, 477,
   450, 425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 238,
   225, 212, 200, 189, 179, 169, 159, 150, 142, 134, 126, 119],

  // Finetune -6
  [894, 844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474,
   447, 422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237,
   223, 211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118],

  // Finetune -5
  [887, 838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470,
   444, 419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235,
   222, 209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118],

  // Finetune -4
  [881, 832, 785, 741, 699, 660, 623, 588, 555, 524, 494, 467,
   441, 416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233,
   220, 208, 196, 185, 175, 165, 156, 147, 139, 131, 123, 117],

  // Finetune -3
  [875, 826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463,
   437, 413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232,
   219, 206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116],

  // Finetune -2
  [868, 820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460,
   434, 410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230,
   217, 205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115],

  // Finetune -1
  [862, 814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457,
   431, 407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228,
   216, 203, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114],
];

/**
 * Arpeggio overflow values for finetune -1 (bug emulation)
 *
 * In ProTracker, arpeggio on finetune -1 samples can read past
 * the period table into the following data. These are the authentic
 * overflow values from PT2.3D source (CursorPosTable + UnshiftedKeymap).
 */
export const ARPEGGIO_OVERFLOW: readonly number[] = [
  774, 1800, 2314, 3087, 4113, 4627, 5400, 6426, 6940, 7713,
  8739, 9253, 24625, 12851, 13365
];

/**
 * ProTracker vibrato sine table (32 values, 0-255 range)
 * Used for vibrato/tremolo waveform 0 (sine)
 */
export const VIBRATO_TABLE: readonly number[] = [
  0x00, 0x18, 0x31, 0x4A, 0x61, 0x78, 0x8D, 0xA1,
  0xB4, 0xC5, 0xD4, 0xE0, 0xEB, 0xF4, 0xFA, 0xFD,
  0xFF, 0xFD, 0xFA, 0xF4, 0xEB, 0xE0, 0xD4, 0xC5,
  0xB4, 0xA1, 0x8D, 0x78, 0x61, 0x4A, 0x31, 0x18
];

/**
 * Note name lookup (for display and debugging)
 */
export const NOTE_NAMES: readonly string[] = [
  'C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'
];

/**
 * Convert finetune value to table index
 * ProTracker finetune: -8 to +7 (signed 4-bit)
 * Table index: 0-15 (0-7 = +0 to +7, 8-15 = -8 to -1)
 */
export function finetuneToIndex(finetune: number): number {
  // Ensure finetune is in range -8 to +7
  const ft = Math.max(-8, Math.min(7, finetune));
  // Convert: 0-7 stay as-is, -8 to -1 become 8-15
  return ft < 0 ? ft + 16 : ft;
}

/**
 * Convert table index to finetune value
 */
export function indexToFinetune(index: number): number {
  // Ensure index is in range 0-15
  const idx = index & 0x0F;
  // Convert: 0-7 stay as-is, 8-15 become -8 to -1
  return idx > 7 ? idx - 16 : idx;
}

/**
 * Get period for a note with finetune
 * @param noteIndex - Note index 0-35 (C-1 to B-3)
 * @param finetune - Finetune value -8 to +7
 */
export function getPeriod(noteIndex: number, finetune: number = 0): number {
  if (noteIndex < 0 || noteIndex >= 36) return 0;
  const ftIndex = finetuneToIndex(finetune);
  return PERIOD_TABLE[ftIndex][noteIndex];
}

/**
 * Find the note index for a given period
 * Returns the closest match in the period table
 * @param period - Amiga period value
 * @param finetune - Finetune value for lookup table
 */
export function periodToNoteIndex(period: number, finetune: number = 0): number {
  if (period <= 0) return -1;

  const ftIndex = finetuneToIndex(finetune);
  const table = PERIOD_TABLE[ftIndex];

  // Find closest period (table is sorted descending)
  let bestIndex = 0;
  let bestDiff = Math.abs(period - table[0]);

  for (let i = 1; i < table.length; i++) {
    const diff = Math.abs(period - table[i]);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Convert period to frequency (Hz)
 * PAL Amiga: freq = 3546895 / (period * 2)
 * NTSC Amiga: freq = 3579545 / (period * 2)
 */
export function periodToFrequency(period: number, ntsc: boolean = false): number {
  if (period <= 0) return 0;
  const clock = ntsc ? 3579545 : 3546895;
  return clock / (period * 2);
}

/**
 * Convert frequency to period
 */
export function frequencyToPeriod(frequency: number, ntsc: boolean = false): number {
  if (frequency <= 0) return 0;
  const clock = ntsc ? 3579545 : 3546895;
  return Math.round(clock / (frequency * 2));
}

/**
 * Convert note string (e.g., "C-4") to period
 * ProTracker notes are C-1 to B-3 (3 octaves)
 */
export function noteStringToPeriod(note: string, finetune: number = 0): number {
  if (!note || note === '...' || note === '---') return 0;
  if (note === '===' || note === '^^^') return -1; // Note off

  // Parse note name and octave
  const match = note.match(/^([A-G][#-]?)[-]?(\d)$/i);
  if (!match) return 0;

  const noteName = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);

  // Find note index
  const noteIndex = NOTE_NAMES.findIndex(n =>
    n === noteName || n.replace('-', '') === noteName.replace('#', '#')
  );
  if (noteIndex === -1) return 0;

  // ProTracker uses octaves 1-3
  // Convert to table index: C-1 = 0, C-2 = 12, C-3 = 24
  const ptOctave = octave - 1; // Convert to 0-based
  if (ptOctave < 0 || ptOctave > 2) return 0;

  const tableIndex = ptOctave * 12 + noteIndex;
  return getPeriod(tableIndex, finetune);
}

/**
 * Convert period to note string
 */
export function periodToNoteString(period: number, finetune: number = 0): string {
  if (period <= 0) return '---';
  if (period === -1) return '===';

  const noteIndex = periodToNoteIndex(period, finetune);
  if (noteIndex < 0 || noteIndex >= 36) return '???';

  const noteName = NOTE_NAMES[noteIndex % 12];
  const octave = Math.floor(noteIndex / 12) + 1; // PT octaves are 1-3

  return `${noteName}${octave}`;
}

/**
 * Get period for arpeggio with potential overflow (PT bug emulation)
 * @param basePeriod - Base note period
 * @param semitoneOffset - Semitones to add (0, x, or y from 0xy effect)
 * @param finetune - Finetune value
 * @param emulateBug - Whether to emulate the PT arpeggio overflow bug
 */
export function getArpeggioPeriod(
  basePeriod: number,
  semitoneOffset: number,
  finetune: number = 0,
  emulateBug: boolean = true
): number {
  if (basePeriod <= 0 || semitoneOffset === 0) return basePeriod;

  const ftIndex = finetuneToIndex(finetune);
  const baseIndex = periodToNoteIndex(basePeriod, finetune);
  const targetIndex = baseIndex + semitoneOffset;

  // Normal case: within table bounds
  if (targetIndex >= 0 && targetIndex < 36) {
    return PERIOD_TABLE[ftIndex][targetIndex];
  }

  // Overflow case (PT bug): finetune -1 can overflow into garbage data
  if (emulateBug && ftIndex === 15 && targetIndex >= 36 && targetIndex < 51) {
    return ARPEGGIO_OVERFLOW[targetIndex - 36];
  }

  // Out of range: clamp to table bounds
  if (targetIndex < 0) return PERIOD_TABLE[ftIndex][0];
  return PERIOD_TABLE[ftIndex][35];
}

/**
 * Linear frequency slide (XM style)
 * Unlike Amiga period slides, these are logarithmic (constant pitch change)
 *
 * XM uses linear periods: LinearPeriod = 10*12*16*4 - Note*16*4 - FineTune/2
 * Then frequency = 8363*2^((6*12*16*4 - LinearPeriod) / (12*16*4))
 */
export const XM_LINEAR_PERIOD_BASE = 10 * 12 * 16 * 4; // 7680

/**
 * Convert XM linear period to frequency
 */
export function xmLinearPeriodToFrequency(linearPeriod: number): number {
  if (linearPeriod <= 0) return 0;
  return 8363 * Math.pow(2, (6 * 12 * 16 * 4 - linearPeriod) / (12 * 16 * 4));
}

/**
 * Convert frequency to XM linear period
 */
export function frequencyToXMLinearPeriod(frequency: number): number {
  if (frequency <= 0) return 0;
  return 6 * 12 * 16 * 4 - Math.round(12 * 16 * 4 * Math.log2(frequency / 8363));
}

/**
 * S3M period calculation
 * S3M uses different period values than ProTracker
 * Period = 8363 * 16 * (PeriodTable[note] / frequency)
 */
export function s3mNoteToPeriod(note: number, c4Speed: number = 8363): number {
  // S3M note: upper 4 bits = octave, lower 4 bits = note
  const octave = (note >> 4) & 0x0F;
  const semitone = note & 0x0F;

  if (semitone >= 12) return 0;

  // Base period for C-4 = 428 (like Amiga)
  const basePeriod = PERIOD_TABLE[0][semitone];
  // Adjust for octave (S3M uses octave 4 as base)
  const octaveShift = 4 - octave;

  if (octaveShift >= 0) {
    return (basePeriod << octaveShift) * (8363 / c4Speed);
  } else {
    return (basePeriod >> -octaveShift) * (8363 / c4Speed);
  }
}
