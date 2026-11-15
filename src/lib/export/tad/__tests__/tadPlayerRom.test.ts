import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import JSZip from 'jszip';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { buildTadProject, tadInstrumentFromFurnace } from '../tadProjectBuilder';
import type { CreateTadCompiler } from '../tadCompilerWasm';
import type { TadPlayerRomMeta } from '../tadPlayerRom';

const SONGS = resolve(__dirname, '../../../../../public/data/songs/furnace/snes');

describe('player.sfc', () => {
  it('holds the compiler output with a valid header checksum', async () => {
    const buf = readFileSync(resolve(SONGS, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const file = {
      title: module.name || 'tetristheme', native: buildFurnaceNativeData(module),
      instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)),
      samples: toSequencerSamples(module), wavetables: module.wavetables,
    };
    // @ts-expect-error generated JS module
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const asset = async (f: string) => new Uint8Array(readFileSync(resolve('public/tad', f)));
    const r = await buildTadProject([file], create as CreateTadCompiler, (f) => resolve('public/tad', f), asset);
    expect(r.ok, r.warnings.join('\n')).toBe(true);
    const zip = await JSZip.loadAsync(r.zip);
    const rom = await zip.file('build/player.sfc')!.async('uint8array');
    const bin = await zip.file('build/ca65_lorom/ca65_lorom_audio.bin')!.async('uint8array');
    const meta = JSON.parse(readFileSync('public/tad/player-lorom.json', 'utf8')) as TadPlayerRomMeta;
    expect(rom.length).toBe(262144);
    expect(Array.from(rom.subarray(meta.dataOffset, meta.dataOffset + bin.length))).toEqual(Array.from(bin));
    const h = meta.headerOffset + 0x2c;
    const stored = rom[h + 2] | (rom[h + 3] << 8), comp = rom[h] | (rom[h + 1] << 8);
    let sum = 0;
    for (let i = 0; i < rom.length; i++) sum += rom[i];
    expect(sum & 0xffff).toBe(stored); // checksum bytes are stored, complement bytes added: sum of all = checksum + complement + the rest
    expect(comp).toBe(stored ^ 0xffff);
  }, 120000);
});
