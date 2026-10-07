/**
 * noteValue.ts - what a cell's `note` number means, in one place.
 *
 * Stored values (TrackerCell.note):
 *   0           empty
 *   1 .. 96     C-0 .. B-7 (1 = C-0; Amiga periods in ProTracker naming, 428 = 25 = C-2)
 *   97          note-off (98 fade, 254 cut, 255 fade in the formats that have them)
 *   -12 .. -1   the octave below C-0: c_1 .. b_1 (owner decision 2026-10-07, G15)
 *
 * The octave below C-0 is stored below zero so that every value a song saved
 * before it existed keeps its meaning. Pitch is linear (1 = C-0, 0 = B below
 * C-0, -11 = C an octave below C-0) and the stored value is the pitch, minus
 * one under C-0, because 0 is "empty". A reader that only knows `note > 0`
 * reads a low note as no note - it drops it, it never plays it in the wrong
 * octave; the exporters that cannot hold the octave refuse the song
 * (lowOctaveExportRefusal), the ones that can convert through this module.
 *
 * Names: the octave below C-0 uses Furnace's spelling for negative octaves
 * (third-party/furnace-master/src/gui/guiConst.cpp): lower-case letter, `_`
 * for a natural and `+` for a sharp, then the octave's magnitude - c_1 c+1 d_1
 * ... b_1 - three glyphs like every other note.
 *
 * Dependency-free on purpose: the render worker imports it.
 */

/** Stored value of the lowest note, c_1 (pitch -11). */
export const NOTE_LOWEST = -12;
/** Stored value of the highest note, B-7. */
export const NOTE_HIGHEST = 96;
export const NOTE_OFF_VALUE = 97;
/** Pitch of the lowest note (1 = C-0). */
export const PITCH_LOWEST = -11;
export const PITCH_HIGHEST = 96;

/** A value of the octave below C-0 (c_1 .. b_1). */
export function isLowOctaveNote(v: number): boolean {
  return v >= NOTE_LOWEST && v <= -1;
}

/** A value that plays a pitch: 1..96 or the octave below C-0. */
export function isPitchedNote(v: number | undefined | null): v is number {
  return typeof v === 'number' && ((v >= 1 && v <= NOTE_HIGHEST) || isLowOctaveNote(v));
}

/** The pitch of a stored value (1 = C-0, linear below it), or null when it plays none. */
export function noteValueToPitch(v: number): number | null {
  if (v >= 1 && v <= NOTE_HIGHEST) return v;
  if (isLowOctaveNote(v)) return v + 1;
  return null;
}

/** The stored value of a pitch (1 = C-0), or 0 when the grid has no such note. */
export function pitchToNoteValue(p: number): number {
  if (p >= 1 && p <= PITCH_HIGHEST) return p;
  if (p >= PITCH_LOWEST && p <= 0) return p - 1;
  return 0;
}

/** MIDI note of a stored value (C-0 = 12, c_1 = 0), or null when it plays none. */
export function noteValueToMidi(v: number): number | null {
  const p = noteValueToPitch(v);
  return p === null ? null : p + 11;
}

/** Stored value of a MIDI note (0..107), or 0 outside the grid. */
export function midiToNoteValue(midi: number): number {
  return pitchToNoteValue(midi - 11);
}

const UPPER = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const LOWER = ['c_', 'c+', 'd_', 'd+', 'e_', 'f_', 'f+', 'g_', 'g+', 'a_', 'a+', 'b_'];

/** The three-glyph name of a pitch (1 = C-0): C-0 .. B-9 at and above C-0, c_1 .. b_1 below it; null further down. */
export function pitchName(p: number): string | null {
  const i = p - 1;
  const octave = Math.floor(i / 12);
  const semitone = ((i % 12) + 12) % 12;
  if (octave >= 0) return `${UPPER[semitone]}${octave}`;
  if (octave === -1) return `${LOWER[semitone]}1`;
  return null;
}

/** The name of a stored pitched value, or null. */
export function noteValueName(v: number): string | null {
  const p = noteValueToPitch(v);
  return p === null ? null : pitchName(p);
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * The stored value a note name stands for, or null when the text is no note
 * name. Accepts the grid's own names (C-4, C#4, c_1, c+1; the low octave in
 * either case, C_1) and an optional dash before the octave (C#-4, which has
 * always meant octave 4, so octave -1 is spelled only the grid's way).
 */
export function parseNoteName(text: string): number | null {
  const s = text.trim();
  // The octave below C-0 in the grid's own spelling: c_1, c+1.
  const low = /^([A-Ga-g])([_+])1$/.exec(s);
  if (low) {
    const p = SEMITONE[low[1].toUpperCase()] + (low[2] === '+' ? 1 : 0) - 12 + 1;
    return pitchToNoteValue(p) || null;
  }
  const m = /^([A-Ga-g])([#-]?)-?(\d)$/.exec(s);
  if (!m) return null;
  const semitone = SEMITONE[m[1].toUpperCase()] + (m[2] === '#' ? 1 : 0);
  const octave = parseInt(m[3], 10);
  const v = pitchToNoteValue(octave * 12 + semitone + 1);
  return v === 0 ? null : v;
}

/** How many cells (all note columns) of the patterns hold a note of the octave below C-0. */
export function countLowOctaveNotes(patterns: ReadonlyArray<{ channels: ReadonlyArray<{ rows: ReadonlyArray<{ note?: number; note2?: number; note3?: number; note4?: number } | undefined> }> }>): number {
  let n = 0;
  for (const p of patterns) for (const ch of p.channels) for (const c of ch.rows) {
    if (!c) continue;
    if (isLowOctaveNote(c.note ?? 0)) n++;
    if (isLowOctaveNote(c.note2 ?? 0)) n++;
    if (isLowOctaveNote(c.note3 ?? 0)) n++;
    if (isLowOctaveNote(c.note4 ?? 0)) n++;
  }
  return n;
}

/**
 * Why `format` cannot write these patterns, or null when it can: the format
 * has no note below C-0 and the song has notes there. Writers that hold the
 * octave below C-0 do not call this.
 */
export function lowOctaveExportRefusal(patterns: Parameters<typeof countLowOctaveNotes>[0], format: string): string | null {
  const n = countLowOctaveNotes(patterns);
  if (n === 0) return null;
  return `${format} has no notes below C-0, and this song has ${n} note${n === 1 ? '' : 's'} in the octave below it (c_1 to b_1). `
    + 'Transpose them up an octave, or export to a format that holds them (MIDI, or the song\'s own format).';
}
