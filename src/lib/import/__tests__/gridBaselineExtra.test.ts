/**
 * gridBaselineExtra: a second per-cell hash over the further note columns (extraNotes), which hashCell
 * leaves out and whose stored values must not change. Real song: Ben Daglish (motorhead), which has note column 2.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});

import { parseBenDaglishFile } from '../formats/BenDaglishParser';
import {
  baselineOf, extraBaselineOf, setGridBaseline, editedCells, gridIsEdited, hashCell, hashExtraNotes,
} from '@/lib/song/gridBaseline';
import { restoreFromStoredBytes } from '@/lib/song/restoreFromStoredBytes';
import { installWasmNodeFetch } from './helpers/dwNodeFetch';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { Pattern } from '@/types/tracker';

let restore = () => {};
beforeAll(() => { restore = installWasmNodeFetch('bd', 'Bd'); });
afterAll(() => restore());
afterEach(() => setGridBaseline(null));

const NAME = 'motorhead-titleandingame.bd';
async function load(): Promise<TrackerSong> {
  const f = readFileSync(resolve(process.cwd(), 'public/data/songs/ben-daglish', NAME));
  const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
  return await parseBenDaglishFile(ab, NAME) as unknown as TrackerSong;
}
/** Bump the first note column 2 note; returns where it was. */
function editColumn2(patterns: Pattern[]): { pattern: number; channel: number; row: number } {
  for (let pi = 0; pi < patterns.length; pi++) for (let c = 0; c < patterns[pi].channels.length; c++) {
    const rows = patterns[pi].channels[c].rows;
    for (let r = 0; r < rows.length; r++) {
      const x = rows[r].extraNotes?.[0];
      if (x?.note && x.note < 90) { x.note += 1; return { pattern: pi, channel: c, row: r }; }
    }
  }
  throw new Error('no note column 2 in the fixture');
}

describe('gridBaselineExtra', () => {
  it('an edit only in note column 2 is an edited cell (hashCell alone cannot see it)', async () => {
    const song = await load();
    setGridBaseline(baselineOf(song.patterns), extraBaselineOf(song.patterns));
    const at = editColumn2(song.patterns);
    const cell = song.patterns[at.pattern].channels[at.channel].rows[at.row];
    expect(hashCell(cell), 'the old hash is blind to it').toBe(baselineOf(song.patterns)[at.pattern][at.channel * song.patterns[at.pattern].channels[0].rows.length + at.row]);
    const edits = editedCells(song.patterns);
    expect(edits.map((e) => [e.pattern, e.channel, e.row])).toEqual([[at.pattern, at.channel, at.row]]);
    expect(gridIsEdited(song.patterns)).toBe(true);
  });

  it('an unedited song has no edited cells', async () => {
    const song = await load();
    setGridBaseline(baselineOf(song.patterns), extraBaselineOf(song.patterns));
    expect(editedCells(song.patterns)).toEqual([]);
    expect(gridIsEdited(song.patterns)).toBe(false);
  });

  it('absent, empty and empty-column extraNotes hash alike', () => {
    const base = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    expect(hashExtraNotes({ ...base, extraNotes: [] })).toBe(hashExtraNotes(base));
    expect(hashExtraNotes({ ...base, extraNotes: [{}] })).toBe(hashExtraNotes(base));
    expect(hashExtraNotes({ ...base, extraNotes: [{ note: 5 }] })).not.toBe(hashExtraNotes(base));
  });

  it('a baseline without gridBaselineExtra (an older save) reports no extra-column edits and no false edits', async () => {
    const song = await load();
    setGridBaseline(baselineOf(song.patterns)); // extra unknown
    expect(editedCells(song.patterns)).toEqual([]);
    editColumn2(song.patterns);
    expect(editedCells(song.patterns), 'column 2 counts as unchanged').toEqual([]);
    expect(gridIsEdited(song.patterns)).toBe(false);
  });

  describe('restore', () => {
    const savedOf = (patterns: Pattern[]) => ({
      patterns, instruments: [], engine: { uadeEditableFileData: new ArrayBuffer(8), uadeEditableFileName: NAME },
    }) as never;

    it('keeps a column-2 edit when the save carries gridBaselineExtra', async () => {
      const fresh = await load();
      const saved = await load();
      const at = editColumn2(saved.patterns);
      const parse = vi.fn(async () => fresh as never);
      const out = await restoreFromStoredBytes(savedOf(saved.patterns), baselineOf(fresh.patterns), parse, extraBaselineOf(fresh.patterns));
      expect(out.redecoded).toBe(true);
      const got = out.song.patterns[at.pattern].channels[at.channel].rows[at.row];
      expect(got.extraNotes?.[0]?.note).toBe(saved.patterns[at.pattern].channels[at.channel].rows[at.row].extraNotes?.[0]?.note);
      expect(out.baselineExtra).toEqual(extraBaselineOf(fresh.patterns));
    });

    it('an older save (no gridBaselineExtra) restores exactly as before: the fresh decode, no false edits', async () => {
      const fresh = await load();
      const saved = await load();
      const at = editColumn2(saved.patterns);
      const parse = vi.fn(async () => fresh as never);
      const out = await restoreFromStoredBytes(savedOf(saved.patterns), baselineOf(fresh.patterns), parse);
      expect(out.redecoded).toBe(true);
      expect(out.song.patterns[at.pattern].channels[at.channel].rows[at.row]).toBe(fresh.patterns[at.pattern].channels[at.channel].rows[at.row]);
      expect(out.song.patterns.every((p, pi) => p.channels.every((ch, c) => ch.rows.every((r, i) => r === fresh.patterns[pi].channels[c].rows[i])))).toBe(true);
    });
  });
});
