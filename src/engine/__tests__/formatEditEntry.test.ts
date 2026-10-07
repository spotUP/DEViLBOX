/**
 * P14: edit / record / jam follow the reference trackers in every editor mode (pt2-clone, ft2-clone).
 *
 *  - planNoteEntry: edit off writes nothing; edit on and stopped writes at the cursor and steps by the edit step;
 *    recording while playing writes at the playback row (record quantize) and leaves the cursor.
 *  - ENTRY_OWNER covers every EditorMode of src/types/tracker.ts (counted from the union, not a list here), so a new
 *    mode must say who writes its keys.
 *  - Per canvas-owned mode: typing C-3 / F#2 (inside every format's range; JamCracker holds C-1..B-3) writes a value that THAT mode's own column formatter draws the same
 *    (before, every mode got the same 0-based number, so Hively, GoatTracker, SID Factory II and MusicLine drew the
 *    note one semitone low and CheeseCutter three).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planNoteEntry, planCursorEntry, typedPitch, quantizeRecordRow, type EntryContext } from '@/lib/tracker/formatEntryPlan';
import { ENTRY_OWNER, windowHandlerWritesCells } from '@/lib/tracker/formatModeKeyOwnership';
import { typedNoteValue, type ColumnDef } from '@/components/shared/format-editor-types';
import { HIVELY_COLUMNS } from '@/components/hively/hivelyAdapter';
import { KLYS_COLUMNS } from '@/components/klystrack/klysAdapter';
import { JAMCRACKER_COLUMNS } from '@/components/jamcracker/jamcrackerAdapter';
import { SF2_COLUMNS } from '@/components/sidfactory2/sf2Adapter';
import { CC_COLUMNS } from '@/components/cheesecut/cheeseCutterAdapter';
import { MUSICLINE_COLUMNS } from '@/components/musicline/musiclineAdapter';
import { GTU_COLUMNS } from '@/components/gtultra/gtuAdapter';

const ctx = (over: Partial<EntryContext> = {}): EntryContext => ({
  recordMode: true, isPlaying: false, cursorRow: 4, playbackRow: 9, editStep: 1, numRows: 64,
  recQuantEnabled: false, recQuantRes: 0, ...over,
});

describe('planNoteEntry (ft2_edit.c testNoteKeys / recordNote, pt2_edit.c jamAndPlaceSample)', () => {
  it('edit off: keys only jam, nothing is written', () => {
    expect(planNoteEntry(ctx({ recordMode: false }))).toEqual({ write: false });
    expect(planNoteEntry(ctx({ recordMode: false, isPlaying: true }))).toEqual({ write: false });
    expect(planCursorEntry(ctx({ recordMode: false }))).toEqual({ write: false });
  });
  it('edit on, stopped: written at the cursor row, cursor moves by the edit step and wraps', () => {
    expect(planNoteEntry(ctx({ editStep: 1 }))).toEqual({ write: true, row: 4, nextCursorRow: 5 });
    expect(planNoteEntry(ctx({ editStep: 4, cursorRow: 62 }))).toEqual({ write: true, row: 62, nextCursorRow: 2 });
    expect(planNoteEntry(ctx({ editStep: 0 }))).toEqual({ write: true, row: 4, nextCursorRow: null });
  });
  it('recording while playing: written at the playback row, cursor stays', () => {
    expect(planNoteEntry(ctx({ isPlaying: true }))).toEqual({ write: true, row: 9, nextCursorRow: null });
  });
  it('record quantize snaps to the nearest multiple and never past the last row', () => {
    expect(quantizeRecordRow(9, 4, 64)).toBe(8);
    expect(quantizeRecordRow(10, 4, 64)).toBe(12);
    expect(quantizeRecordRow(63, 8, 64)).toBe(63);
    expect(planNoteEntry(ctx({ isPlaying: true, recQuantEnabled: true, recQuantRes: 4, playbackRow: 11 })).write && 
      (planNoteEntry(ctx({ isPlaying: true, recQuantEnabled: true, recQuantRes: 4, playbackRow: 11 })) as { row: number }).row).toBe(12);
  });
  it('hex and delete entry are edit mode only (not while playing)', () => {
    expect(planCursorEntry(ctx({ isPlaying: true }))).toEqual({ write: false });
    expect(planCursorEntry(ctx())).toEqual({ write: true, row: 4, nextCursorRow: 5 });
  });
});

describe('who writes a typed key, per editor mode', () => {
  it('every EditorMode in the type has an owner; only the store-drawn modes let the window handler write', () => {
    const src = readFileSync('src/types/tracker.ts', 'utf8');
    const union = /export type EditorMode =([^;]+);/.exec(src)![1];
    const modes = [...union.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]);
    expect(modes.length).toBe(13);
    expect(Object.keys(ENTRY_OWNER).sort()).toEqual([...modes].sort());
    const window = modes.filter((m) => windowHandlerWritesCells(m as keyof typeof ENTRY_OWNER));
    expect(window.sort()).toEqual(['classic', 'furnace', 'suntronic', 'tfmx']);
  });
});

/** The canvas-owned modes and the note column each draws. */
const NOTE_COLUMNS: Array<[string, ColumnDef[]]> = [
  ['hively', HIVELY_COLUMNS], ['klystrack', KLYS_COLUMNS], ['jamcracker', JAMCRACKER_COLUMNS],
  ['sidfactory2', SF2_COLUMNS], ['cheesecutter', CC_COLUMNS], ['musicline', MUSICLINE_COLUMNS], ['goattracker', GTU_COLUMNS],
];

describe('a typed note is drawn as the note typed, in every canvas-owned mode', () => {
  it('covers exactly the modes whose entry owner is the canvas', () => {
    expect(NOTE_COLUMNS.map(([m]) => m).sort()).toEqual(Object.entries(ENTRY_OWNER).filter(([, o]) => o === 'canvas').map(([m]) => m).sort());
  });
  for (const [mode, cols] of NOTE_COLUMNS) {
    it(`${mode}: C-3 and F#2 read back as typed`, () => {
      const col = cols.find((c) => c.type === 'note')!;
      for (const [keyName, key, octave, drawn] of [['C-3', 'z', 3, /^C-3$/], ['F#2', 'g', 2, /^F#2$/]] as const) {
        const pitch = typedPitch(key, octave);
        expect(pitch, `${mode} ${keyName} key`).not.toBeNull();
        const value = typedNoteValue(col, pitch!);
        expect(value, `${mode} ${keyName} in range`).not.toBeNull();
        expect(col.formatter(value!), `${mode} ${keyName}`).toMatch(drawn);
      }
    });
  }
  it('a note the format cannot hold is refused (Hively tops out at B-4)', () => {
    const col = HIVELY_COLUMNS.find((c) => c.type === 'note')!;
    expect(typedNoteValue(col, typedPitch('z', 6)!)).toBeNull();
    expect(typedNoteValue(col, typedPitch('z', 4)!)).not.toBeNull();
  });
});
