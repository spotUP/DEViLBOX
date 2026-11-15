// Furnace effects on a real SNES song become TAD MML commands and the result still compiles.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { openTadSession, type CreateTadCompiler } from '../tadCompilerWasm';
import { writeTadSong, writeTadSfx, mergeTadSamples, TAD_SFX_FILE } from '../tadSongWriter';
import { tadProjectJson, tadInstrumentFromFurnace } from '../tadProjectBuilder';

const FILE = resolve(__dirname, '../../../../../public/data/songs/furnace/snes/tetristheme.fur');

describe('Furnace effects in the TAD writer', () => {
  it('maps vibrato, slides, arpeggio, echo, gain, volume slide and note cut/delay; check passes', async () => {
    const buf = readFileSync(FILE);
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const native = buildFurnaceNativeData(module);
    const sub = native.subsongs[0];
    // First SNES channel with at least 8 note rows in its first order: put one effect on each.
    const effects: [number, number][] = [[0x04, 0x47], [0x12, 1], [0x01, 0xff], [0x00, 0x37], [0x15, 0x01], [0x0a, 0x02], [0xed, 1], [0xec, 1]];
    let placed = 0;
    for (const ch of sub.channels) {
      const rows = ch.patterns.get(sub.orders[sub.channels.indexOf(ch)]?.[0] ?? -1)?.rows ?? [];
      const notes = rows.filter((r) => r.note >= 0 && r.note < 180);
      if (notes.length < effects.length) continue;
      notes.slice(0, effects.length).forEach((r, i) => { r.effects = [{ cmd: effects[i][0], val: effects[i][1] }]; });
      placed = effects.length;
      break;
    }
    expect(placed).toBe(effects.length);
    native.subsongs.push({ ...sub, name: 'sfx:fx', ordersLen: 1 });
    const input = {
      native, subsong: 0,
      instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)),
      samples: toSequencerSamples(module), wavetables: module.wavetables, title: 'fx',
    };
    const song = writeTadSong(input);
    const sfx = writeTadSfx({ ...input, subsong: native.subsongs.length - 1 });
    for (const re of [/MP\d+,\d+/, /\bE1\b/, /\bG[FDEIB]\d+|\bA \d/, /Vs[+-]\d+,\d+/]) {
      expect(song.mml, String(re)).toMatch(re);
    }
    expect(song.warnings.join('\n')).not.toMatch(/Dropped effect (04|12|01|15|0A|EC|ED)xx/);
    expect(sfx.mml).not.toMatch(/^[B-H] /m);

    const samples = mergeTadSamples([song.samples, sfx.samples]);
    const files: Record<string, Uint8Array | string> = {
      'p.terrificaudio': tadProjectJson([{ name: 'song', source: 'song.mml' }], samples, [sfx.name]),
      'song.mml': song.mml,
      [TAD_SFX_FILE]: sfx.mml,
    };
    for (const s of samples) files[s.path] = s.data;
    // @ts-expect-error generated JS module
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const tad = await openTadSession(files, create as CreateTadCompiler, (f) => resolve('public/tad', f));
    const r = tad.run(['check', '/p/p.terrificaudio']);
    expect(r.code, `${r.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);
});
