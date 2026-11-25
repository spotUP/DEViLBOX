/**
 * T0AST export (C++ t0ast_export_*, T0astExporter): an unedited song exports byte-identical; an
 * edited cell and an edited order list come back through the engine's own loader (the grid decode
 * and the player share load()), and nothing else moved. Edited patterns are repacked, so their
 * bytes differ from T0AST's own packer; the decoded cells are what is held here.
 * Real songs in test-data/t0ast (Modland, git-ignored); cases skip without them.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseT0astFile } from '@/lib/import/formats/T0astParser';
import { buildT0astFile } from '@/lib/export/T0astExporter';
import type { T0astEditModule } from '@/engine/t0ast/t0astEditWasm';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = resolve(__dirname, '../../../..');
const DIR = join(ROOT, 'test-data/t0ast');
const songs = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.t0ast')).map((f) => join(DIR, f)) : [];
const create = async (): Promise<T0astEditModule> =>
  (await import('../../../../public/t0ast/T0astEdit.js')).default({ locateFile: (f: string) => join(ROOT, 'public/t0ast', f) });

const load = async (bytes: Uint8Array, name: string): Promise<TrackerSong> => {
  const song = await parseT0astFile(bytes, name, create);
  if (!song) throw new Error(`${name} does not parse`);
  return song;
};
const cells = (song: TrackerSong) => song.patterns.map((p) => p.channels.map((c) => c.rows.map((r) => ({ ...r }))));

describe('T0AST export', () => {
  // .each([]) registers nothing and vitest fails an empty suite; keep one skipped case.
  it.skipIf(songs.length > 0)('needs real songs in test-data/t0ast', () => {});
  it.skipIf(songs.length === 0).each(songs.map((f) => [f.split('/').pop() ?? f, f]))('%s: unedited is byte-identical, edits come back', async (name, file) => {
    const bytes = new Uint8Array(readFileSync(file));
    const song = await load(bytes, name);
    expect(Buffer.from(await buildT0astFile(song, create)).equals(Buffer.from(bytes))).toBe(true);

    // Edit one cell of the first played pattern: a note on a cell, everything else kept.
    const p = song.songPositions[0];
    const before = cells(song);
    const cell = song.patterns[p].channels[0].rows[5];
    const note = cell.note > 0 && cell.note < 90 ? cell.note + 1 : 49;
    song.patterns[p].channels[0].rows[5] = { ...cell, note };
    // And the order list: one more position playing the first pattern again.
    song.songPositions = [...song.songPositions, p];
    const out = await buildT0astFile(song, create);
    const back = await load(out, name);
    const want = cells(song);
    expect(back.songPositions).toEqual(song.songPositions);
    expect(cells(back)).toEqual(want);
    expect(want[p][0][5].note).toBe(note);
    expect(before.filter((_, i) => i !== p)).toEqual(want.filter((_, i) => i !== p));

    // The engine opens the exported file.
    const m = await create();
    const ptr = m._malloc(out.length);
    m.HEAPU8.set(out, ptr);
    expect(m._t0ast_open(ptr, out.length, 44100), m.UTF8ToString(m._t0ast_error())).toBe(1);
    m._free(ptr);
    m._t0ast_close();
  }, 60_000);
});
