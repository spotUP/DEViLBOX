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
async function writeWithEffects(effects: [number, number][], skip = 0, editInstruments?: (ins: ReturnType<typeof tadInstrumentFromFurnace>[]) => void, file = FILE, note?: number, hz?: number) {
  const buf = readFileSync(file);
  const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const native = buildFurnaceNativeData(module);
  const sub = native.subsongs[0];
  if (hz !== undefined) sub.hz = hz;
  let placed = 0;
  for (const ch of sub.channels) {
    const rows = ch.patterns.get(sub.orders[sub.channels.indexOf(ch)]?.[0] ?? -1)?.rows ?? [];
    const notes = rows.filter((r) => r.note >= 0 && r.note < 180);
    if (notes.length < effects.length || skip-- > 0) continue;
    notes.slice(0, effects.length).forEach((r, i) => { r.effects = [{ cmd: effects[i][0], val: effects[i][1] }]; if (note !== undefined) r.note = note; });
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

  it('unrolls looping volume macros and releases them on E7xx; check passes', async () => {
    const setVol = (m: object) => (ins: { macros?: object[] }[]) => ins.forEach((i) => { i.macros = [...(i.macros ?? []).filter((x) => (x as { code?: number }).code !== 0), { code: 0, ...m }]; });
    const looped = await writeWithEffects([], 0, setVol({ data: [20, 100, 60], loop: 0, release: 255, speed: 8 }));
    expect(looped.song.warnings.join('\n')).not.toMatch(/volume macro/);
    const vs = (looped.song.mml.match(/V\d+(?= [a-g][+-]?%\d+ &)/g) ?? []);
    expect(vs.length).toBeGreaterThan(3); // the 3-step loop repeats over the note
    expect(looped.check.code, `${looped.check.log}\n${looped.song.mml.slice(0, 3000)}`).toBe(0);
    const released = await writeWithEffects([[0xe7, 2]], 0, setVol({ data: [20, 100, 60, 127], loop: 255, release: 1, speed: 8 }));
    expect(released.song.warnings.join('\n')).not.toMatch(/volume macro|Dropped effect E7/);
    expect(released.check.code, `${released.check.log}\n${released.song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);

  it('carries pitch, panning, gain, fixed-note arp and noise frequency macros per tick; check passes', async () => {
    type Ins = ReturnType<typeof tadInstrumentFromFurnace>;
    const setM = (m: NonNullable<Ins['macros']>) => (ins: Ins[]) => ins.forEach((i) => { const codes = m.map((x) => x.code); i.macros = [...(i.macros ?? []).filter((x) => !codes.includes(x.code)), ...m]; if (i.snes) i.snes.useEnv = false; });
    const run = async (m: NonNullable<Ins['macros']>, fx: [number, number][] = []) => {
      const r = await writeWithEffects(fx, 0, setM(m));
      expect(r.song.warnings.join('\n')).not.toMatch(/pitch macro|panning|noise frequency|fixed notes/);
      expect(r.check.code, `${r.check.log}\n${r.song.mml.slice(0, 3000)}`).toBe(0);
      return r.song.mml;
    };
    expect(await run([{ code: 4, data: [0, 64, 128, 64], loop: 0, speed: 6 }])).toMatch(/MD\+\d+/);
    expect(await run([{ code: 4, data: [8], mode: 1, speed: 4 }])).toMatch(/MD\+\d+/); // relative: sums on every write
    expect(await run([{ code: 12, data: [127, 40], loop: 0, speed: 8 }, { code: 13, data: [20, 127], loop: 0, speed: 8 }])).toMatch(/\bp\d+/);
    expect(await run([{ code: 1, data: [0x40000000 | 60, 0x40000000 | 64, 0], speed: 4 }])).toMatch(/%\d+ &/); // fixed notes
    expect(await run([{ code: 2, data: [3, 20, 9], loop: 0, speed: 4 }], [[0x11, 1]])).toMatch(/N3,%\d+ &/);
  }, 120000);

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

  it('carries 18xx echo enable, delay, feedback, FIR and volume from the pattern; check passes', async () => {
    const { song, check } = await writeWithEffects([], 0, undefined, resolve(__dirname, '../../../../../public/data/songs/furnace/snes/Sadness.fur'));
    expect(song.mml).toMatch(/#EchoVolume 0 0/);
    expect(song.mml).toMatch(/\\fir \{/);
    expect(song.mml).toMatch(/\\evol \d+,\d+/);
    expect(song.warnings.join('\n')).not.toMatch(/Dropped effect 1[89ABC]xx/);
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);

  it('maps 84xy panbrello to p~ and stops it on 8400; check passes', async () => {
    const { song, check } = await writeWithEffects([[0x84, 0x4f], [0x00, 0x00], [0x84, 0x00]]);
    expect(song.warnings.join('\n')).not.toMatch(/Dropped effect 84xx/);
    expect(song.mml).toMatch(/p64 p~64,16\b/);
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);

  it('warns when a note is outside the TAD range (note 179)', async () => {
    const { song } = await writeWithEffects([[0x00, 0x00]], 0, undefined, FILE, 179);
    expect(song.warnings.join('\n')).toMatch(/Dropped notes outside/);
  }, 60000);

  it('warns when a pitch slide needs a portamento velocity above 255', async () => {
    const { song } = await writeWithEffects([[0x01, 0xff], [0x01, 0xff], [0x01, 0xff], [0x01, 0xff]]);
    expect(song.warnings.join('\n')).toMatch(/pitch slide over \d+ ticks dropped/);
  }, 60000);

  it('scales vibrato and tremolo speeds by the tick multiplier when the tick rate is lowered', async () => {
    const fast = await writeWithEffects([[0x04, 0x47], [0x07, 0x47]], 0, undefined, FILE, undefined, 60);
    const slow = await writeWithEffects([[0x04, 0x47], [0x07, 0x47]], 0, undefined, FILE, undefined, 15); // k = 3
    const num = (mml: string, re: RegExp) => Number(mml.match(re)?.[1]);
    expect(num(slow.song.mml, /MP\d+,(\d+)/)).toBe(num(fast.song.mml, /MP\d+,(\d+)/) * 3);
    expect(num(slow.song.mml, /V~\d+,(\d+)/)).toBe(num(fast.song.mml, /V~\d+,(\d+)/) * 3);
  }, 60000);

  it('defines instruments @0.. in the order the MML first uses them', async () => {
    const { song } = await writeWithEffects([[0x00, 0x00]]);
    const defs = [...song.mml.matchAll(/^@(\d+) /gm)].map((m) => Number(m[1]));
    expect(defs.length).toBeGreaterThan(0);
    expect(defs).toEqual(defs.map((_, i) => i));
    const firstUse = [...song.mml.matchAll(/^[A-H] .*?@(\d+)/gm)].map((m) => Number(m[1]));
    const seen: number[] = [];
    for (const id of firstUse) if (!seen.includes(id)) seen.push(id);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  }, 60000);

  it('names E6xy delayed legato as a drop', async () => {
    const { song } = await writeWithEffects([[0xe6, 0x13]]);
    expect(song.warnings.join('\n')).toMatch(/E6xy delayed legato/);
  }, 60000);

  it('maps a constant special macro (both sides inverted) to iB; check passes', async () => {
    const { song, check } = await writeWithEffects([], 0, (ins) => ins.forEach((i) => { i.macros = [...(i.macros ?? []).filter((m) => m.code !== 5), { code: 5, data: [24], loop: 255, release: 255 }]; }));
    expect(song.mml).toMatch(/\biB\b/);
    expect(song.warnings.join('\n')).not.toMatch(/[Ss]pecial macro dropped/);
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);

  it('starts the sustain release on FCxx for a sustain-mode instrument; check passes', async () => {
    const { song, check } = await writeWithEffects([[0xfc, 0x02]], 0, (ins) => ins.forEach((i) => { if (i.snes) i.snes = { ...i.snes, sus: 1, useEnv: true, r: 5 }; }));
    expect(song.mml).toMatch(/GDT5/);
    expect(check.code, `${check.log}\n${song.mml.slice(0, 3000)}`).toBe(0);
  }, 60000);
});
