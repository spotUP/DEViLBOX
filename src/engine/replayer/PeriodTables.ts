/**
 * Period tables, finetune multipliers, semitone ratios, note conversion tables,
 * FT2 auto-vibrato sine table, vibrato/tremolo table, and groove map.
 *
 * All exports are pure data — no side effects, no class dependencies.
 */

import { getGrooveOffset, getGrooveVelocity, GROOVE_TEMPLATES } from '@/types/audio';
import type { GrooveTemplate } from '@/types/audio';

// Re-export groove helpers used by TrackerReplayer
export { getGrooveOffset, getGrooveVelocity };
export type { GrooveTemplate };

export const AMIGA_PAL_FREQUENCY = 3546895;

// PERF: Pre-computed finetune multipliers (finetune -8..+7 = 16 values)
// Avoids Math.pow() per note trigger. finetune in 1/8 semitone units.
export const FINETUNE_MULTIPLIERS: number[] = new Array(16);
for (let ft = -8; ft <= 7; ft++) {
  FINETUNE_MULTIPLIERS[ft + 8] = Math.pow(2, ft / (8 * 12));
}

// PERF: Pre-computed semitone ratios for arpeggio macro and pitch slide
// Covers -128..+127 semitones (full signed byte range). Index = semitones + 128.
export const SEMITONE_RATIOS: number[] = new Array(256);
for (let s = -128; s <= 127; s++) {
  SEMITONE_RATIOS[s + 128] = Math.pow(2, s / 12);
}

// PERF: Pre-computed octave multipliers for period conversion
// Covers octave shifts 0..10 (more than enough for any tracker format)
export const OCTAVE_UP: number[] = new Array(11);
export const OCTAVE_DOWN: number[] = new Array(11);
for (let o = 0; o <= 10; o++) {
  OCTAVE_UP[o] = Math.pow(2, o);
  OCTAVE_DOWN[o] = Math.pow(2, -o);
}

// FT2 auto-vibrato sine table (256 entries, -64..+64)
// From ft2_replayer.c: autoVibSineTab[256]
export const AUTO_VIB_SINE_TAB: Int8Array = new Int8Array(256);
for (let i = 0; i < 256; i++) {
  AUTO_VIB_SINE_TAB[i] = Math.round(Math.sin((i * 2 * Math.PI) / 256) * 64);
}

// PERF: Module-level constants to avoid per-call allocation
export const DEBUG_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_STRING_MAP: { [key: string]: number } = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
};

// Complete period table with all 16 finetune variations
export const PERIOD_TABLE = [
  // Finetune 0
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  // Finetune 1
  850, 802, 757, 715, 674, 637, 601, 567, 535, 505, 477, 450,
  425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 239, 225,
  213, 201, 189, 179, 169, 159, 150, 142, 134, 126, 119, 113,
  // Finetune 2
  844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474, 447,
  422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237, 224,
  211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118, 112,
  // Finetune 3
  838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470, 444,
  419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235, 222,
  209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118, 111,
  // Finetune 4
  832, 785, 741, 699, 660, 623, 588, 555, 524, 495, 467, 441,
  416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233, 220,
  208, 196, 185, 175, 165, 156, 147, 139, 131, 124, 117, 110,
  // Finetune 5
  826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463, 437,
  413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232, 219,
  206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116, 109,
  // Finetune 6
  820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460, 434,
  410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230, 217,
  205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115, 109,
  // Finetune 7
  814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457, 431,
  407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228, 216,
  204, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114, 108,
  // Finetune -8
  907, 856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480,
  453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240,
  226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120,
  // Finetune -7
  900, 850, 802, 757, 715, 675, 636, 601, 567, 535, 505, 477,
  450, 425, 401, 379, 357, 337, 318, 300, 284, 268, 253, 238,
  225, 212, 200, 189, 179, 169, 159, 150, 142, 134, 126, 119,
  // Finetune -6
  894, 844, 796, 752, 709, 670, 632, 597, 563, 532, 502, 474,
  447, 422, 398, 376, 355, 335, 316, 298, 282, 266, 251, 237,
  223, 211, 199, 188, 177, 167, 158, 149, 141, 133, 125, 118,
  // Finetune -5
  887, 838, 791, 746, 704, 665, 628, 592, 559, 528, 498, 470,
  444, 419, 395, 373, 352, 332, 314, 296, 280, 264, 249, 235,
  222, 209, 198, 187, 176, 166, 157, 148, 140, 132, 125, 118,
  // Finetune -4
  881, 832, 785, 741, 699, 660, 623, 588, 555, 524, 494, 467,
  441, 416, 392, 370, 350, 330, 312, 294, 278, 262, 247, 233,
  220, 208, 196, 185, 175, 165, 156, 147, 139, 131, 123, 117,
  // Finetune -3
  875, 826, 779, 736, 694, 655, 619, 584, 551, 520, 491, 463,
  437, 413, 390, 368, 347, 328, 309, 292, 276, 260, 245, 232,
  219, 206, 195, 184, 174, 164, 155, 146, 138, 130, 123, 116,
  // Finetune -2
  868, 820, 774, 730, 689, 651, 614, 580, 547, 516, 487, 460,
  434, 410, 387, 365, 345, 325, 307, 290, 274, 258, 244, 230,
  217, 205, 193, 183, 172, 163, 154, 145, 137, 129, 122, 115,
  // Finetune -1
  862, 814, 768, 725, 684, 646, 610, 575, 543, 513, 484, 457,
  431, 407, 384, 363, 342, 323, 305, 288, 272, 256, 242, 228,
  216, 203, 192, 181, 171, 161, 152, 144, 136, 128, 121, 114,
];

