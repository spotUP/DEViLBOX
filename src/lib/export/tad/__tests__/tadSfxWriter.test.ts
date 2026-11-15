// A subsong named `sfx:<name>` becomes a TAD sound effect the vendored tad-compiler accepts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import type { FurnaceSNESConfig } from '@/types/instrument/furnace';
import { openTadSession, type CreateTadCompiler } from '../tadCompilerWasm';
import { writeTadSong, writeTadSfx, tadProjectJson, mergeTadSamples, tadSfxName, TAD_SFX_FILE } from '../tadSongWriter';

const FILE = resolve(__dirname, '../../../../../public/data/songs/furnace/snes/tetristheme.fur');

describe('writeTadSfx', () => {
  it('names only sfx: subsongs', () => {
    expect(tadSfxName('sfx: coin get')).toBe('coin_get');
    expect(tadSfxName('Main theme')).toBeNull();
    expect(tadSfxName('sfx:')).toBeNull();
  });

  it('one order of a real song compiles as a sound effect next to the song', async () => {
    const buf = readFileSync(FILE);
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const native = buildFurnaceNativeData(module);
    // The song's first order, marked as a sound effect.
    native.subsongs.push({ ...native.subsongs[0], name: 'sfx:coin', ordersLen: 1 });
    const input = {
      native,
      subsong: 0,
      instruments: module.instruments.map((i) => ({
        name: i.name,
        snes: i.snes as FurnaceSNESConfig | undefined,
        initSample: i.amiga?.initSample,
        useNoteMap: i.amiga?.useNoteMap,
        noteMap: i.amiga?.noteMap,
        useWave: i.amiga?.useWave,
        waveLen: i.amiga?.waveLen,
      })),
      samples: toSequencerSamples(module),
      wavetables: module.wavetables,
      title: 'tetris',
    };
    const song = writeTadSong(input);
    const sfx = writeTadSfx({ ...input, subsong: native.subsongs.length - 1 });
    expect(sfx.name).toBe('coin');
    expect(sfx.mml).toMatch(/^=== coin === mml\n/);
    expect(sfx.mml).not.toMatch(/^[B-H] /m);
    expect(sfx.warnings.some((w) => w.includes('one channel'))).toBe(true);

    const samples = mergeTadSamples([song.samples, sfx.samples]);
    const files: Record<string, Uint8Array | string> = {
      'p.terrificaudio': tadProjectJson('song', 'song.mml', samples, [sfx.name]),
      'song.mml': song.mml,
      [TAD_SFX_FILE]: sfx.mml,
    };
    for (const s of samples) files[s.path] = s.data;
    // @ts-expect-error generated JS module
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const tad = await openTadSession(files, create as CreateTadCompiler, (f) => resolve('public/tad', f));
    const r = tad.run(['check', '/p/p.terrificaudio']);
    console.log(`${sfx.mml}\n${sfx.warnings.join('\n')}\n${r.log}`);
    expect(r.code, r.log).toBe(0);
  }, 60000);
});
