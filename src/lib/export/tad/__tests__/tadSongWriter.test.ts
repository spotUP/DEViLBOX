// Every SNES .fur in the corpus becomes a TAD project that the vendored tad-compiler accepts.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { openTadSession, type CreateTadCompiler } from '../tadCompilerWasm';
import { writeTadSong, panSplit } from '../tadSongWriter';
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
  // Furnace sustain mode (snes.cpp:655-676): held notes decay at d2, note off keeps the key on and releases at r.
  it('holds sustain-mode instruments at d2 and releases them at r on note off', async () => {
    const buf = readFileSync(resolve(DIR, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const song = writeTadSong({ native: buildFurnaceNativeData(module), subsong: 0, instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables, title: 'tetristheme' });
    const lead = module.instruments.find((i) => i.name === 'Lead')?.snes;
    expect(lead?.sus).toBe(3);
    const { a, d, s, r, d2 } = lead!;
    expect(song.mml).toMatch(new RegExp(`^@\\d+ \\S+ adsr ${a} ${d} ${s} ${d2 ?? 0}$`, 'm'));
    expect(song.mml).toMatch(new RegExp(`& A ${a},${d},${s},${r} w%\\d+ r%2`));
    expect(song.warnings.some((w) => /sustain mode/.test(w))).toBe(false);
  }, 60000);

  // snes.cpp:115-117 outVol = vol * volMacro / 127: a constant volume macro scales V.
  it('scales V by a constant volume macro', async () => {
    const buf = readFileSync(resolve(DIR, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const song = writeTadSong({ native: buildFurnaceNativeData(module), subsong: 0, instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables, title: 'tetristheme' });
    const drums = module.instruments.find((i) => i.name === 'Drums')!;
    const level = drums.macros.find((m) => m.code === 0)!.data[0];
    expect(level).toBe(34);
    expect(song.mml).toContain(`V${Math.round(254 * level / 127)}`);
    expect(song.warnings.some((w) => /\(Drums\): .*volume/.test(w))).toBe(false);
  }, 60000);

  // snes.cpp:152-172: a constant special macro sets echo (bit 2) and pitch modulation (bit 4); no warning for it.
  it('carries constant special macros as echo and pitch modulation', async () => {
    let checked = 0;
    for (const file of FILES) {
      const buf = readFileSync(resolve(DIR, file));
      const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const carried = module.instruments.filter((i) => { const d = i.macros.find((m) => m.code === 5)?.data; return d?.length && Array.from(d).every((v) => v === d[0] && (v & 25) === 0); });
      if (!carried.length) continue;
      const song = writeTadSong({ native: buildFurnaceNativeData(module), subsong: 0, instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables, title: file });
      for (const i of carried) expect(song.warnings.some((w) => w.includes(`(${i.name}):`) && w.includes('special'))).toBe(false);
      checked += carried.length;
    }
    expect(checked).toBeGreaterThan(0);
  }, 120000);

  // snes.cpp:118-144: arp macro steps change the frequency each tick (no key-on); a constant pitch macro is a fixed offset.
  it('plays arp macro steps as slurred 1-tick notes and a constant pitch macro as MD', async () => {
    const buf = readFileSync(resolve(DIR, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const lead = module.instruments.find((i) => i.name === 'Lead')!;
    expect(Array.from(lead.macros.find((m) => m.code === 1)!.data)).toEqual([-1, 0]);
    const instruments = module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i));
    const tl = instruments[module.instruments.indexOf(lead)];
    tl.macros = [...(tl.macros ?? []), { code: 4, data: [2] }]; // the song has none: 2/128 semitone, about 2 cents
    const song = writeTadSong({ native: buildFurnaceNativeData(module), subsong: 0, instruments, samples: toSequencerSamples(module), wavetables: module.wavetables, title: 'tetristheme' });
    expect(song.mml).toMatch(/[a-g][+-]?%1 & /);
    expect(song.mml).toContain('MD+2');
    for (const n of ['Lead', 'Pad', 'Bass']) expect(song.warnings.some((w) => w.includes(`(${n}):`) && /arpeggio|pitch/.test(w))).toBe(false);
  }, 60000);

  // playback.cpp:1458 E5xx pitch = val - 0x80 in 1/128 semitone; TAD detune applies from the note it precedes.
  it('carries E5xx fine pitch as MD detune and 14xy as phase invert', async () => {
    const buf = readFileSync(resolve(DIR, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const native = buildFurnaceNativeData(module);
    const sub = native.subsongs[0];
    const row = sub.channels.flatMap((ch, c) => ch.patterns.get(sub.orders[c]?.[0] ?? -1)?.rows ?? []).find((r) => r.note >= 0 && r.note < 180)!;
    row.effects = [...(row.effects ?? []), { cmd: 0xe5, val: 0x90 }, { cmd: 0x14, val: 0x11 }]; // +16/128 semitone = 12.5 cents; invert both sides
    const song = writeTadSong({ native, subsong: 0, instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables, title: 'tetristheme' });
    expect(song.mml).toContain('MD+13');
    expect(song.mml).toMatch(/\biB\b/);
    expect(song.warnings.some((w) => /E5xx|effect e5/i.test(w))).toBe(false);
  }, 60000);

  // snes.cpp:495 11xx noise on, :541 1Dxx noise clock: TAD N<freq> plays noise in place of the note.
  it('plays notes under 11xx as TAD noise at the 1Dxx frequency', async () => {
    const buf = readFileSync(resolve(DIR, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const native = buildFurnaceNativeData(module);
    const sub = native.subsongs[0];
    const row = sub.channels.flatMap((ch, c) => ch.patterns.get(sub.orders[c]?.[0] ?? -1)?.rows ?? []).find((r) => r.note >= 0 && r.note < 180)!;
    row.effects = [...(row.effects ?? []), { cmd: 0x11, val: 1 }, { cmd: 0x1d, val: 0x0a }];
    const song = writeTadSong({ native, subsong: 0, instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables, title: 'tetristheme' });
    expect(song.mml).toMatch(/N10,%\d+/);
    expect(song.warnings.some((w) => /effect (11|1D)/i.test(w))).toBe(false);
    const files: Record<string, Uint8Array | string> = { 'p.terrificaudio': tadProjectJson([{ name: 'song', source: 'song.mml' }], song.samples), 'song.mml': song.mml };
    for (const s of song.samples) files[s.path] = s.data;
    // @ts-expect-error generated JS module
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const r = (await openTadSession(files, create as CreateTadCompiler, (f) => resolve('public/tad', f))).run(['check', '/p/p.terrificaudio']);
    expect(r.code, r.log).toBe(0);
  }, 60000);

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

// Furnace splits 08xy per nibble and 80xx linearly (centre = both sides full), then halves to 0-127.
describe('panSplit', () => {
  it('matches the Furnace SNES pan law', () => {
    expect(panSplit(0x80, 0x80)).toEqual([127, 127]);
    expect(panSplit(0x80, 0x00)).toEqual([127, 0]);
    expect(panSplit(0x80, 0xff)).toEqual([0, 127]);
    expect(panSplit(0x08, 0xf0)).toEqual([127, 0]);
    expect(panSplit(0x08, 0x0f)).toEqual([0, 127]);
    expect(panSplit(0x08, 0xff)).toEqual([127, 127]);
  });
});
