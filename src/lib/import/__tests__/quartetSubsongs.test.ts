/**
 * Quartet PSG (.sqt): the file's songs are subsongs of one module.
 *
 * Regression: parseQuartetFile always drew song 0 and set no fileSubsongs, so the FT2 panel showed no
 * subsong selector and UADE (load not pinned to a subsong) ran on into the next songs at song end while the
 * grid stayed on song 0. Now the songs of quartetSongBases are fileSubsongs: the live switch (subsongStatus
 * source 'file') reopens at the picked song, the grid is that song's, and UADE is pinned to its number.
 * warlock_the_avenger.sqt: 5 songs (UADE: subsong min 0 max 4), then a padding run of repeated table entries.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseModuleToSong } from '../parseModuleToSong';
import { quartetSongBases } from '../formats/quartetPsgGrid';
import { subsongStatus } from '@/lib/tracker/subsongSwitch';
import { uadeEditableLoadArgs } from '@/engine/uade/uadeLoadArgs';
import type { TrackerSong } from '@/engine/TrackerReplayer';

vi.mock('@/engine/uade/UADEEngine', () => ({ UADEEngine: { hasInstance: () => true, getInstance: () => ({}) } }));
const scanGrid = vi.hoisted(() => ({ name: 'uade-scan-grid', patterns: [], instruments: [] }));
vi.mock('@lib/import/formats/UADEParser', () => ({ parseUADEFile: vi.fn(async () => scanGrid) }));

const NAME = 'warlock_the_avenger.sqt';
const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME)));
const open = (subsong?: number): Promise<TrackerSong> =>
  parseModuleToSong(new File([bytes.slice()], NAME), subsong) as Promise<TrackerSong>;

const signature = (s: TrackerSong): string =>
  JSON.stringify(s.patterns.map((p) => p.channels.map((c) => c.rows.filter((r) => r.note > 0).map((r) => r.note))));

describe('Quartet PSG subsongs', () => {
  it('counts the real songs, not the padding after the table', () => {
    expect(quartetSongBases(bytes).length).toBe(5);
  });

  it('carries fileSubsongs with the module count and the requested song current', async () => {
    const song = await open(2);
    expect(song.fileSubsongs).toMatchObject({ count: 5, current: 2 });
  });

  it('draws a different grid per subsong', async () => {
    const [a, b] = [await open(0), await open(2)];
    expect(signature(a)).not.toBe(signature(b));
  });

  it('offers the live switch (source file) and pins UADE to the drawn song', async () => {
    const song = await open(3);
    const status = subsongStatus({ fileSubsongs: song.fileSubsongs } as never);
    expect(status).toMatchObject({ source: 'file', count: 5, current: 3 });
    expect(uadeEditableLoadArgs(song as never)).toEqual(['sqt.warlock_the_avenger', 3, true, undefined]);
  });
});
