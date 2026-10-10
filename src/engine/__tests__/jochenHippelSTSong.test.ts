/**
 * Jochen Hippel Atari ST songs (.hst / .sog / .soc): the song decoded to the
 * grid the player plays, every byte kept, and grid edits written back.
 *
 * Before 2026-10-06 JochenHippelSTParser was a detection stub: one empty
 * 64-row pattern (0 notes), .hst and .soc took UADE's scan grid, and a .sog
 * imported as that empty pattern with libtfmxaudiodecoder (which refuses
 * ST songs) for audio. The song layout is reversed from the Wanted Team
 * "Jochen Hippel ST" eagleplayer (Check, InitPlayer, Compress, the
 * sequencer); research: thoughts/shared/research/2026-10-05_hippel-st-replayer.md.
 * The player-side proof (UADE's voice state, edits heard) is
 * jochenHippelSTGridMatchesPlayer.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  decodeHstModule, encodeHstModule, hstPatternStreams, hstPatternRows, packHstRows, compressHstPattern,
  simulateHstSubsong, hstStep,
} from '@/lib/import/formats/JochenHippelSTModule';
import { HstSongEdit, applyHstGrid, hstGrid, hstSourceOfImage } from '@/lib/import/formats/JochenHippelSTSong';
import { parseJochenHippelSTFile } from '@/lib/import/formats/JochenHippelSTParser';
import { exportJochenHippelST } from '@/lib/export/JochenHippelSTExporter';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';

// The import route must keep the decoded grid; the UADE scan grid is a sentinel here.
const scanGrid = vi.hoisted(() => ({ name: 'uade-scan-grid', patterns: [], instruments: [] }));
vi.mock('@lib/import/formats/UADEParser', () => ({ parseUADEFile: vi.fn(async () => scanGrid) }));
import { parseModuleToSong } from '@/lib/import/parseModuleToSong';

const ROOT = join(process.cwd(), 'public/data/songs');
const CORPUS = [
  'hippel-st/crown arabia.hst', 'hippel-st/crown england.hst', 'hippel-st/crown japan.hst',
  'hippel-st/crown russia.hst', 'hippel-st/crown viking.hst', 'hippel-st/demo music10.sog',
  'formats/astaroth.sog', 'hippel-st-coso/ghostbattle titletune.soc',
];

function load(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(ROOT, rel)));
}
function parse(rel: string, subsong = 0): TrackerSong {
  return parseJochenHippelSTFile(load(rel).buffer as ArrayBuffer, rel.split('/').pop()!, subsong);
}
function eq(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
/** Notes per channel over the song order. */
function noteCounts(song: TrackerSong): number[] {
  const out = [0, 0, 0];
  for (const p of song.songPositions) song.patterns[p].channels.forEach((c, ch) => { out[ch] += c.rows.filter((r) => r.note > 0).length; });
  return out;
}

