// Two corpus files plus one with an added `sfx:` subsong -> one project zip the compiler accepts.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import JSZip from 'jszip';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { buildTadProject, tadInstrumentFromFurnace, type TadBuildFile } from '../tadProjectBuilder';
import type { CreateTadCompiler } from '../tadCompilerWasm';

const DIR = resolve(__dirname, '../../../../../public/data/songs/furnace/snes');

async function load(file: string, sfx = false): Promise<TadBuildFile> {
  const buf = readFileSync(resolve(DIR, file));
  const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const native = buildFurnaceNativeData(module);
  if (sfx) native.subsongs.push({ ...native.subsongs[0], name: 'sfx:coin', ordersLen: 1 }, { ...native.subsongs[0], name: 'sfx:empty', ordersLen: 1, channels: native.subsongs[0].channels.map((c) => ({ ...c, patterns: new Map() })) });
  return {
    title: module.name || file.replace(/\.fur$/, ''),
    native,
    instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)),
    samples: toSequencerSamples(module),
    wavetables: module.wavetables,
  };
}

describe('buildTadProject', () => {
  it('bundles two songs and a sound effect', async () => {
    const other = readdirSync(DIR).find((f) => f.endsWith('.fur') && f !== 'tetristheme.fur' && f !== 'Dear Blue SNES.fur' && f !== 'XCHQ_SPC700.fur')!;
    const set = [await load('tetristheme.fur', true), await load(other)];
    // @ts-expect-error generated JS module
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const r = await buildTadProject(set, create as CreateTadCompiler, (f) => resolve('public/tad', f));
    console.log(r.warnings.join('\n'));
    expect(r.ok, r.warnings.join('\n')).toBe(true);
    expect(r.soundEffects).toEqual(['coin']); // sfx:empty has no notes: left out with a warning, not a failed compile
    expect(r.warnings.some((w) => w.startsWith('empty: '))).toBe(true);
    expect(r.songs.length).toBeGreaterThanOrEqual(2);
    const zip = await JSZip.loadAsync(r.zip);
    const names = Object.keys(zip.files);
    for (const want of ['project/project.terrificaudio', 'project/sound-effects.txt', 'README.txt', 'build/ca65_lorom/ca65_lorom_audio.asm', 'build/pvsneslib_hirom/pvsneslib_hirom_audio.bin']) expect(names).toContain(want);
    const spcs = names.filter((n) => n.endsWith('.spc'));
    expect(spcs.length).toBe(r.songs.length);
    for (const n of spcs) expect((await zip.file(n)!.async('uint8array')).length).toBeGreaterThan(0);
    expect(r.ram?.common).toBeGreaterThan(0);
  }, 120000);
});
