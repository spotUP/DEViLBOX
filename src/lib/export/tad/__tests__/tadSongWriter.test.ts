// Every SNES .fur in the corpus becomes a TAD project that the vendored tad-compiler accepts.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { parseFurnaceSong, toSequencerSamples, buildFurnaceNativeData } from '@/lib/import/formats/FurnaceSongParser';
import { openTadSession, type CreateTadCompiler } from '../tadCompilerWasm';
import { writeTadSong, panSplit, stepCompileState, initialCompileState } from '../tadSongWriter';
import { tadProjectJson, tadInstrumentFromFurnace } from '../tadProjectBuilder';

const DIR = resolve(__dirname, '../../../../../public/data/songs/furnace/snes');
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.fur')).sort();

// Songs the driver cannot hold: the compiler's own size errors, not writer faults.
const TOO_LARGE: Record<string, RegExp> = {
  // Still 920 bytes over after repeats became subroutines: the rest is distinct per-tick macro commands.
  '64kb.fur': /goto_relative offset out of bounds|Song is too large by \d+ bytes/,
  // Still 9616 bytes over after repeats became subroutines: few patterns repeat and macros unroll per tick.
  'Breezy.fur': /Song is too large by \d+ bytes/,
  // 12 BRR samples, 62946 bytes, all played, none duplicated, each ends at its loop end with no silent tail:
  // over the 60568 bytes left for samples beside the driver. Fits only by resampling (changes the sound).
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

  // playback.cpp:1554-1605: FAxy is 4x 0Axy, F3/F4 are 1/64 of 0Axy, F8/F9 change the volume once.
  it('carries FAxy, F3xx/F4xx and F8xx/F9xx volume effects', async () => {
    const buf = readFileSync(resolve(DIR, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const native = buildFurnaceNativeData(module);
    const sub = native.subsongs[0];
    const rows = sub.channels.flatMap((ch, c) => ch.patterns.get(sub.orders[c]?.[0] ?? -1)?.rows ?? []).filter((r) => r.note >= 0 && r.note < 180);
    rows[0].effects = [...(rows[0].effects ?? []), { cmd: 0xfa, val: 0x02 }];
    rows[1].effects = [...(rows[1].effects ?? []), { cmd: 0xf3, val: 0x40 }];
    rows[2].effects = [...(rows[2].effects ?? []), { cmd: 0xf9, val: 0x10 }];
    const song = writeTadSong({ native, subsong: 0, instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables, title: 'tetristheme' });
    expect(song.mml).toMatch(/Vs-\d+,\d+/);
    expect(song.warnings.some((w) => /effect F[A3489]xx/i.test(w))).toBe(false);
  }, 60000);

  it('plays the 10xx wave on later wavetable notes of the channel', async () => {
    const buf = readFileSync(resolve(DIR, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const native = buildFurnaceNativeData(module);
    const sub = native.subsongs[0];
    // Bass is a 16-sample wavetable instrument without a wave macro, so it starts on wave 0.
    const bass = module.instruments.findIndex((i) => i.name === 'Bass');
    const row = sub.channels.flatMap((ch, c) => ch.patterns.get(sub.orders[c]?.[0] ?? -1)?.rows ?? []).find((r) => r.ins === bass && r.note >= 0 && r.note < 180);
    row!.effects = [...(row!.effects ?? []), { cmd: 0x10, val: 1 }];
    const song = writeTadSong({ native, subsong: 0, instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables, title: 'tetristheme' });
    expect(song.mml).toMatch(/^@\d+ w16_1 /m);
    expect(song.warnings.some((w) => /effect 10xx/i.test(w))).toBe(false);
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

  it('scales voice volume by the volScaleL/R chip flags', async () => {
    const buf = readFileSync(resolve(DIR, 'tetristheme.fur'));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const native = buildFurnaceNativeData(module);
    const input = { native, subsong: 0, instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)), samples: toSequencerSamples(module), wavetables: module.wavetables, title: 't' };
    // Distinct V values; V254 also opens every channel line as the start default, so it stays in the scaled set unchanged.
    const vs = (mml: string) => new Set([...mml.matchAll(/\bV(\d+)/g)].map((m) => Number(m[1])));
    const full = vs(writeTadSong(input).mml);
    native.chipFlags![native.chipIds.indexOf(26)] = 'volScaleL=63\nvolScaleR=63';
    const half = writeTadSong(input);
    const got = [...vs(half.mml)].filter((v) => v !== 254).sort((x, y) => x - y);
    expect(got).toEqual([...new Set([...full].map((v) => Math.round(v * 64 / 127)))].sort((x, y) => x - y));
    expect(half.warnings.join('\n')).not.toMatch(/Chip volume differs/);
  }, 60000);
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

  // Subroutines and loops must not change what plays: expand every call and loop and check each runtime command
  // appears in the same order with the same compile-time state (octave, MP, MD) as in the inline form. A subroutine
  // starts with fresh compile-time state and a call leaves the caller's unchanged (mml-syntax.md:169-178).
  it.each(['tetristheme.fur', 'Sadness.fur', 'Sunken Lights.fur', 'Breezy.fur'])('%s: subroutine form plays the inline commands', async (file) => {
    const buf = readFileSync(resolve(DIR, file));
    const module = await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const input = {
      native: buildFurnaceNativeData(module), subsong: 0, title: file,
      instruments: module.instruments.map((i) => tadInstrumentFromFurnace(i.name, i)),
      samples: toSequencerSamples(module), wavetables: module.wavetables,
    };
    const expand = (mml: string) => {
      const lines = new Map<string, string[]>();
      for (const l of mml.split('\n')) {
        const m = /^(!\w+|[A-H]) (.*)$/.exec(l);
        if (m) lines.set(m[1], [...(lines.get(m[1]) ?? []), ...m[2].replace(/\[(!\w+) \](\d+)/g, '[$1]$2').split(' ')]);
      }
      const run = (toks: string[], res: string[]) => {
        const st = initialCompileState();
        for (const t of toks) {
          const call = /^\[?(!\w+)\]?(\d*)$/.exec(t);
          if (call && lines.has(call[1])) { for (let i = 0; i < Number(call[2] || 1); i++) run(lines.get(call[1])!, res); continue; }
          const before = `${st.o}|${st.mp}|${st.md}`;
          stepCompileState(st, t);
          if (/^(o\d|\?@\d+|MP|MD)/.test(t)) continue; // compile-time only: seen through the state of later commands
          res.push(`${t} ${before}`);
        }
        return res;
      };
      return [...lines].filter(([k]) => !k.startsWith('!')).map(([k, toks]) => `${k}\n${run(toks, []).join('\n')}`);
    };
    const inline = writeTadSong({ ...input, inline: true }).mml;
    const factored = writeTadSong(input).mml;
    expect(factored).toMatch(/^!s0 /m);
    expect(factored.length).toBeLessThan(inline.length);
    expect(expand(factored)).toEqual(expand(inline));
  }, 60000);
});
