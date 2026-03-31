/**
 * chordDefinitions.ts — Chord & arpeggio definitions for the pattern editor helper.
 *
 * Provides:
 *  - Chord types with semitone intervals (for multi-note column insertion)
 *  - Chip arpeggio presets (for 0xy effect commands)
 *  - Helpers to compute XM notes and display labels
 */

// ─── Note helpers ──────────────────────────────────────────────────────────────

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** XM note to short name (e.g., 49 → "C4", 53 → "E4") */
export function xmNoteShortName(xmNote: number): string {
  if (xmNote < 1 || xmNote > 96) return '?';
  const n = xmNote - 1; // 0-based
  const semitone = n % 12;
  const octave = Math.floor(n / 12);
  return `${NOTE_NAMES_SHARP[semitone]}${octave}`;
}

/** Compute XM notes for a chord given root + semitone intervals. Clamps to 1-96. */
export function chordNotes(rootXm: number, intervals: readonly number[]): number[] {
  return intervals.map(i => {
    const n = rootXm + i;
    return n >= 1 && n <= 96 ? n : 0; // 0 = out of range, skip
  }).filter(n => n > 0);
}

/** Apply inversion: move the lowest N notes up an octave */
export function invertChord(notes: number[], inversion: number): number[] {
  const sorted = [...notes].sort((a, b) => a - b);
  for (let i = 0; i < inversion && i < sorted.length - 1; i++) {
    sorted[i] += 12;
    if (sorted[i] > 96) sorted[i] -= 12; // can't go above B-7
  }
  return sorted.sort((a, b) => a - b);
}

// ─── Chord definitions ─────────────────────────────────────────────────────────

export interface ChordDefinition {
  name: string;
  short: string;       // abbreviated suffix (e.g., "m", "dim", "7")
  intervals: readonly number[];
  category: 'triad' | 'seventh';
}

export const CHORD_TYPES: ChordDefinition[] = [
  // Triads
  { name: 'Major',      short: '',    intervals: [0, 4, 7],     category: 'triad' },
  { name: 'Minor',      short: 'm',   intervals: [0, 3, 7],     category: 'triad' },
  { name: 'Diminished', short: 'dim', intervals: [0, 3, 6],     category: 'triad' },
  { name: 'Augmented',  short: 'aug', intervals: [0, 4, 8],     category: 'triad' },
  { name: 'Sus2',       short: 'sus2',intervals: [0, 2, 7],     category: 'triad' },
  { name: 'Sus4',       short: 'sus4',intervals: [0, 5, 7],     category: 'triad' },
  { name: 'Power',      short: '5',   intervals: [0, 7, 12],    category: 'triad' },
  // Seventh chords
  { name: 'Major 7th',  short: 'maj7',intervals: [0, 4, 7, 11], category: 'seventh' },
  { name: 'Minor 7th',  short: 'm7',  intervals: [0, 3, 7, 10], category: 'seventh' },
  { name: 'Dom 7th',    short: '7',   intervals: [0, 4, 7, 10], category: 'seventh' },
  { name: 'Dim 7th',    short: 'dim7',intervals: [0, 3, 6, 9],  category: 'seventh' },
];

/** Build a display label for a chord, e.g. "Major (C-E-G)" */
export function chordLabel(chord: ChordDefinition, rootXm: number): string {
  const notes = chordNotes(rootXm, chord.intervals);
  const names = notes.map(xmNoteShortName).join('-');
  return `${chord.name} (${names})`;
}

// ─── Chip arpeggio definitions ─────────────────────────────────────────────────

export interface ArpDefinition {
  name: string;
  param: number;  // 0xXY effect parameter
  label: string;  // display label like "047"
}

export const ARP_PRESETS: ArpDefinition[] = [
  { name: 'Major',          param: 0x47, label: '047' },
  { name: 'Minor',          param: 0x37, label: '037' },
  { name: 'Diminished',     param: 0x36, label: '036' },
  { name: 'Augmented',      param: 0x48, label: '048' },
  { name: 'Sus4',           param: 0x57, label: '057' },
  { name: 'Power 5th',      param: 0x70, label: '070' },
  { name: 'Octave',         param: 0xC0, label: '0C0' },
  { name: 'Minor 3rd',      param: 0x30, label: '030' },
  { name: 'Major 3rd',      param: 0x40, label: '040' },
  { name: 'Fifth + Octave', param: 0x7C, label: '07C' },
  { name: 'Dom7 (no 3rd)',  param: 0x7A, label: '07A' },
  { name: 'Minor 3rd+5th',  param: 0x37, label: '037' },
  { name: 'Octave Down',    param: 0x0C, label: '00C' },
];

// De-duplicate: remove entries with duplicate params (Minor 3rd+5th = Minor)
const seenParams = new Set<number>();
export const ARP_PRESETS_UNIQUE = ARP_PRESETS.filter(a => {
  if (seenParams.has(a.param)) return false;
  seenParams.add(a.param);
  return true;
});

/** Format arp label with note context, e.g. "Major 047 (C-E-G)" */
export function arpLabel(arp: ArpDefinition, rootXm: number): string {
  const x = (arp.param >> 4) & 0xF;
  const y = arp.param & 0xF;
  const n1 = xmNoteShortName(rootXm);
  const n2 = rootXm + x >= 1 && rootXm + x <= 96 ? xmNoteShortName(rootXm + x) : '?';
  const n3 = rootXm + y >= 1 && rootXm + y <= 96 ? xmNoteShortName(rootXm + y) : '?';
  if (y === 0) return `${arp.name} ${arp.label} (${n1}-${n2})`;
  if (x === 0) return `${arp.name} ${arp.label} (${n1}-${n3})`;
  return `${arp.name} ${arp.label} (${n1}-${n2}-${n3})`;
}
