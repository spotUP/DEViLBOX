// Every SNES .fur in the corpus becomes a TAD project that the vendored tad-compiler accepts.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import type { FurnaceSNESConfig } from '@/types/instrument/furnace';
import { openTadSession, type CreateTadCompiler } from '../tadCompilerWasm';
import { writeTadSong, tadProjectJson } from '../tadSongWriter';

const DIR = resolve(__dirname, '../../../../../public/data/songs/furnace/snes');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.fur')).sort();

describe('writeTadSong', () => {
  it.each(FILES)('%s passes tad-compiler check', async (file) => {
    const buf = readFileSync(resolve(DIR, file));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const song = writeTadSong({
      native: buildFurnaceNativeData(module),
      subsong: 0,
      instruments: module.instruments.map((i) => ({
        name: i.name,
        snes: i.snes as FurnaceSNESConfig | undefined,
        initSample: i.amiga?.initSample,
        useNoteMap: i.amiga?.useNoteMap,
        noteMap: i.amiga?.noteMap,
        useWave: i.amiga?.useWave,
        waveLen: i.amiga?.waveLen,
        hasMacros: i.macros.some((m) => m.length > 0),
      })),
      samples: toSequencerSamples(module),
      wavetables: module.wavetables,
      title: module.name || file,
    });
    expect(song.mml).toContain('#Timer');
    const files: Record<string, Uint8Array | string> = {
      'p.terrificaudio': tadProjectJson('song', 'song.mml', song.samples),
      'song.mml': song.mml,
    };
    for (const s of song.samples) files[s.path] = s.data;
    // @ts-expect-error generated JS module
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const tad = await openTadSession(files, create as CreateTadCompiler, (f) => resolve('public/tad', f));
    const r = tad.run(['check', '/p/p.terrificaudio']);
    console.log(`[${file}] code ${r.code}\n${song.warnings.join('\n')}\n${r.log}`);
    expect(r.code, r.log).toBe(0);
  }, 60000);
});
