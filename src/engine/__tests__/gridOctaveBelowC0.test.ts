/**
 * The grid holds the octave below C-0 (owner decision 2026-10-07, G15): every
 * note shows at the pitch it plays, no format shifts a song up to fit.
 *
 * Encoding (src/lib/tracker/noteValue.ts): 1..96 = C-0..B-7 as before, the
 * octave below stored -12..-1 (c_1..b_1, Furnace's names for negative
 * octaves), 0 still empty, 97 still note-off. Held here:
 *   - every value a song stored before keeps its name, MIDI note and parse;
 *   - a low note round-trips through the store, an edit (transpose), MCP
 *     set_cell/get_cell, save/restore and both renderers' glyphs;
 *   - an old autosave (schema 24) loads with its patterns unchanged, and the
 *     Hippel / Future Player saves that carried an octave shift come back at
 *     their played pitch;
 *   - MOD/XM/IT/S3M and the native writers that cannot hold the octave refuse
 *     the song with the count, MIDI writes it as MIDI 0..11.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pattern, TrackerCell } from '@/types';
import {
  isLowOctaveNote, noteValueToPitch, pitchToNoteValue, noteValueName, parseNoteName, lowOctaveExportRefusal,
} from '@/lib/tracker/noteValue';
import { xmNoteToString, stringNoteToXM, xmNoteToMidi, midiToXMNote, noteToMidi, xmNoteToToneJS } from '@/lib/xmConversions';
import { noteStr } from '@/engine/renderer/TrackerCanvas2DRenderer';
import { getNoteTable, noteGlyphs } from '@/engine/renderer/TrackerGLRenderer';
import { transposeSelectionHelper } from '@/stores/tracker/patternEditActions';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { resetStore } from '@/stores/__tests__/_harness';
import { noteToString } from '@/bridge/handlers/readHandlers';
import { savedSongToApply } from '@/lib/song/savedSong';
import { exportWithOpenMPT } from '@/lib/export/OpenMPTExporter';
import { exportPatternToMIDI } from '@/lib/export/midiExport';
import { xmNoteToNoteName } from '@/engine/replayer/PeriodTables';

const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function cell(note: number): TrackerCell {
  return { note, instrument: note > 0 || note < 0 ? 1 : 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}
function pattern(notes: number[]): Pattern {
  return {
    id: 'p0', name: 'P0', length: notes.length,
    channels: [{ id: 'c0', name: 'Channel 1', muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null, rows: notes.map(cell) }],
  } as Pattern;
}

describe('notes a song stored before keep their meaning', () => {
  it('1..96: the same name, MIDI note and parse as the XM numbering always gave', () => {
    for (let v = 1; v <= 96; v++) {
      const name = `${NAMES[(v - 1) % 12]}${Math.floor((v - 1) / 12)}`;
      expect(xmNoteToString(v)).toBe(name);
      expect(stringNoteToXM(name)).toBe(v);
      expect(xmNoteToMidi(v)).toBe(v + 11);
      expect(midiToXMNote(v + 11)).toBe(v);
      expect(noteToMidi(v)).toBe(v + 11);
      expect(noteToString(v)).toBe(name);
    }
    expect(xmNoteToString(0)).toBe('...');
    expect(xmNoteToString(97)).toBe('===');
    expect(stringNoteToXM('C#-4'), 'a dash before the octave still means that octave').toBe(50);
    expect(midiToXMNote(127), 'above B-7 still clamps').toBe(96);
  });
});

describe('the octave below C-0', () => {
  it('c_1..b_1 are stored -12..-1: pitch -11..0, MIDI 0..11, and every name parses back', () => {
    const low = ['c_1', 'c+1', 'd_1', 'd+1', 'e_1', 'f_1', 'f+1', 'g_1', 'g+1', 'a_1', 'a+1', 'b_1'];
    for (let i = 0; i < 12; i++) {
      const v = -12 + i;
      expect(isLowOctaveNote(v)).toBe(true);
      expect(noteValueToPitch(v)).toBe(-11 + i);
      expect(pitchToNoteValue(-11 + i)).toBe(v);
      expect(noteValueName(v)).toBe(low[i]);
      expect(xmNoteToString(v)).toBe(low[i]);
      expect(stringNoteToXM(low[i])).toBe(v);
      expect(parseNoteName(low[i].toUpperCase()), 'MCP upper-cases names').toBe(v);
      expect(xmNoteToMidi(v)).toBe(i);
      expect(midiToXMNote(i)).toBe(v);
      expect(noteToString(v)).toBe(low[i]);
    }
    // One semitone apart across the hole at 0: b_1 (-1) then C-0 (1)
    expect(noteValueToPitch(1)! - noteValueToPitch(-1)!).toBe(1);
    expect(xmNoteToToneJS(-12), 'Tone.js names it octave -1 (MIDI 0)').toBe('C-1');
    expect(xmNoteToNoteName(-1), 'the replayer names it octave -1').toBe('B-1');
  });

  it('both renderers draw the glyphs c_1 .. b_1, and C-0 and empty as before', () => {
    expect(noteStr(-12, 0)).toBe('c_1');
    expect(noteStr(-1, 0)).toBe('b_1');
    expect(noteStr(1, 0)).toBe('C-0');
    expect(noteStr(0, 0)).toBe('···');
    const table = getNoteTable(0);
    expect(noteGlyphs(table, -12, 0)).toBe('c_1');
    expect(noteGlyphs(table, -2, 0)).toBe('a+1');
    expect(noteGlyphs(table, 49, 0)).toBe('C-4');
    expect(noteGlyphs(table, 0, 0)).toBe('---');
    for (let v = -12; v <= -1; v++) expect(noteGlyphs(table, v, 0)).toHaveLength(3);
  });

  describe('in the store', () => {
    beforeEach(() => resetStore(useTrackerStore));

    it('a low note set into a cell is the note read back, and an edit (transpose) moves across C-0 both ways', () => {
      const s = useTrackerStore.getState();
      s.loadPatterns([pattern([0, 0, 0, 0])]);
      s.setCurrentPattern(0);
      useTrackerStore.getState().setCell(0, 0, { note: -12 });
      useTrackerStore.getState().setCell(0, 1, { note: 1 });
      const rows = () => useTrackerStore.getState().patterns[0].channels[0].rows;
      expect(rows()[0].note).toBe(-12);
      // Transpose: C-0 down a semitone is b_1, back up is C-0; c_1 is the floor
      const p = structuredClone(useTrackerStore.getState().patterns[0]);
      const sel = { startChannel: 0, endChannel: 0, startRow: 0, endRow: 1, startColumn: 'note' as const, endColumn: 'note' as const, columnTypes: ['note' as const] };
      const cursor = { channelIndex: 0, rowIndex: 0, columnType: 'note' as const, noteColumnIndex: 0, digitIndex: 0 };
      transposeSelectionHelper(p, sel as never, cursor as never, -1, null);
      expect(p.channels[0].rows.map((r) => r.note).slice(0, 2), 'c_1 stays (floor), C-0 becomes b_1').toEqual([-12, -1]);
      transposeSelectionHelper(p, sel as never, cursor as never, 13, null);
      expect(p.channels[0].rows.map((r) => r.note).slice(0, 2)).toEqual([2, 13]);
      transposeSelectionHelper(p, sel as never, cursor as never, -12, null);
      expect(p.channels[0].rows.map((r) => r.note).slice(0, 2), 'an octave down lands in the low octave').toEqual([-11, 1]);
    });
  });

  it('save and restore: a low note survives the saved project JSON and the one restore path', () => {
    const saved = JSON.parse(JSON.stringify({ metadata: { name: 'low' }, bpm: 125, patterns: [pattern([-12, -1, 1, 97])], instruments: [] }));
    const song = savedSongToApply(saved);
    expect(song.patterns[0].channels[0].rows.map((r) => r.note)).toEqual([-12, -1, 1, 97]);
  });

  it('MIDI export writes the octave as MIDI notes 0..11', () => {
    const bytes = exportPatternToMIDI(pattern([-12, 0, -1, 0]), 125, [4, 4]);
    const ons: number[] = [];
    for (let i = 0; i + 2 < bytes.length; i++) if ((bytes[i] & 0xf0) === 0x90 && bytes[i + 2] > 0) ons.push(bytes[i + 1]);
    expect(ons).toEqual([0, 11]);
  });

  it('MOD/XM/IT/S3M refuse a song with notes there, naming how many (never dropped or shifted silently)', async () => {
    for (const format of ['mod', 'xm', 'it', 's3m'] as const) {
      await expect(exportWithOpenMPT([pattern([-12, 13, -1, 0])], [], [0], { format, moduleName: 'x' })).rejects.toThrow(/has no notes below C-0, and this song has 2 notes/);
    }
    expect(lowOctaveExportRefusal([pattern([1, 96, 97, 0])], 'MOD'), 'a song inside C-0..B-7 is not refused').toBeNull();
  });
});

describe('saved songs', () => {
  const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/autosave-schema24.json'), 'utf8')) as {
    plain: { patterns: Pattern[]; instruments: unknown[] };
    hippel: { patterns: Pattern[]; instruments: unknown[] };
    futurePlayer: { patterns: Pattern[]; instruments: Array<{ metadata: Record<string, unknown> }> };
  };

  it('an autosave from before (schema 24) loads with every pattern cell unchanged', () => {
    const before = JSON.stringify(fixture.plain.patterns);
    const song = savedSongToApply(structuredClone({ metadata: { name: 'old' }, bpm: 125, ...fixture.plain } as never));
    expect(JSON.stringify(song.patterns)).toBe(before);
  });

  it('a Hippel save from 858d8ef85 (cells with hippelBias 12) comes back at the played pitch, the field gone', () => {
    const song = savedSongToApply(structuredClone({ metadata: { name: 'warp' }, bpm: 125, ...fixture.hippel } as never));
    const rows = song.patterns[0].channels[0].rows;
    // shown 1 (C-0) was pitch -11 (c_1); shown 12 was pitch 0 (b_1); shown 25 was pitch 13 (C-1); 97 stays
    expect(rows.map((r) => r.note)).toEqual([-12, -1, 13, 97, 0]);
    expect(rows.some((r) => 'hippelBias' in r)).toBe(false);
  });

  it('a Future Player save from 2673e7140 (instruments with fpOctaveBias 12) comes back at the played pitch', () => {
    const song = savedSongToApply(structuredClone({ metadata: { name: 'hybris' }, bpm: 125, ...fixture.futurePlayer } as never));
    expect(song.patterns[0].channels[0].rows.map((r) => r.note)).toEqual([-7, 25, 0, 97]);
    expect((song.instruments[0] as { metadata?: Record<string, unknown> }).metadata).not.toHaveProperty('fpOctaveBias');
  });
});
