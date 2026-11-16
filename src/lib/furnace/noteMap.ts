/**
 * Furnace instrument note map (DivInstrumentAmiga::noteMap): 180 entries, index = row note
 * (C-4 = 108). Each entry plays sample `map` (-1 = none) at the pitch of note `freq`.
 * Imported instruments store `{ freq, map }`; older editor-made ones stored
 * `{ note, sample, frequency }`. Both are read; writes use `{ freq, map }`.
 */
import type { FurnaceAmigaConfig } from '@typedefs/instrument';

export const FURNACE_NOTE_COUNT = 180;
export interface NoteMapEntry { freq: number; map: number }

type StoredEntry = FurnaceAmigaConfig['noteMap'][number];

export function readNoteMapEntry(e: StoredEntry | undefined, index: number): NoteMapEntry {
  if (!e) return { freq: index, map: -1 };
  if ('map' in e) return { freq: e.freq, map: e.map };
  return { freq: e.frequency ?? index, map: e.sample ?? -1 };
}

/** Furnace row note to name: 60 is C-0, 108 is C-4. */
export function furnaceNoteName(note: number): string {
  const names = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
  return `${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 5}`;
}

/** A full 180-entry map with one entry changed; missing entries are filled with "no remap". */
export function withNoteMapEntry(noteMap: StoredEntry[] | undefined, index: number, patch: Partial<NoteMapEntry>): NoteMapEntry[] {
  const out = Array.from({ length: FURNACE_NOTE_COUNT }, (_, i) => readNoteMapEntry(noteMap?.[i], i));
  out[index] = { ...out[index], ...patch };
  return out;
}
