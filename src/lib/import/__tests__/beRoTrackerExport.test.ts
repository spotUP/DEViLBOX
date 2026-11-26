/**
 * BeRoTracker export (C++ brt_export_*, BeRoTrackerExporter): an unedited song exports
 * byte-identical; an edited cell and an edited order list come back through the engine's own
 * loader (the grid decode and the player share load()), and nothing else moved. The engine's
 * player open (brt_open) takes the exported file.
 * Songs: the shipped demo plus test-data/berotracker (Modland, git-ignored) when present.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseBeRoTrackerFile } from '@/lib/import/formats/BeRoTrackerParser';
import { buildBeRoTrackerFile } from '@/lib/export/BeRoTrackerExporter';
import type { BeRoTrackerEditModule } from '@/engine/berotracker/beRoTrackerEditWasm';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = resolve(__dirname, '../../../..');
const DIR = join(ROOT, 'test-data/berotracker');
const songs = [
  join(ROOT, 'public/data/songs/formats/wonderful-dream-landscapes.brt'),
  ...(existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.brt')).map((f) => join(DIR, f)) : []),
].filter((f) => existsSync(f));
const create = async (): Promise<BeRoTrackerEditModule> =>
  (await import('../../../../public/berotracker/BeRoTrackerEdit.js')).default({ locateFile: (f: string) => join(ROOT, 'public/berotracker', f) });

const load = async (bytes: Uint8Array, name: string): Promise<TrackerSong> => {
  const song = await parseBeRoTrackerFile(bytes, name, create);
  if (!song) throw new Error(`${name} does not parse`);
  return song;
};
const cells = (song: TrackerSong) => song.patterns.map((p) => p.channels.map((c) => c.rows.map((r) => ({ ...r }))));

describe('BeRoTracker export', () => {
  it.each(songs.map((f) => [f.split('/').pop() ?? f, f]))('%s: unedited is byte-identical, edits come back', async (name, file) => {
    const bytes = new Uint8Array(readFileSync(file));
    const song = await load(bytes, name);
    expect(Buffer.from(await buildBeRoTrackerFile(song, create)).equals(Buffer.from(bytes))).toBe(true);

    // Edit one cell of the first played pattern: a note, everything else kept.
    const p = song.songPositions[0];
    const before = cells(song);
    const cell = song.patterns[p].channels[0].rows[5];
    const note = cell.note > 0 && cell.note < 90 ? cell.note + 1 : 49;
    song.patterns[p].channels[0].rows[5] = { ...cell, note };
    // And the order list: one more position playing the first pattern again.
    song.songPositions = [...song.songPositions, p];
    const out = await buildBeRoTrackerFile(song, create);
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
    expect(m._brt_open(ptr, out.length, 44100), m.UTF8ToString(m._brt_error())).toBe(1);
    m._free(ptr);
    m._brt_close();
  }, 60_000);
});
