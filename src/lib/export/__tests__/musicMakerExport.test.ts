/** Music Maker sdata export: moveback.sdata unedited is byte-identical; one note edit re-parses as the edit. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMusicMakerSongFile, buildMusicMakerGrid, decodeMusicMakerSong } from '@lib/import/formats/MusicMakerParser';
import { exportNativeSong } from '@lib/export/nativeExportRouter';
import { songFile } from '../../../test/songPath';

const DIR = join(process.cwd(), 'public/data/songs/musicmaker-v8/old/- unknown');
const rd = (n: string) => new Uint8Array(readFileSync(join(DIR, n)));
const load = (n = 'moveback') => {
  const raw = rd(n + '.sdata');
  const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
  const song = parseMusicMakerSongFile(raw, n + '.sdata', new Map([[n + '.ip', ab(rd(n + '.ip'))], [n + '.ip.n', ab(rd(n + '.ip.n'))]]));
  return { raw, song };
};

describe('Music Maker native export: moveback.sdata', () => {
  it('exports byte-exact unedited', async () => {
    const { raw, song } = load();
    const r = await exportNativeSong(song);
    expect(r?.warnings ?? []).toEqual([]);
    expect(Array.from(r!.data as Uint8Array)).toEqual(Array.from(raw));
  });

  it('best of guitars.sdata exports byte-exact unedited', async () => {
    const { raw, song } = load('best of guitars');
    const r = await exportNativeSong(song);
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

describe('Music Maker edit reaches the bytes the engine plays', () => {
  it('editedModuleForPlay returns the IFF with the edited sdata; unedited returns null', async () => {
    const { song } = load();
    const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
    setGridBaseline(baselineOf(song.patterns));
    const { editedModuleForPlay } = await import('@engine/replayer/editedModuleForPlay');
    const { WASM_ENGINES } = await import('@engine/replayer/wasmEngineRegistry');
    const desc = WASM_ENGINES.find((d) => d.key === 'MusicMaker')!;
    expect(await editedModuleForPlay(song, desc)).toBeNull();
    const g = buildMusicMakerGrid(decodeMusicMakerSong(load().raw));
    let hit: [number, number, number] | null = null;
    g.sources.forEach((pp, p) => pp.forEach((vv, v) => vv.forEach((s, r) => { if (!hit && s?.note) hit = [p, v, r]; })));
    const [p, v, r] = hit!;
    song.patterns[p].channels[v].rows[r].note += 2;
    const played = new Uint8Array((await editedModuleForPlay(song, desc)) as ArrayBuffer);
    const loaded = new Uint8Array(song.musicMakerFileData!);
    expect(played.length).toBe(loaded.length);
    expect(played.reduce((n, x, i) => n + (x !== loaded[i] ? 1 : 0), 0)).toBe(1);
  });
});

describe('Music Maker IFF (.mm4/.mm8) is editable', () => {
  const FILES = ['easystyleofmsx.mm4', 'house2.mm8'];
  const loadIff = async (n: string) => {
    const raw = new Uint8Array(readFileSync(songFile(n)));
    const { parseMusicMaker4VFile, parseMusicMaker8VFile } = await import('@lib/import/formats/MusicMakerParser');
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    return { raw, song: n.endsWith('.mm4') ? parseMusicMaker4VFile(ab, n) : parseMusicMaker8VFile(ab, n) };
  };
  for (const n of FILES) {
    it(`${n}: real grid, byte-exact unedited, one note edit = one byte, play returns patched IFF`, async () => {
      const { raw, song } = await loadIff(n);
      expect(song.format).toBe('MusicMaker');
      const names = song.instruments.map((i) => i.name);
      expect(names).toEqual(expect.arrayContaining(n.endsWith('.mm4') ? ['bass_0.1', '#bassdrum1', 'polysynth'] : ['House1', 'FLOETTE', 'Bongo']));
      let hit: [number, number, number] | null = null;
      song.patterns.forEach((pp, p) => pp.channels.forEach((c, v) => c.rows.forEach((cell, r) => { if (!hit && cell.note > 0 && cell.note < 90) hit = [p, v, r]; })));
      expect(hit).not.toBeNull();
      const exp = await exportNativeSong(song);
      expect(exp?.warnings ?? []).toEqual([]);
      expect(Array.from(exp!.data as Uint8Array)).toEqual(Array.from(raw));
      const [p, v, r] = hit!;
      const { setGridBaseline, baselineOf } = await import('@/lib/song/gridBaseline');
      setGridBaseline(baselineOf(song.patterns));
      song.patterns[p].channels[v].rows[r].note += 2;
      const res = await exportNativeSong(song);
      const out = res!.data as Uint8Array;
      expect(res!.warnings).toEqual([]);
      expect(out.length).toBe(raw.length);
      expect(out.reduce((c, x, i) => c + (x !== raw[i] ? 1 : 0), 0)).toBe(1);
      const { editedModuleForPlay } = await import('@engine/replayer/editedModuleForPlay');
      const { WASM_ENGINES } = await import('@engine/replayer/wasmEngineRegistry');
      const played = new Uint8Array((await editedModuleForPlay(song, WASM_ENGINES.find((d) => d.key === 'MusicMaker')!)) as ArrayBuffer);
      expect(Array.from(played)).toEqual(Array.from(out));
    });
  }
});
