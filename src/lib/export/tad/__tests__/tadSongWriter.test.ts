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
    const song = writeTadSong({
      native: buildFurnaceNativeData(module),
      subsong: 0,
      instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)),
      samples: toSequencerSamples(module),
      wavetables: module.wavetables,
      title: module.name || file,
    });
    expect(song.mml).toContain('#Timer');
    const files: Record<string, Uint8Array | string> = {
      'p.terrificaudio': tadProjectJson([{ name: 'song', source: 'song.mml' }], song.samples),
      'song.mml': song.mml,
    };
    for (const s of song.samples) files[s.path] = s.data;
    // @ts-expect-error generated JS module
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const tad = await openTadSession(files, create as CreateTadCompiler, (f) => resolve('public/tad', f));
    const r = tad.run(['check', '/p/p.terrificaudio']);
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
