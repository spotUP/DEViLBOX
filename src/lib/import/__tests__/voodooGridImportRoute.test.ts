/**
 * Voodoo Supreme phase A: loading .vss files through parseModuleToSong yields the decoder's time-aligned grid
 * (display only; note write-back is phase B). Expected values were measured from the song bytes with the decoder:
 * voo8.vss: 6289 rows (1 tick per row, 50 Hz), 365 / 599 / 481 / 562 notes per voice; silkworm.vss: 6913 rows,
 * 790 / 723 / 312 / 298 notes per voice. Pitch = periodToPitch of the replayer's table period (voo8 voice 0 first note: table
 * period 224 = pitch 36), shown lifted by 12 on both songs (octaveLift) because the lowest pitch is -11. Octave unverified
 * against audio.
 */
import { isPitchedNote } from '@/lib/tracker/noteValue';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../formats/voodooSupremeGrid', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/voodooSupremeGrid')>();
  return { ...orig, buildVoodooGrid: (...a: Parameters<typeof orig.buildVoodooGrid>) => { sentinel.calls++; return orig.buildVoodooGrid(...a); } };
});

const ROOT = process.cwd();
const rowsOf = (song: TrackerSong, voice: number) => song.patterns.flatMap((p) => p.channels[voice].rows);
const played = (song: TrackerSong, voice: number) => rowsOf(song, voice).map((c) => c.note).filter((n) => isPitchedNote(n));

async function load(path: string): Promise<TrackerSong> {
  const { parseModuleToSong } = await import('../parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(ROOT, path)));
  const before = sentinel.calls;
  const song = await parseModuleToSong(new File([raw], path.split('/').pop() as string));
  expect(sentinel.calls).toBeGreaterThan(before);
  expect(song.gridUnmatchedReason).toBeUndefined();
  return song;
}

describe('voodoo supreme import route', () => {
  it('voo8.vss', async () => {
    const song = await load('public/data/songs/voodoo/voo8.vss');
    expect(song.numChannels).toBe(4);
    expect(song.initialSpeed).toBe(1);
    expect(rowsOf(song, 0).length).toBe(6289);
    expect([0, 1, 2, 3].map((v) => played(song, v).length)).toEqual([365, 599, 481, 562]);
    const first = song.patterns[0].channels.map((c) => c.rows.slice(0, 16).map((r) => r.note));
    expect(first[0]).toEqual([36, 0, 0, 0, 0, 0, 0, 0, 0, 0, 36, 0, 36, 0, 0, 0]);
    expect(first[1]).toEqual([97, 0, 39, 0, 0, 0, 0, 0, 39, 0, 0, 0, 0, 0, 39, 0]);
    expect(first[2]).toEqual([97, 0, 0, 0, 43, 0, 43, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('silkworm.vss', async () => {
    const song = await load('public/data/songs/voodoo-supreme/silkworm.vss');
    expect(rowsOf(song, 0).length).toBe(6913);
    expect([0, 1, 2, 3].map((v) => played(song, v).length)).toEqual([790, 723, 312, 298]);
    expect(song.patterns[0].channels[0].rows[0].note).toBe(37);
    expect(song.patterns[0].channels[0].rows[8].note).toBe(97);
  });
});