// Note names for period-to-note conversion
export const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
export const NOTE_NAMES_CLEAN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Pre-computed XM note → note name lookup (avoids string allocation per call)
// Index 0 = invalid/unused, indices 1-96 = valid note names
export const XM_NOTE_NAMES: string[] = new Array(97);
XM_NOTE_NAMES[0] = 'C4'; // Default for invalid note
for (let i = 1; i <= 96; i++) {
  const midi = i + 11;
  const octave = Math.floor(midi / 12) - 1;
  const semitone = midi % 12;
  XM_NOTE_NAMES[i] = `${NOTE_NAMES_CLEAN[semitone]}${octave}`;
}

// FurnaceChipEngine synthTypes — these use the register-write path and need TS-side macros.
// All other Furnace* synthTypes use FurnaceDispatchEngine (WASM processes macros internally).
export const FURNACE_CHIP_ENGINE_TYPES = new Set([
  'Furnace', 'FurnaceOPN', 'FurnaceOPM', 'FurnaceOPL', 'FurnaceOPLL', 'FurnaceOPZ',
  'FurnaceOPNA', 'FurnaceOPNB', 'FurnaceOPL4', 'FurnaceY8950', 'FurnaceESFM',
  'FurnaceVRC7', 'FurnaceOPN2203', 'FurnaceOPNBB',
]);

// Pre-computed Amiga period → note name lookup (avoids iteration + string alloc per call)
export const PERIOD_NOTE_MAP = new Map<number, string>();
for (let oct = 0; oct < 3; oct++) {
  for (let note = 0; note < 12; note++) {
    const idx = oct * 12 + note;
    if (idx < 36) {
      const period = PERIOD_TABLE[idx];
      if (!PERIOD_NOTE_MAP.has(period)) {
        PERIOD_NOTE_MAP.set(period, `${NOTE_NAMES[note].replace('-', '')}${oct + 3}`);
      }
    }
  }
}

/** Convert XM note number to note name (e.g. "C2")
 * XM note format: 1 = C-0, 13 = C-1, 25 = C-2, etc.
 * Maps to MIDI: XM + 11 = MIDI (so XM 25 = MIDI 36 = C2)
 */
export function xmNoteToNoteName(xmNote: number): string {
  return XM_NOTE_NAMES[xmNote] || 'C4';
}

/** Convert Amiga period to note name (e.g. "C4") */
export function periodToNoteName(period: number): string {
  // Fast path: exact match in pre-computed map
  const cached = PERIOD_NOTE_MAP.get(period);
  if (cached) return cached;
  // Slow path: find closest period (rarely hit — only for non-standard periods)
  for (let oct = 0; oct < 8; oct++) {
    for (let note = 0; note < 12; note++) {
      const idx = oct * 12 + note;
      if (idx < 36 && PERIOD_TABLE[idx] <= period) {
        const name = `${NOTE_NAMES[note].replace('-', '')}${oct + 3}`;
        // Cache for next hit
        PERIOD_NOTE_MAP.set(period, name);
        return name;
      }
    }
  }
  return 'C4';
}

// Vibrato/Tremolo sine table
export const VIBRATO_TABLE = [
  0, 24, 49, 74, 97, 120, 141, 161, 180, 197, 212, 224, 235, 244, 250, 253,
  255, 253, 250, 244, 235, 224, 212, 197, 180, 161, 141, 120, 97, 74, 49, 24
];

// Pre-computed groove template lookup (avoids linear scan per call)
export const GROOVE_MAP = new Map<string, GrooveTemplate>(GROOVE_TEMPLATES.map(t => [t.id, t]));
