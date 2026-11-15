// Every SNES .fur in the corpus becomes a TAD project that the vendored tad-compiler accepts.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { openTadSession, type CreateTadCompiler } from '../tadCompilerWasm';
import { writeTadSong } from '../tadSongWriter';
import { tadProjectJson, tadInstrumentFromFurnace } from '../tadProjectBuilder';

const DIR = resolve(__dirname, '../../../../../public/data/songs/furnace/snes');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.fur')).sort();

// Songs the driver cannot hold: the compiler's own size errors, not writer faults.
const TOO_LARGE: Record<string, RegExp> = {
  '64kb.fur': /goto_relative offset out of bounds \(bytecode is too large\)/,
  'Breezy.fur': /Song is too large by \d+ bytes/,
  'Cosmic_Warehouse.fur': /Song is too large by \d+ bytes/,
  'sound processing unit.fur': /Song is too large by \d+ bytes/,
  'spd10.fur': /Song is too large by \d+ bytes/,
  'changeyourheart.fur': /common audio data is too large/,
};

describe('writeTadSong', () => {
  it.each(FILES)('%s passes tad-compiler check', async (file) => {
    const buf = readFileSync(resolve(DIR, file));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const native = buildFurnaceNativeData(module);
    // Echo takes Audio-RAM: lower the delay (as buildTadProject does) until the compiler accepts the song.
    // @ts-expect-error generated JS module
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    let r = { code: 1, log: '' }, song = writeTadSong({ native, subsong: 0, instruments: [], samples: [], title: file });
    for (let cap = 15; cap >= 0; cap--) {
      song = writeTadSong({
        native,
        subsong: 0,
        instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)),
        samples: toSequencerSamples(module),
        wavetables: module.wavetables,
        title: module.name || file,
        echoDelayCap: cap,
      });
      expect(song.mml).toContain('#Timer');
      const files: Record<string, Uint8Array | string> = {
        'p.terrificaudio': tadProjectJson([{ name: 'song', source: 'song.mml' }], song.samples),
        'song.mml': song.mml,
      };
      for (const s of song.samples) files[s.path] = s.data;
      const tad = await openTadSession(files, create as CreateTadCompiler, (f) => resolve('public/tad', f));
      r = tad.run(['check', '/p/p.terrificaudio']);
      if (r.code === 0 || TOO_LARGE[file] || !/too large by/.test(r.log)) break;
    }
    console.log(`[${file}] code ${r.code}\n${song.warnings.join('\n')}\n${r.log}`);
    if (TOO_LARGE[file]) {
      expect(r.code).not.toBe(0);
      expect(r.log).toMatch(TOO_LARGE[file]);
      return;
    }
    expect(r.code, r.log).toBe(0);
  }, 60000);

  // Native rows count C-0 = 0; the writer adds the engine offset (60) before the note map, so the
  // octave must come out unshifted (it once landed five octaves low).
  it('keeps the octave of the first tetristheme note', async () => {
    const buf = readFileSync(resolve(DIR, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const native = buildFurnaceNativeData(module);
    const sub = native.subsongs[0];
    let first = -1;
    for (const ch of sub.channels) {
      const rows = ch.patterns.get(sub.orders[sub.channels.indexOf(ch)]?.[0] ?? -1)?.rows ?? [];
      const n = rows.find((r) => r.note >= 0 && r.note < 180)?.note;
      if (n !== undefined) { first = n; break; }
    }
    expect(first).toBeGreaterThanOrEqual(0);
    const song = writeTadSong({
      native, subsong: 0,
      instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)),
      samples: toSequencerSamples(module), wavetables: module.wavetables, title: 'tetris',
    });
    expect(song.mml).toContain(`o${Math.floor(first / 12)}`);
    const dropped = song.warnings.filter((w) => w.startsWith('Dropped notes outside'));
    console.log(`[tetristheme] first native note ${first}; ${dropped.join(' | ')}`);
  });
});

describe('writeTadSong echo header', () => {
  it('writes the Furnace echo flags as TAD header lines', async () => {
    const lines: Record<string, string> = {};
    for (const file of FILES) {
      const buf = readFileSync(resolve(DIR, file));
      const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const native = buildFurnaceNativeData(module);
      const flags = native.chipFlags?.[native.chipIds.indexOf(26)] ?? '';
      if (!/^echo=true$/m.test(flags)) continue;
      const song = writeTadSong({ native, subsong: 0, instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables, title: file });
      lines[file] = `${flags.replace(/\n/g, ' ')} => ${song.mml.split('\n').filter((l) => l.startsWith('#Echo') || l.startsWith('#Fir')).join(' | ')}`;
    }
    console.log(JSON.stringify(lines, null, 1));
    expect(Object.keys(lines).length).toBeGreaterThan(0);
    for (const l of Object.values(lines)) expect(l).toMatch(/#EchoLength \d+ \| .*#FirFilter (-?\d+ ){7}-?\d+ \| #EchoFeedback -?\d+ \| #EchoVolume \d+ \d+/);
  }, 120000);
});
