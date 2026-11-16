// Furnace effects on a real SNES song become TAD MML commands and the result still compiles.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { openTadSession, type CreateTadCompiler } from '../tadCompilerWasm';
import { writeTadSong, writeTadSfx, mergeTadSamples, TAD_SFX_FILE } from '../tadSongWriter';
import { tadProjectJson, tadInstrumentFromFurnace } from '../tadProjectBuilder';

const FILE = resolve(__dirname, '../../../../../public/data/songs/furnace/snes/tetristheme.fur');

// Puts one effect on each of the first note rows of the first SNES channel with enough notes, writes song + sfx and runs TAD check.
async function writeWithEffects(effects: [number, number][], skip = 0, editInstruments?: (ins: ReturnType<typeof tadInstrumentFromFurnace>[]) => void) {
  const buf = readFileSync(FILE);
  const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const native = buildFurnaceNativeData(module);
  const sub = native.subsongs[0];
  let placed = 0;
  for (const ch of sub.channels) {
    const rows = ch.patterns.get(sub.orders[sub.channels.indexOf(ch)]?.[0] ?? -1)?.rows ?? [];
    const notes = rows.filter((r) => r.note >= 0 && r.note < 180);
    if (notes.length < effects.length || skip-- > 0) continue;
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
  editInstruments?.(input.instruments);
  const song = writeTadSong(input);
  const sfx = writeTadSfx({ ...input, subsong: native.subsongs.length - 1 });
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
  const check = tad.run(['check', '/p/p.terrificaudio']);
  return { song, sfx, check };
}

describe('Furnace effects in the TAD writer', () => {
  it('maps vibrato, slides, arpeggio, echo, gain, volume slide and note cut/delay; check passes', async () => {
    const { song, sfx, check } = await writeWithEffects([[0x04, 0x47], [0x12, 1], [0x01, 0xff], [0x00, 0x37], [0x15, 0x01], [0x0a, 0x02], [0xed, 1], [0xec, 1]]);
    for (const re of [/MP\d+,\d+/, /\bE1\b/, /\bG[FDEIB]\d+|\bA \d/, /Vs[+-]\d+,\d+/]) {
      expect(song.mml, String(re)).toMatch(re);
    }
    expect(song.warnings.join('\n')).not.toMatch(/Dropped effect (04|12|01|15|0A|EC|ED)xx/);
    expect(sfx.mml).not.toMatch(/^[B-H] /m);
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);

  it('maps retrigger, delayed release, note slides and legato; check passes', async () => {
    const { song, check } = await writeWithEffects([[0xfc, 0x02], [0xe1, 0x83], [0xe2, 0x82], [0xea, 1], [0x00, 0x00], [0xea, 0], [0x0c, 0x02]]);
    expect(song.warnings.join('\n')).not.toMatch(/Dropped effect (0C|FC|E1|E2|EA)xx/);
    expect(song.mml).toMatch(/\{[^{}]+\}/); // E1/E2 slide token
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);

  it('plays multi-step volume macros as V changes inside the note; check passes', async () => {
    const { song, check } = await writeWithEffects([], 0, (ins) => ins.forEach((i) => { i.macros = [...(i.macros ?? []).filter((m) => m.code !== 0), { code: 0, data: [20, 60, 100, 127, 80], loop: 255, release: 255 }]; }));
    expect(song.warnings.join('\n')).not.toMatch(/volume macro/);
    expect(song.mml).toMatch(/V\d+ [a-g][+-]?%\d+ & V\d+ [a-g][+-]?%\d+ &/);
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);

  it('maps FDxx/FExx/F0xx tempo changes to T timer commands; check passes', async () => {
    const { song, check } = await writeWithEffects([[0xfd, 2], [0xfe, 2], [0xf0, 0x64]]);
    expect(song.warnings.join('\n')).not.toMatch(/Dropped effect (F0|FD|FE)xx/);
    expect(song.mml.match(/\bT\d+/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);

  it('maps 07xy tremolo to V~ and stops it on 0700; check passes', async () => {
    const { song, check } = await writeWithEffects([[0x07, 0x48], [0x00, 0x00], [0x07, 0x00]]);
    expect(song.warnings.join('\n')).not.toMatch(/Dropped effect 07xx/);
    expect(song.mml).toMatch(/V~\d+,8\b/);
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);

  it('maps 1Exx/1Fxx dry volume to \\mvol; check passes', async () => {
    const { song, check } = await writeWithEffects([[0x1e, 0x40], [0x1f, 0x40], [0x1e, 0xc0]]);
    expect(song.warnings.join('\n')).not.toMatch(/Dropped effect 1[EF]xx[^/]/); // the L/R mismatch warning on row 1 is expected
    expect(song.mml).toMatch(/\\mvol 64\b/);
    expect(song.mml).toMatch(/\\mvol 0\b/);
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);
});
