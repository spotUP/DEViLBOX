/** Music Maker sdata export: moveback.sdata unedited is byte-identical; one note edit re-parses as the edit. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMusicMakerSongFile, buildMusicMakerGrid, decodeMusicMakerSong } from '@lib/import/formats/MusicMakerParser';
import { exportNativeSong } from '@lib/export/nativeExportRouter';

const DIR = join(process.cwd(), 'public/data/songs/formats/MusicMaker V8 Old/- unknown');
const rd = (n: string) => new Uint8Array(readFileSync(join(DIR, n)));
const load = () => {
  const raw = rd('moveback.sdata');
  const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  const song = parseMusicMakerSongFile(raw, 'moveback.sdata', new Map([['moveback.ip', ab(rd('moveback.ip'))], ['moveback.ip.n', ab(rd('moveback.ip.n'))]]));
  return { raw, song };
};

describe('Music Maker native export: moveback.sdata', () => {
  it('exports byte-exact unedited', async () => {
    const { raw, song } = load();
    const r = await exportNativeSong(song);
    expect(r?.warnings ?? []).toEqual([]);
    expect(Array.from(r!.data as Uint8Array)).toEqual(Array.from(raw));
  });

  it('writes one note edit in place and re-parses it', async () => {
    const { raw, song } = load();
    const g = buildMusicMakerGrid(decodeMusicMakerSong(raw));
    let hit: [number, number, number] | null = null;
    g.sources.forEach((pp, p) => pp.forEach((vv, v) => vv.forEach((s, r) => { if (!hit && s?.note) hit = [p, v, r]; })));
    const [p, v, r] = hit!;
    const cell = song.patterns[p].channels[v].rows[r];
    cell.note = cell.note + 2;
    const res = await exportNativeSong(song);
    const out = res!.data as Uint8Array;
    expect(res!.warnings).toEqual([]);
    expect(out.length).toBe(raw.length);
    expect(out.reduce((n, x, i) => n + (x !== raw[i] ? 1 : 0), 0)).toBe(1);
    const again = buildMusicMakerGrid(decodeMusicMakerSong(out));
    expect(again.patterns[p].channels[v].rows[r].note).toBe(cell.note);
  });
});