describe('Jochen Hippel ST song codec', () => {
  it.each(CORPUS)('%s: decode/encode is byte-exact, and so are the playback image\'s source and an unedited export', (rel) => {
    const bytes = load(rel);
    expect(eq(encodeHstModule(decodeHstModule(bytes)), bytes)).toBe(true);
    const edit = new HstSongEdit(bytes);
    expect(eq(hstSourceOfImage(edit.image)!, bytes)).toBe(true);
    expect(eq(edit.exportFile(), bytes)).toBe(true);
    const song = parse(rel);
    expect(eq(exportJochenHippelST(song).data, bytes)).toBe(true);
  });

  it.each(CORPUS)('%s: the grid rows are lossless - packing them again gives every pattern stream the player reads', (rel) => {
    const m = decodeHstModule(load(rel));
    const { patterns } = hstPatternRows(m);
    const streams = hstPatternStreams(m);
    let used = 0;
    patterns.forEach((rows, i) => {
      if (!rows) return;
      used++;
      expect(eq(packHstRows(rows), streams[i].bytes)).toBe(true);
    });
    expect(used).toBeGreaterThan(0);
    if (m.song.kind === 'raw') m.song.patterns.forEach((p, i) => expect(eq(compressHstPattern(p), streams[i].bytes)).toBe(true));
  });

  it('decodes the songs: three voices keep step together, notes per channel as the player reads them', () => {
    const arabia = parse('hippel-st/crown arabia.hst');
    expect(arabia.numChannels).toBe(3);
    expect(arabia.songPositions).toEqual(Array.from({ length: 28 }, (_, i) => i));
    expect(arabia.patterns[0].length).toBe(64);
    expect(arabia.initialSpeed).toBe(6);
    expect(noteCounts(arabia)).toEqual([705, 902, 767]);
    expect(noteCounts(parse('hippel-st/demo music10.sog'))).toEqual([761, 854, 1463]);
    expect(noteCounts(parse('hippel-st-coso/ghostbattle titletune.soc'))).toEqual([691, 1184, 1604]);
    // A cell: note = pattern note + step transpose (YM table index 0 = C-1 = XM 13), instrument = info & $1F + sound transpose + 1.
    const m = decodeHstModule(load('hippel-st/crown arabia.hst'));
    const ev = simulateHstSubsong(m, 0).events[0].find((e) => e.kind === 'note' && e.note < 0x80)!;
    const cell = arabia.patterns[ev.step].channels[0].rows[ev.row - 64 * ev.step];
    expect(cell.note).toBe(((ev.note & 0x7f) + ev.transpose) + 13);
    expect(cell.instrument).toBe(((ev.info & 0x1f) + ev.soundTranspose) + 1);
  });

  it('subsongs are UADE\'s numbers (the player counts from 1): astaroth subsong 2 is steps 37-84', () => {
    const s = parse('formats/astaroth.sog', 2);
    expect(s.songPositions).toEqual(Array.from({ length: 48 }, (_, i) => 37 + i));
    expect(s.initialSpeed).toBe(4);
    expect(s.uadeEditableSubsongs).toMatchObject({ count: 7, start: 1, first: 1 });
    expect(s.uadeEditableSubsongs!.orders![0]).toEqual(Array.from({ length: 36 }, (_, i) => i));
  });

  it('a grid edit is written into the file in its own encoding: raw rows in place, COSO streams packed again', () => {
    for (const rel of ['hippel-st/demo music10.sog', 'hippel-st/crown arabia.hst']) {
      const bytes = load(rel);
      const song = parse(rel);
      const step = song.songPositions[2];
      const rows = song.patterns[step].channels[1].rows;
      const noteRow = rows.findIndex((c) => c.note > 0 && c.instrument > 0);
      const emptyRow = rows.findIndex((c, r) => r > noteRow && c.note === 0);
      rows[noteRow] = { ...rows[noteRow], note: rows[noteRow].note + 2 };
      rows[emptyRow] = { ...rows[emptyRow], note: rows[noteRow].note, instrument: rows[noteRow].instrument };
      const out = exportJochenHippelST(song);
      expect(out.warnings).toEqual([]);
      expect(eq(out.data, bytes)).toBe(false);
      const again = parseJochenHippelSTFile(out.data.slice().buffer as ArrayBuffer, rel.split('/').pop()!);
      const got = again.patterns[step].channels[1].rows;
      expect(got[noteRow].note).toBe(rows[noteRow].note);
      expect(got[emptyRow]).toMatchObject({ note: rows[noteRow].note, instrument: rows[noteRow].instrument });
      // Nothing else moved: every other step of the song order reads as before
      // (patterns shown by more than one step take the edit everywhere).
      const pt = hstStep(decodeHstModule(bytes), step, 1).pattern;
      const before = parse(rel);
      for (const p of before.songPositions) {
        for (let ch = 0; ch < 3; ch++) {
          if (hstStep(decodeHstModule(bytes), p, ch).pattern === pt) continue;
          expect(again.patterns[p].channels[ch].rows.map((c) => [c.note, c.instrument])).toEqual(before.patterns[p].channels[ch].rows.map((c) => [c.note, c.instrument]));
        }
      }
      if (rel.endsWith('.sog')) expect(out.data.length).toBe(bytes.length); // raw rows change in place
    }
  });

  it('the live writes turn the playback image into the edited song\'s, row for row', () => {
    const bytes = load('hippel-st/crown arabia.hst');
    const edit = new HstSongEdit(bytes);
    const before = edit.image.slice();
    const step = 3;
    const grid = hstGrid(edit)[step]!;
    const r = grid[2].findIndex((c) => c.note === 0);
    const cell: TrackerCell = { ...grid[2][r], note: 50, instrument: 2 };
    const runs = edit.edit(step, r, 2, cell)!;
    expect(runs.length).toBe(1);
    const patched = before.slice();
    for (const run of runs) patched.set(run.bytes, run.offset);
    expect(eq(patched, edit.image)).toBe(true);
    // The patched image plays the edited song: its own walk reads the new note.
    const asSong = new HstSongEdit(patched);
    expect(asSong.cell(step, r, 2)).toMatchObject({ note: 50, instrument: 2 });
    expect(hstGrid(asSong).map((s) => s?.map((v) => v.map((c) => [c.note, c.instrument]))))
      .toEqual(hstGrid(edit).map((s) => s?.map((v) => v.map((c) => [c.note, c.instrument]))));
    // A note the step's transpose cannot reach is refused, not written.
    expect(edit.edit(step, r, 2, { ...cell, note: 1 })).toBeNull();
  });

  it('applyHstGrid writes only edited cells (a pattern shown by two steps keeps the edit made in either)', () => {
    const bytes = load('formats/astaroth.sog');
    const edit = new HstSongEdit(bytes);
    const grid = hstGrid(edit);
    // Two steps showing the same pattern on voice 0.
    const m = edit.module;
    let a = -1, b = -1;
    for (let i = 0; i < grid.length && b < 0; i++) for (let j = i + 1; j < grid.length; j++) {
      if (grid[i] && grid[j] && hstStep(m, i, 0).pattern === hstStep(m, j, 0).pattern && hstStep(m, i, 0).transpose === hstStep(m, j, 0).transpose
        && grid[j]![0].some((c) => c.note > 0 && c.instrument > 0)) { a = i; b = j; break; }
    }
    expect(b).toBeGreaterThan(a);
    const patterns = grid.map((s) => ({ channels: (s ?? [[], [], []]).map((rows) => ({ rows: rows.map((c) => ({ ...c })) })) }));
    const r = patterns[b].channels[0].rows.findIndex((c) => c.note > 0 && c.instrument > 0);
    patterns[b].channels[0].rows[r] = { ...patterns[b].channels[0].rows[r], note: patterns[b].channels[0].rows[r].note + 1 };
    expect(applyHstGrid(edit, patterns)).toEqual([]);
    const out = new HstSongEdit(edit.exportFile());
    expect(out.cell(b, r, 0).note).toBe(patterns[b].channels[0].rows[r].note);
    expect(out.cell(a, r, 0).note).toBe(patterns[b].channels[0].rows[r].note);
  });
});

describe('Jochen Hippel ST import route (the app entry point)', () => {
  it.each(['hippel-st/crown arabia.hst', 'hippel-st/demo music10.sog', 'hippel-st-coso/ghostbattle titletune.soc'])('%s imports as the decoded grid, UADE playing the playback image under an .hst name', async (rel) => {
    const name = rel.split('/').pop()!;
    const song = await parseModuleToSong(new File([load(rel).slice().buffer as ArrayBuffer], name));
    expect(song.name).toContain('[Jochen Hippel ST]');
    expect(noteCounts(song).every((n) => n > 0)).toBe(true);
    expect(song.uadePatternLayout?.formatId).toBe('jochenHippelST');
    expect(song.uadeEditableFileName).toMatch(/\.hst$/);
    expect(eq(hstSourceOfImage(new Uint8Array(song.uadeEditableFileData!))!, load(rel))).toBe(true);
  });
});
