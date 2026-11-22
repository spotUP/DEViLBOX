// FamiStudio route: envelope encoder (port of FamitoneMusicFile.cs ProcessEnvelope), ROM patching, player staleness.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import { MESEN } from './nesMesenHarness';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
import { buildFamistudioRom, compressRefs, expandRefs, famistudioText, encodeEnvelope, expandProcMacro, furnaceToFamistudio, loopPeriodicTail, mergeVibratoPitch, noiseNote, type FamistudioMeta, bestSlideStep, tickAtFrame } from '../nes/famistudioSong';

const ROOT = path.resolve(__dirname, '../../../..');
const DIR = path.join(ROOT, 'public/nes/famistudio');
const META: FamistudioMeta = JSON.parse(readFileSync(path.join(DIR, 'player.json'), 'utf8'));

describe('famistudio envelope encoder', () => {
  it('writes the single-value default forms', () => {
    expect(encodeEnvelope([15], -1, -1, 'vol')).toEqual([0x00, 192 + 15, 0x7f, 0x00, 0x02]);
    expect(encodeEnvelope([0], -1, -1, 'arp')).toEqual([192, 0x7f, 0x00, 0x00]);
  });
  it('run-length encodes repeats and ends on the loop pointer', () => {
    const d = encodeEnvelope([15, 15, 15, 15, 8], -1, -1, 'vol');
    expect(d[0]).toBe(0x00);
    expect(d).toContain(192 + 15);
    expect(d).toContain(192 + 8);
    expect(d[d.length - 2]).toBe(0x00);
    expect(d.length).toBeLessThan(1 + 5 + 2);
  });
});

describe('famistudio ROM', () => {
  it('patches music and DPCM at the player addresses and refuses oversize data', () => {
    const player = readFileSync(path.join(DIR, 'player.nes'));
    const song = { music: new Uint8Array([1, 2, 3]), dpcm: new Uint8Array([9]), lossy: [], pitchLossy: [], channelsWithNotes: [], firstNotes: [], firstNoteFrames: [], sizes: { header: 0, samples: 0, envelopes: 0, streams: [] } };
    const rom = buildFamistudioRom(player, META, song);
    expect(rom.length).toBe(player.length);
    expect([...rom.subarray(META.prgOffset + META.musicAddr - 0x8000, META.prgOffset + META.musicAddr - 0x8000 + 3)]).toEqual([1, 2, 3]);
    expect(rom[META.prgOffset + META.dpcmAddr - 0x8000]).toBe(9);
    expect(() => buildFamistudioRom(player, META, { ...song, music: new Uint8Array(META.musicCap + 1) })).toThrow();
  });
  it('writes title and author, uppercased and space padded, at the player.json slots', () => {
    const player = readFileSync(path.join(DIR, 'player.nes'));
    const song = { music: new Uint8Array([1]), dpcm: new Uint8Array([1]), lossy: [], pitchLossy: [], channelsWithNotes: [], firstNotes: [], firstNoteFrames: [], sizes: { header: 0, samples: 0, envelopes: 0, streams: [] } };
    const rom = buildFamistudioRom(player, META, song, { title: 'Sky Sanctuary', author: 'x'.repeat(40) });
    const at = (a: number) => [...rom.subarray(META.prgOffset + a - 0x8000, META.prgOffset + a - 0x8000 + META.textLen)];
    expect(at(META.titleAddr)).toEqual([...famistudioText('SKY SANCTUARY', 32)]);
    expect(String.fromCharCode(...at(META.authorAddr))).toBe('X'.repeat(32));
    expect(rom[META.prgOffset + META.titleAddr - 0x8000 + 13]).toBe(0x20);
  });
  it.each([['', 'fs.cfg'], ['vrc6', 'fs.cfg'], ['fme7', 'fs-fme7.cfg']])('player%s.nes is built from the current sources (run tools/build-nes-famistudio-player.sh)', (v, cfg) => {
    const h = createHash('sha1');
    for (const f of [path.join(DIR, 'player.s'), path.join(DIR, cfg), path.join(ROOT, 'third-party/famistudio/famistudio_ca65.s'), path.join(ROOT, 'public/nes/screen.chr')]) h.update(readFileSync(f));
    const hex = h.digest('hex');
    const meta: FamistudioMeta = JSON.parse(readFileSync(path.join(DIR, v ? `player-${v}.json` : 'player.json'), 'utf8'));
    expect(v ? createHash('sha1').update(hex + v).digest('hex') : hex).toBe(meta.sourceHash);
  });
  it('moves 2A03 music past 16 KiB to the FME-7 player: 24 KiB at $6000, file offset 16 + address (Future_Re-ference.fur)', async () => {
    const buf = readFileSync(path.join(ROOT, 'public/data/songs/furnace/nes/Future_Re-ference.fur'));
    const song = furnaceToFamistudio(await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer));
    const meta: FamistudioMeta = JSON.parse(readFileSync(path.join(DIR, 'player-fme7.json'), 'utf8'));
    expect(song.fme7).toBe(true);
    expect(song.music.length).toBeGreaterThan(META.musicCap);
    expect(song.lossy.some((l) => l.includes('dropped to fit'))).toBe(false);
    expect(song.music[1] | (song.music[2] << 8)).toBeGreaterThanOrEqual(0x6000); // song header pointers assembled for $6000
    expect(() => buildFamistudioRom(readFileSync(path.join(DIR, 'player.nes')), META, song)).toThrow();
    const player = readFileSync(path.join(DIR, 'player-fme7.nes'));
    const rom = buildFamistudioRom(player, meta, song);
    expect([rom[6] >> 4 | (rom[7] & 0xf0), rom[4]]).toEqual([69, 4]);
    expect([...rom.subarray(16 + 0x6000, 16 + 0x6000 + song.music.length)]).toEqual([...song.music]);
    expect(rom[meta.prgOffset + 0x7ffc] | (rom[meta.prgOffset + 0x7ffd] << 8)).toBeGreaterThanOrEqual(0xe000); // reset vector in the fixed bank
  });
});

type Cell = { note: number; octave: number; instrument: number; volume: number; effects: Array<{ type: number; value: number }> };
const empty = (): Cell => ({ note: 0, octave: 0, instrument: -1, volume: -1, effects: [] });

/** One-order NES module, 16 rows; `cells[ch][row]` overrides empty cells. */
function nesModule(cells: Record<number, Record<number, Partial<Cell>>>, subsong: Record<string, number | number[][]> = {}): FurnaceModule {
  const patterns = new Map<string, { rows: Cell[] }>();
  for (let ch = 0; ch < 5; ch++) patterns.set(`0_${ch}_0`, { rows: Array.from({ length: 16 }, (_, r) => ({ ...empty(), ...cells[ch]?.[r] })) });
  return {
    systems: [6],
    subsongs: [{ speed1: 6, speed2: 6, hz: 60, patLen: 16, ordersLen: 1, orders: [[0], [0], [0], [0], [0]], ...subsong }],
    patterns,
    instruments: [],
    samples: [],
  } as unknown as FurnaceModule;
}

const has = (bytes: Uint8Array, seq: number[]): boolean => {
  for (let i = 0; i + seq.length <= bytes.length; i++) if (seq.every((b, j) => bytes[i + j] === b)) return true;
  return false;
};

describe('furnaceToFamistudio', () => {
  it('maps noise notes to the period index Furnace writes (nes.cpp noiseTable / properNoiseLayout)', () => {
    // FamiStudio noise period index = 15 - (note & 15).
    const period = (n: number): number => 15 - (n & 15);
    expect(period(noiseNote(9, true))).toBe(15 - 9);
    expect(period(noiseNote(9, false))).toBe(6); // noiseTable[9]
    expect(period(noiseNote(12, false))).toBe(15); // noiseTable[12]
    expect(period(noiseNote(39, false))).toBe(0); // noiseTable[39] (third row: 3, 2, 1, 0, ...)
    expect(period(noiseNote(100, false))).toBe(15); // past the table rows: all 15
  });

  it('keeps a pulse note below A-1; the rewritten ROM note table saturates it at 2047 like Furnace', () => {
    // nv 7 maps to FamiStudio note 8 (G-1); retuneNoteTable writes min(0x7ff, period) for every entry.
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 7, octave: 0 } } }));
    expect(has(song.music, [0x40, 8])).toBe(true);
    expect(song.lossy.some((l) => l.startsWith('note below A-1'))).toBe(false);
  });

  it('keeps A-1 and higher notes unchanged', () => {
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 9, octave: 0 } } }));
    expect(has(song.music, [0x40, 10])).toBe(true);
    expect(song.lossy.some((l) => l.startsWith('note below A-1'))).toBe(false);
  });

  it('plays Furnace note value nv as FamiStudio note nv + 1 (nv 45 sounds 440 Hz in furnace -vgmout)', () => {
    // nv 45 = note 9 octave 3 here; FamiStudio note 46 is A-4, 440 Hz, on pulse and (an octave down) on triangle.
    // Notes 13..75 encode as one byte n - 12, so note 46 is byte 34 right after the instrument byte.
    expect(has(furnaceToFamistudio(nesModule({ 0: { 0: { note: 9, octave: 3 } } })).music, [0x80, 34])).toBe(true);
    expect(has(furnaceToFamistudio(nesModule({ 2: { 0: { note: 9, octave: 3 } } })).music, [0x80, 34])).toBe(true);
  });

  it('reports the frame of each channel first note, after a speed change', () => {
    // Row 0 sets speed 3 (from 6): row 4 starts at frame 12 on any channel.
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 0, octave: 4, effects: [{ type: 0x0f, value: 3 }] } }, 1: { 4: { note: 0, octave: 4 } } }));
    expect(song.firstNoteFrames.slice(0, 3)).toEqual([0, 12, -1]);
  });

  it('09 00 selects groove 0 when the song has grooves (playback.cpp 0x09), and 0Fxx then sets its first entry', () => {
    // Future_Re-ference: grooves [2,1] and [6], row 0 has 09 00 -> rows last 2,1,2,1 ticks, so row 4 starts at frame 6.
    const m = nesModule({ 0: { 0: { note: 0, octave: 4, effects: [{ type: 0x09, value: 0 }] } }, 1: { 4: { note: 0, octave: 4 } }, 2: { 6: { note: 0, octave: 4, effects: [{ type: 0x0f, value: 3 }] } }, 3: { 8: { note: 0, octave: 4 } } });
    m.grooves = [{ len: 2, val: [2, 1, ...Array(14).fill(0)] }, { len: 1, val: [6, ...Array(15).fill(0)] }];
    // Row 6 (frame 9) sets entry 0 to 3: rows 6,7 last 3,1 ticks, row 8 starts at frame 13.
    expect(furnaceToFamistudio(m).firstNoteFrames.slice(0, 4)).toEqual([0, 6, 9, 13]);
  });

  it('plays a [2,1] groove with one speed op at tempo x2, not one op per row (Future_Re-ference FME-7 size)', () => {
    const cells = { 0: { 0: { note: 0, octave: 4, effects: [{ type: 0x09, value: 0 }] } }, 1: { 4: { note: 0, octave: 4 } } };
    const m = nesModule(cells);
    m.grooves = [{ len: 2, val: [2, 1, ...Array(14).fill(0)] }];
    const groove = furnaceToFamistudio(m);
    // Same rows at plain speed 3 carry a single speed op, so the groove stream must not be longer.
    const plain = furnaceToFamistudio(nesModule({ 0: { 0: { note: 0, octave: 4, effects: [{ type: 0x0f, value: 3 }] } }, 1: { 4: { note: 0, octave: 4 } } }));
    expect(groove.sizes.streams[0]).toBeLessThanOrEqual(plain.sizes.streams[0]);
    expect(groove.firstNoteFrames.slice(0, 2)).toEqual([0, 6]);
  });

  it('applies flow and speed effects from a dropped expansion channel (one_sided_love 0B21 in channel 7)', () => {
    // Channel 5 belongs to a dropped expansion chip; its 0F03 at row 0 and 0D00 at row 2 still act on the 2A03 channels.
    const m = nesModule({}, { ordersLen: 2, orders: [[0, 0], [0, 1], [0, 0], [0, 0], [0, 0], [0, 0]] });
    Object.assign(m, { systems: [6, 139] });
    const pats = m.patterns as unknown as Map<string, { rows: Cell[] }>;
    pats.set('0_1_1', { rows: Array.from({ length: 16 }, (_, r) => ({ ...empty(), ...(r === 0 ? { note: 0, octave: 4 } : {}) })) });
    pats.set('0_5_0', { rows: Array.from({ length: 16 }, (_, r) => ({ ...empty(), effects: r === 0 ? [{ type: 0x0f, value: 3 }] : r === 2 ? [{ type: 0x0d, value: 0 }, { type: 0xfd, value: 100 }] : [] })) });
    const song = furnaceToFamistudio(m);
    // Order 0 ends after row 2 at speed 3: order 1 row 0 starts at frame 9 (16 rows x speed 6 = 96 if channel 5 were ignored).
    expect(song.firstNoteFrames[1]).toBe(9);
    expect(song.lossy.some((l) => l.startsWith('virtual tempo change FDxx'))).toBe(true);
  });

  it('virtual tempo scales row timing but not effect ticks', () => {
    // Virtual tempo 150/100: rows advance 1.5 per tick, so speed 6 rows last 4 frames and row 4 starts at frame 16.
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 0, octave: 4 } }, 1: { 4: { note: 0, octave: 4 } } }, { virtualTempo: 150, virtualTempoD: 100 }));
    expect(song.firstNoteFrames.slice(0, 2)).toEqual([0, 16]);
  });

  it('puts every row of a fractional virtual tempo on the Furnace frame: whole tempo step, start accumulator (Byte-Sized Bop 155/112)', () => {
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 0, octave: 4 } } }, { virtualTempo: 155, virtualTempoD: 112 }));
    const step = song.music[7 + 5 * 2] | (song.music[8 + 5 * 2] << 8);
    expect(step).toBe(2480); // 256 x 150 x 155 / 112 / 150 x q 7: whole, so no drift
    const q = (0x600 + step - (song.tempoAcc ?? 0)) / 256;
    expect(q).toBe(7);
    // Engine: row n fires on the first frame k with k x step >= 256 (6 q n + q) - step; Furnace: first k with 155 (k + 1) >= 112 (6 n + 1).
    for (let n = 1; n < 3000; n++) {
      expect(Math.max(0, Math.ceil((256 * (6 * q * n + q) - step) / step))).toBe(Math.ceil(112 * (6 * n + 1) / 155) - 1);
    }
  });

  it('fires each row of a 56 Hz song on the nearest 60 Hz frame, not the next one (Famitune1)', () => {
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { note: 0, octave: 4 } } }, { hz: 56 }));
    const step = song.music[7 + 5 * 2] | (song.music[8 + 5 * 2] << 8);
    expect(step).toBe(3584); // 256 x 140 / 150 x q 15: whole
    const h = (song.tempoAcc ?? 0) - 0x600, S = 6 * 15;
    // Engine: row n fires on the first frame k with 0x600 + h + k x step >= 0x600 + 256 S n; Furnace row n at 56 Hz tick
    // 6n is 60 Hz frame 6n x 60 / 56, which the check bins to the nearest frame (half up).
    for (let n = 0; n < 3000; n++) expect(Math.max(0, Math.ceil((256 * S * n - h) / step))).toBe(Math.floor(6 * n * 60 / 56 + 0.5));
  });

  it('steps macros on the Furnace tick each 60 Hz frame shows (Famitune1 56 Hz arp one frame late)', () => {
    // The check bins a tick at VGM sample floor(j x 44100 / hz) into frame round(sample / 735).
    for (const hz of [10, 50, 56, 128]) {
      const frameOf = (j: number): number => Math.floor(Math.floor((j * 44100) / hz) / 735 + 0.5);
      let j = 0;
      for (let f = 0; f < 3000; f++) {
        while (frameOf(j + 1) <= f) j++;
        expect([hz, f, tickAtFrame(f, hz / 60)]).toEqual([hz, f, j]);
      }
    }
  });

  it('ends a one-shot macro on its last tick when a frame holds several ticks (samurai 128 Hz noise kick stuck at volume 2)', () => {
    // Rate 128/60: frame 0 shows tick 1 (8), frame 1 would show tick 3, past the end; Furnace holds the last value 0 there.
    const m = nesModule({ 0: { 0: { note: 9, octave: 4, instrument: 0 } } }, { hz: 128 });
    const vol = { code: 0, type: 0, mode: 0, speed: 1, delay: 0, length: 3, loop: 255, release: 255, data: [15, 8, 0] };
    Object.assign(m, { instruments: [{ type: 34, macros: [vol], amiga: { initSample: 0 } }] });
    expect(has(furnaceToFamistudio(m).music, encodeEnvelope([8, 0], -1, -1, 'vol'))).toBe(true);
  });
  const A4 = { note: 9, octave: 4 };
  const fx =(type: number, value: number) => ({ effects: [{ type, value }] });
  const music = (cells: Record<number, Record<number, Partial<Cell>>>) => furnaceToFamistudio(nesModule(cells));

  it('maps 04 vibrato to a pitch envelope override and stops it with 0x4a', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x04, 0x44) }, 8: fx(0x04, 0) } });
    expect(song.music.includes(0x49)).toBe(true);
    expect(song.music.includes(0x4a)).toBe(true);
    expect(song.lossy.some((l) => l.startsWith('effect 04'))).toBe(false);
  });
  it('plays an effect with no value byte (-1) as xx = 00: a bare 04 does not advance the vibrato phase of the later 0488 (The East triangle)', () => {
    const bare = music({ 0: { 0: { ...A4, ...fx(0x04, -1) }, 12: fx(0x04, 0x88) } });
    const zero = music({ 0: { 0: { ...A4, ...fx(0x04, 0) }, 12: fx(0x04, 0x88) } });
    expect(Array.from(bare.music)).toEqual(Array.from(zero.music));
  });
  it('takes vibrato period offsets against the song tuning the note table is retuned to (one_sided_love, A-4 = 445)', () => {
    // Furnace 0.6.8.3 calcFreq (linear pitch): round(clock / fbase / 16) - 1, vibrato pitch = ((y * (short)(127 sin) * 15) >> 4) / 15.
    // Cell A-4 plays FamiStudio note 58 (an octave above table index 46).
    const vib = (a4: number): number[] => Array.from({ length: 32 }, (_, i) => {
      const X = 1789772.727 / (16 * a4 * 2), P = Math.round(X) - 1;
      const u = Math.trunc(((3 * Math.trunc(127 * Math.sin(2 * Math.PI * ((6 * (i + 1)) & 63) / 64)) * 15) >> 4) / 15);
      return Math.round(X * 2 ** (-u / 1536)) - 1 - P;
    });
    expect(vib(445)).not.toEqual(vib(440)); // the tuning moves the rounding at this note
    const mod = nesModule({ 0: { 0: { ...A4, ...fx(0x04, 0x63) } } });
    (mod as { tuning?: number }).tuning = 445;
    const music = furnaceToFamistudio(mod).music;
    expect(has(music, encodeEnvelope(vib(445), 0, -1, 'pitch'))).toBe(true);
    expect(has(music, encodeEnvelope(vib(440), 0, -1, 'pitch'))).toBe(false);
  });
  it('rounds fine pitch and vibrato together as Furnace does, minus the sent fine offset (one_sided_love pulse1, E57D + 0463)', () => {
    // Furnace sums chan.pitch (E5xx - 0x80) and the vibrato in 1/128 semitone and rounds once; the engine adds the 0x4e fine
    // offset F to every vibrato step, so each step is round(X * 2^(-(u + fp) / 1536)) - 1 - P - F.
    const vib = (fp: number): number[] => Array.from({ length: 32 }, (_, i) => {
      const X = 1789772.727 / (16 * 445 * 2), P = Math.round(X) - 1, F = Math.round(X * 2 ** (-fp / 1536)) - 1 - P;
      const u = Math.trunc(((3 * Math.trunc(127 * Math.sin(2 * Math.PI * ((6 * (i + 1)) & 63) / 64)) * 15) >> 4) / 15);
      return Math.round(X * 2 ** (-(u + fp) / 1536)) - 1 - P - F;
    });
    expect(vib(-3)).not.toEqual(vib(0)); // rounding fine and vibrato apart is 1 off at this note
    const mod = nesModule({ 0: { 0: { ...A4, effects: [{ type: 0xe5, value: 0x7d }, { type: 0x04, value: 0x63 }] } } });
    (mod as { tuning?: number }).tuning = 445;
    const music = furnaceToFamistudio(mod).music;
    expect(has(music, encodeEnvelope(vib(-3), 0, -1, 'pitch'))).toBe(true);
    expect(has(music, encodeEnvelope(vib(0), 0, -1, 'pitch'))).toBe(false);
  });
  it('plays the loop target with the E5 fine pitch left at the song end (Furnace keeps chan.pitch across the loop; Sky Sanctuary triangle)', () => {
    const mod = nesModule({ 0: { 0: A4, 8: { ...A4, effects: [{ type: 0xe5, value: 0x90 }] } } });
    const song = furnaceToFamistudio(mod);
    const st = song.sizes.header + song.sizes.samples + song.sizes.envelopes;
    const p1 = song.music.slice(st, st + song.sizes.streams[0]);
    // Row 8 sends fine 0x4e ff; the loop pass sends it again on row 0, where a single pass replays row 0 without it.
    expect([...p1].filter((b, i) => b === 0x4e && p1[i + 1] === 0xff).length).toBe(2);
  });
  it('rounds fine pitch and an absolute pitch macro together as Furnace does, minus the sent fine offset (E57D + pitch macro)', () => {
    // Furnace sums chan.pitch (E5xx - 0x80) and pitch2 (the macro) in 1/128 semitone and rounds once; the engine adds the 0x4e
    // fine offset F to the envelope, so each value is round(X * 2^(-(v + fp) / 1536)) - 1 - P - F, not round(P * (2^(-v/1536) - 1)).
    const data = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72];
    const X = 1789772.727 / (16 * 445 * 2), P = Math.round(X) - 1, fp = -3, F = Math.round(X * 2 ** (-fp / 1536)) - 1 - P;
    const together = data.map((v) => Math.round(X * 2 ** (-(v + fp) / 1536)) - 1 - P - F);
    const apart = data.map((v) => Math.round(P * (2 ** (-v / 1536) - 1)));
    expect(together).not.toEqual(apart); // rounding fine and macro apart is 1 off at this note
    const mod = nesModule({ 0: { 0: { ...A4, instrument: 0, effects: [{ type: 0xe5, value: 0x7d }] } } });
    const pm = { code: 4, type: 0, mode: 0, speed: 1, delay: 0, length: data.length, loop: 255, release: 255, data };
    Object.assign(mod, { tuning: 445, instruments: [{ type: 34, macros: [pm], amiga: { initSample: 0 } }] });
    const music = furnaceToFamistudio(mod).music;
    expect(has(music, encodeEnvelope(together, -1, -1, 'pitch'))).toBe(true);
    expect(has(music, encodeEnvelope(apart, -1, -1, 'pitch'))).toBe(false);
  });
  it('rounds fine pitch and a relative pitch macro running sum together as Furnace does (E57D + relative pitch macro)', () => {
    // Furnace keeps the relative macro's running sum in pitch2 and rounds fine + sum once: each step is off(sum) - off(previous
    // sum), off(s) = round(X * 2^(-(s + fp) / 1536)) - 1 - P - F, not each increment rounded at the note period.
    const data = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    const X = 1789772.727 / (16 * 445 * 2), P = Math.round(X) - 1, fp = -3, F = Math.round(X * 2 ** (-fp / 1536)) - 1 - P;
    const off = (s: number): number => Math.round(X * 2 ** (-(s + fp) / 1536)) - 1 - P - F;
    const together = data.map((_, i) => off(5 * (i + 1)) - off(5 * i));
    const apart = data.map((v) => Math.round(P * (2 ** (-v / 1536) - 1)));
    expect(together).not.toEqual(apart); // rounding each increment apart drifts from the rounded sum
    const mod = nesModule({ 0: { 0: { ...A4, instrument: 0, effects: [{ type: 0xe5, value: 0x7d }] } } });
    const pm = { code: 4, type: 0, mode: 1, speed: 1, delay: 0, length: data.length, loop: 255, release: 255, data };
    Object.assign(mod, { tuning: 445, instruments: [{ type: 34, macros: [pm], amiga: { initSample: 0 } }] });
    const music = furnaceToFamistudio(mod).music;
    expect(has(music, encodeEnvelope(together, -1, -1, 'pitch', true))).toBe(true);
    expect(has(music, encodeEnvelope(apart, -1, -1, 'pitch', true))).toBe(false);
  });
  it('keeps the vibrato phase on a 03xx porta note (Furnace clears doNote on a keyed-on channel; one_sided_love frame 3730)', () => {
    // playback.cpp: 03xx with keyOn sets doNote=false, so "commit note on" (vibratoPos=0) is skipped. 4 rows x 6 ticks of 04:63
    // leave vibratoPos at 6 * 24 & 63 = 16; the override sent on the porta row starts there, not at 0.
    const vib = (pos: number): number[] => Array.from({ length: 32 }, (_, i) => {
      const X = 1789772.727 / (16 * 440 * 2), P = Math.round(X) - 1;
      const u = Math.trunc(((3 * Math.trunc(127 * Math.sin(2 * Math.PI * ((pos + 6 * (i + 1)) & 63) / 64)) * 15) >> 4) / 15);
      return Math.round(X * 2 ** (-u / 1536)) - 1 - P;
    });
    const music = furnaceToFamistudio(nesModule({ 0: { 0: { ...A4, ...fx(0x04, 0x63) }, 4: { ...A4, ...fx(0x03, 0x10) } } })).music;
    expect(has(music, encodeEnvelope(vib(16), 0, -1, 'pitch'))).toBe(true);
  });
  it('adds 04 vibrato to the instrument pitch macro in one relative envelope (Furnace sums pitch and pitch2)', () => {
    const notes: string[] = [];
    const vib = [0, 5, 0, -5];
    const mg = mergeVibratoPitch(vib, { vals: [0, 20, 40], loop: -1, relative: false }, { add: (s) => notes.push(s) });
    const sums = mg.deltas.map((_, i) => mg.deltas.slice(0, i + 1).reduce((a, b) => a + b, 0));
    expect(sums).toEqual([0, 25, 40, 35, 40, 45, 40]); // macro holds 40 after its end, vibrato keeps going
    expect(mg.loop).toBe(3);
    expect(mg.deltas.slice(3).reduce((a, b) => a + b, 0)).toBe(0); // the looped part does not drift
    expect(mergeVibratoPitch(vib, { vals: [100], loop: -1, relative: false }, { add: (s) => notes.push(s) }).deltas[0]).toBe(63);
    expect(notes.some((n) => n.includes('clamped'))).toBe(true);
  });
  it('loops the repeating tail of an LFO pitch delta list instead of storing every cycle', () => {
    const cycle = [1, 0, -1, -1, 0, 1];
    const d = [3, -3, ...Array.from({ length: 40 }, (_, i) => cycle[i % 6])];
    const lt = loopPeriodicTail(d);
    expect(lt.deltas.length).toBeLessThan(10);
    const replay = Array.from({ length: d.length }, (_, i) => (i < lt.deltas.length ? lt.deltas[i] : lt.deltas[lt.loop + ((i - lt.loop) % (lt.deltas.length - lt.loop))]));
    expect(replay).toEqual(d);
    expect(loopPeriodicTail([1, 2, 3, 4, 5, 6]).loop).toBe(-1); // no repeat: unchanged
    expect(loopPeriodicTail([1, 0, 1, 0, 1, 0]).loop).toBe(-1); // drifting cycle (sum != 0): unchanged
  });
  it('fits infinity.fur in the 16 KiB music area without dropping cuts or held slides', async () => {
    const buf = readFileSync(path.join(ROOT, 'public/data/songs/furnace/nes/infinity.fur'));
    const song = furnaceToFamistudio(await parseFurnaceSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer));
    expect(song.music.length).toBeLessThanOrEqual(META.musicCap);
    expect(song.lossy.some((l) => l.includes('dropped to fit'))).toBe(false);
  });
  it('maps 00 arpeggio to an arp envelope override and stops it with 0x4c', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x00, 0x37) }, 8: fx(0x00, 0) } });
    expect(song.music.includes(0x4b)).toBe(true);
    expect(song.music.includes(0x4c)).toBe(true);
  });
  it('drops a running 00 arpeggio at the first note after a note off (Furnace keyOffAffectsArp on NES; christmas-fever pulse 2)', () => {
    const OFF = { note: 180, octave: 0 };
    const kept = music({ 0: { 0: { ...A4, ...fx(0x00, 0x38) }, 4: OFF, 8: { ...A4, ...fx(0x00, 0x38) } } });
    expect(kept.music.includes(0x4c)).toBe(false);
    const dropped = music({ 0: { 0: { ...A4, ...fx(0x00, 0x38) }, 4: OFF, 8: A4 } });
    expect(dropped.music.includes(0x4c)).toBe(true);
  });
  it('maps 03 portamento to a slide that replaces the note byte (0x43 then 0x50 step from to)', () => {
    const song = music({ 0: { 0: A4, 4: { note: 9, octave: 5, ...fx(0x03, 0x20) } } });
    expect(song.music.includes(0x50)).toBe(true);
    expect(song.music.includes(0x43)).toBe(true);
  });
  it('picks the 03 slide step that follows the Furnace per-tick curve, not round(average)', () => {
    // one_sided_love triangle frame 115 (030D, A-4 = 445, periods 140 -> 132): Furnace 137,134,132; step 7 gave 136,133,132.
    const raw = (n: number): number => 1789773 / (16 * 445 * 2 ** ((n - 46) / 12));
    const [step, err] = bestSlideStep({ rawFrom: raw(56), fromPeriod: 140, toPeriod: 132, unitsPerTick: 13 * 4, totalUnits: 128, dirUp: true, furPitch: 0, fsOffset: 0, frames: 12, perTick: 1, guess: 6.5 });
    expect([step, err]).toEqual([-6, 0]);
    const curve = [1, 2, 3].map((f) => 132 + Math.floor(Math.max(0, 16 + f * step) / 2));
    expect(curve).toEqual([137, 134, 132]);
  });
  it('maps 01 slide up to a 0x50 slide toward the note it reaches', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x01, 0x20) }, 8: { note: 9, octave: 5 } } });
    expect(song.music.includes(0x50)).toBe(true);
  });
  it('keeps a 02 slide on later notes until 0200 (Furnace portaSpeed is channel state)', () => {
    // Rise_against triangle kick: one 02xx, then bare notes that each slide down in Furnace.
    const song = music({ 2: { 0: { ...A4, ...fx(0x02, 0x44) }, 4: A4, 8: { ...A4, ...fx(0x02, 0x00) }, 12: A4 } });
    const slidesFromA4 = [...song.music].filter((b, i) => b === 0x50 && song.music[i + 2] === 58).length;
    expect(slidesFromA4).toBe(2);
  });
  it('ends a held 02 slide at the limitSlides floor (getPortaFloor 60 = FamiStudio note 1), not at note 0', () => {
    // oby1_ingame triangle: a 02xx that reaches the floor resets (targetResetsSlides), so later notes play unslid.
    const cells = { 2: { 0: { ...A4, ...fx(0x02, 0x70) }, 4: A4 } };
    const count = (limitSlides: boolean): number => { const s = furnaceToFamistudio({ ...nesModule(cells), compatFlags: { limitSlides, pitchSlideSpeed: 4, linearPitch: 2 } } as unknown as FurnaceModule); return [...s.music].filter((b, i) => b === 0x50 && s.music[i + 2] === 58).length; };
    expect([count(false), count(true)]).toEqual([2, 1]);
  });
  it('maps E1 note slide up to a 0x50 slide', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0xe1, 0x47) } } });
    expect(song.music.includes(0x50)).toBe(true);
  });
  it('maps 0A volume slide to 0x51 step target', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x0a, 0x10) } } });
    const at = [...song.music].indexOf(0x51);
    expect(at).toBeGreaterThan(-1);
    expect(song.music[at + 1]).toBeGreaterThan(0);
    expect(song.music[at + 2]).toBe(240);
  });
  it('re-sends a running 0Axy after a volume set only until Furnace stops it past the maximum (playback.cpp; going_up pulse 2)', () => {
    // 0A10 from v0 climbs 1/4 per tick (1 frame per tick here) and passes 15 after 64 ticks: row 10 of speed 6.
    const slides = (row: number): number => {
      const b = [...music({ 0: { 0: { ...A4, volume: 0, ...fx(0x0a, 0x10) }, [row]: { ...A4, volume: 4 } } }).music];
      return b.filter((x, i) => x === 0x51 && b[i + 1] === 4 && b[i + 2] === 240).length;
    };
    expect(slides(2)).toBe(2);
    expect(slides(12)).toBe(1);
  });
  it('slides the channel volume instead of baking it into a volume macro while 0Axy runs (sweatsmile noise order 4)', () => {
    // Furnace keeps 0A20 sliding the channel volume under the macro after the row-4 volume set; a baked envelope would hold it at 8.
    const m = nesModule({ 3: { 0: { ...A4, instrument: 0, volume: 0, ...fx(0x0a, 0x20) }, 4: { ...A4, instrument: 0, volume: 8 } } });
    const vol = { code: 0, type: 0, mode: 0, speed: 1, delay: 0, length: 2, loop: 255, release: 255, data: [15, 6] };
    Object.assign(m, { instruments: [{ type: 34, macros: [vol], amiga: { initSample: 0 } }] });
    const song = furnaceToFamistudio(m);
    expect(has(song.music, [0x78, 0x51, 8, 240])).toBe(true);
    // 0A20 passes 15 after row 4 (Furnace stops it), so both passes enter the loop target without a slide.
    expect(song.lossy.some((l) => l.startsWith('volume slide 0Axy'))).toBe(false);
  });
  it('sends a volume op for a volume-only row after a baked note (one_sided_love pulse 2 tick 1210)', () => {
    // Baked: v4 x macro [13] -> envelope 3. Row 8 v3: Furnace plays floor(3 * 13 / 15) = 2, so c = 10 (floor(10 * 3 / 15) = 2).
    const m = nesModule({ 0: { 0: { ...A4, instrument: 0, volume: 4 }, 8: { volume: 3 }, 12: { ...A4 } } });
    const vol = { code: 0, type: 0, mode: 0, speed: 1, delay: 0, length: 1, loop: 255, release: 255, data: [13] };
    Object.assign(m, { instruments: [{ type: 34, macros: [vol], amiga: { initSample: 0 } }] });
    const song = furnaceToFamistudio(m), b = [...song.music], at = b.indexOf(0x7a);
    expect(at).toBeGreaterThan(-1);
    expect(b.indexOf(0x7f, at)).toBeGreaterThan(at); // the row-12 note is baked again and sends 15
    expect(song.lossy.some((l) => l.includes('baked volume macro'))).toBe(false);
  });
  it('picks the volume-only row level over the frames a running baked macro still plays (Future_Re-ference pulse 2)', () => {
    // Speed 1, v8 x decay [15 12 9 6 3 0]; row 2 v4 lands on macro frame 2. Matching only the last value (0) sent c = 0
    // (silence); over [9 6 3 0] Furnace plays 2 1 0 0 and c = 8 gives floor(8 * [4 3 1 0] / 15) = 2 1 0 0.
    const m = nesModule({ 0: { 0: { ...A4, instrument: 0, volume: 8 }, 2: { volume: 4 }, 12: { ...A4 } } }, { speed1: 1, speed2: 1 });
    const vol = { code: 0, type: 0, mode: 0, speed: 1, delay: 0, length: 6, loop: 255, release: 255, data: [15, 12, 9, 6, 3, 0] };
    Object.assign(m, { instruments: [{ type: 34, macros: [vol], amiga: { initSample: 0 } }] });
    const b = [...furnaceToFamistudio(m).music];
    expect(b.indexOf(0x78)).toBeGreaterThan(-1);
    expect(b.indexOf(0x70)).toBe(-1);
  });
  it('holds a baked volume macro at its release step for a volume-only row past it (Future_Re-ference pulse 1 row 4)', () => {
    // Speed 1, v10 x [15 12 11 10 | 1 3 2] release 3: Furnace holds 10 until note release, so row 6 v6 plays floor(6 * 10 / 15) = 4.
    // The envelope holds 10 x 10 / 15 = 6 there; c = 10 gives floor(10 * 6 / 15) = 4. Slicing at frame 6 matched the tail value 2 and sent c = 0.
    const m = nesModule({ 0: { 0: { ...A4, instrument: 0, volume: 10 }, 6: { volume: 6 }, 12: { ...A4 } } }, { speed1: 1, speed2: 1 });
    const vol = { code: 0, type: 0, mode: 0, speed: 1, delay: 0, length: 7, loop: 255, release: 3, data: [15, 12, 11, 10, 1, 3, 2] };
    Object.assign(m, { instruments: [{ type: 34, macros: [vol], amiga: { initSample: 0 } }] });
    const b = [...furnaceToFamistudio(m).music];
    expect(b.indexOf(0x7a)).toBeGreaterThan(-1);
    expect(b.indexOf(0x70)).toBe(-1);
    expect(b.indexOf(0x78)).toBe(-1);
  });
  it('labels a 0Axy still running at the song end as lossy: the loop pass replays bytes written for no slide', () => {
    // Speed 1: 0A10 from v0 reaches only 4 by the end, so the loop target is entered with the slide on the second pass only.
    const song = furnaceToFamistudio(nesModule({ 0: { 0: { ...A4, volume: 0, ...fx(0x0a, 0x10) } } }, { speed1: 1, speed2: 1 }));
    expect(song.lossy.some((l) => l.startsWith('volume slide 0Axy running on one pass'))).toBe(true);
  });
  it('maps ED note delay to 0x47 with ticks*frames-1', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0xed, 0x03) } } });
    const at = [...song.music].indexOf(0x47);
    expect(at).toBeGreaterThan(-1);
    expect(song.music[at + 1]).toBe(2); // 3 ticks of 1 frame - 1 (hz 60, speed 6 -> 1 frame per tick)
  });
  it('maps a 1-frame ED note delay to 0x47 0 (the driver plays n + 1 frames after the row)', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0xed, 0x01) } } });
    const at = [...song.music].indexOf(0x47);
    expect(at).toBeGreaterThan(-1);
    expect(song.music[at + 1]).toBe(0);
    expect(song.lossy.some((l) => l.startsWith('note delay'))).toBe(false);
  });
  it('maps EC note cut to 0x48', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0xec, 0x03) } } });
    expect(has(song.music, [0x48, 3])).toBe(true);
  });
  it('maps E5 fine pitch to 0x4e', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0xe5, 0xa0) } } });
    expect(song.music.includes(0x4e)).toBe(true);
    expect(song.lossy.some((l) => l.startsWith('effect E5'))).toBe(false);
  });
  it('sends E5 fine pitch as the period Furnace calcFreq rounds (linear: 1/128 semitone, round(raw period) - 1)', () => {
    // A4 cell = FamiStudio note 58: raw period 127.12, table 126; E5A0 = +32/128 semitone -> round(127.12 * 2^(-32/1536)) - 1 = 124 -> offset -2.
    expect(has(music({ 0: { 0: { ...A4, ...fx(0xe5, 0xa0) } } }).music, [0x4e, 0xfe])).toBe(true);
  });

  it('sends the loop target row effects even when they match the first-pass state (the loop enters with the end-of-song state)', () => {
    // Order 0 is the loop target: 0400 at its row 0 must stop a vibrato left running at the song end (Sky Sanctuary pulse1).
    const out = music({ 0: { 0: { ...A4, ...fx(0x04, 0x00) }, 4: { ...A4, ...fx(0x04, 0x31) } } }).music;
    expect(has(out, [0x4a])).toBe(true);
  });
  it('sends the instrument again at the loop target (the loop enters with the end-of-song instrument)', () => {
    // Fur_Nes noise: 0B04 loops to a kick that follows a kick on the first pass, but follows the open hi-hat at the song end.
    // Noise arp macros go out as 0x4b overrides, which (unlike 0x4a / 0x4c) do not force the instrument byte.
    const m = nesModule({ 3: { 0: { ...A4, instrument: 0 } } }, { ordersLen: 2, orders: [[0, 0], [0, 0], [0, 0], [0, 1], [0, 0]] });
    (m.patterns as unknown as Map<string, { rows: Cell[] }>).set('0_3_1', { rows: Array.from({ length: 16 }, (_, r) => ({ ...empty(), ...(r === 0 ? { ...A4, instrument: 0 } : r === 8 ? { ...A4, instrument: 1 } : r === 15 ? fx(0x0b, 1) : {}) })) });
    const arp = { code: 1, type: 0, mode: 0, speed: 1, delay: 0, length: 1, loop: 255, release: 255, data: [0] };
    Object.assign(m, { instruments: [0, 1].map(() => ({ type: 34, macros: [arp], amiga: { initSample: 0 } })) });
    const song = furnaceToFamistudio(m);
    const start = song.sizes.header + song.sizes.samples + song.sizes.envelopes + song.sizes.streams.slice(0, 3).reduce((x, y) => x + y, 0);
    const st = song.music.slice(start, start + song.sizes.streams[3]);
    let i = st[st.length - 2] + 256 * st[st.length - 1] - 0x8000 - start; // trailing 0x42 jump to the loop target
    if (st[i] === 0x41) i = st[i + 2] + 256 * st[i + 3] - 0x8000 - start; // the loop row is a reference to an earlier chunk
    if (st[i] === 0x4b) i += 3; // arp override sent again at the loop
    expect(st[i] >= 0x80 && (st[i] & 1) === 0).toBe(true); // instrument change byte (famistudio_ca65.s @instrument_change)
  });
  it('gives each start phase of a 50 Hz macro its own instrument copy, and shares copies whose frames match', () => {
    // 50 Hz, speed 6, 15 rows (108 frames: the loop pass keeps the phase): rows start at 0, 7.2, 14.4, 21.6, 28.8 frames. Duty [0,1,2,3] per tick shows [0,1,2,2,3],
    // [0,1,1,2,3], [0,0,1,2,3], [0,1,2,3], [0,1,2,3,3]: tick 0 covers two frames when the note starts 0.4 frame late.
    const ins = (rows: number[], duty: number[]): number => {
      const m = nesModule({ 0: Object.fromEntries(rows.map((r) => [r, { ...A4, instrument: 0 }])) }, { hz: 50, patLen: 15 });
      Object.assign(m, { instruments: [{ type: 34, macros: [{ code: 2, type: 0, mode: 0, speed: 1, delay: 0, length: duty.length, loop: 255, release: 255, data: duty }], amiga: { initSample: 0 } }] });
      return furnaceToFamistudio(m).sizes.header;
    };
    expect(ins([0, 1, 2, 3, 4], [0, 1, 2, 3]) - ins([0], [0, 1, 2, 3])).toBe(3 * 8); // [0,1,2,3] and [0,1,2,3,3] hold the same last value: one copy
    expect(ins([0, 5], [0, 1, 2, 3]) - ins([0], [0, 1, 2, 3])).toBe(0); // row 5 = 36 frames: phase 0 again
    expect(ins([0, 1, 2, 3, 4], [2, 2]) - ins([0], [2, 2])).toBe(0); // a flat macro looks the same at every phase
    expect(tickAtFrame(1, 50 / 60, 0.4)).toBe(0);
  });
  it('reports a dpcmMode=false song sample note as PCM played as DPCM until an NES-type note switches Furnace to DPCM', () => {
    const pcmLossy = (insType: number): boolean => {
      const m = nesModule({ 4: { 0: { note: 1, octave: 4, instrument: 0 } } });
      Object.assign(m, { chipFlags: ['clockSel=0\ndpcmMode=false\n'], instruments: [{ type: insType, macros: [], amiga: { initSample: 0 } }], samples: [{ depth: 8, data: new Int8Array(64), length: 64, c4Rate: 8000, loop: false }] });
      return furnaceToFamistudio(m).lossy.some((l) => l.startsWith('DPCM channel in Furnace PCM mode'));
    };
    expect(pcmLossy(4)).toBe(true); // Amiga sample instrument: nes.cpp streams it through $4011
    expect(pcmLossy(34)).toBe(false); // NES instrument: nes.cpp:518 sets dpcmMode
  });
  it('keeps unsupported effects lossy with the channel kind', () => {
    const song = music({ 0: { 0: { ...A4, ...fx(0x11, 0x01) } } });
    expect(song.lossy.some((l) => l.startsWith('effect 11'))).toBe(true);
  });
});

/** Player screen in Mesen2 headless: a Lua script reads the nametable, presses Start / Right, and times the last PPU write of every NMI. */
const DUMPS = [30, 150, 200, 330];
const PRESS: Array<[number, number, string]> = [[160, 165, 'start'], [210, 215, 'start'], [260, 265, 'right']];
describe.skipIf(!existsSync(MESEN))('famistudio player screen in Mesen2', () => {
  const player = readFileSync(path.join(DIR, 'player.nes'));
  const A4 = { note: 9, octave: 4 };
  const song = furnaceToFamistudio(nesModule({ 0: { 0: A4 }, 1: { 0: A4 }, 2: { 0: A4 }, 3: { 0: A4 } }));
  const rom = buildFamistudioRom(player, META, song, { title: 'Test Song', author: 'Some Author', comments: '' });

  it('draws title, author, chip name, status, bars and scroller; Start pauses, Right restarts the clock; PPU writes end inside vblank', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fsscreen-'));
    try {
      writeFileSync(path.join(dir, 'p.nes'), rom);
      // Tile -> text: 0-63 dim glyphs, 73 rule '-', 74 play '>', 75 pause '=', 80-143 white glyphs, 144-191 bar-colour glyphs, 192+ bar cells.
      const lua = `local f,t0,last,mx,seen=0,0,0,0,false
local function ch(t) if t<64 then return string.char(t+0x20) elseif t==73 then return "-" elseif t==74 then return ">" elseif t==75 then return "=" elseif t>=80 and t<144 then return string.char(t-80+0x20) elseif t>=144 and t<192 then return string.char(t-144+0x30) else return "#" end end
local function tile(r,c,b) return emu.read((b or 0x2000)+r*32+c, emu.memType.nesPpuMemory) end
local function row(r,c0,c1,b) local t={} for c=c0,c1 do t[#t+1]=ch(tile(r,c,b)) end return table.concat(t) end
local function bars() local o={} for i=0,4 do local n=0 for r=6,23 do if tile(r,6+4*i)~=192 then n=n+1 end end o[#o+1]=n end return table.concat(o,",") end
local function hex(a,n) local o={} for i=0,n-1 do o[#o+1]=string.format("%02X",emu.read(a+i, emu.memType.nesPpuMemory)) end return table.concat(o) end
emu.addMemoryCallback(function() if last>mx then mx=last end last=0 seen=true t0=emu.getState()["cpu.cycleCount"] end, emu.callbackType.exec, ${META.nmiAddr}, ${META.nmiAddr})
emu.addMemoryCallback(function() local sl=emu.getState()["ppu.scanline"] if seen and (sl<200 or sl>=240) then last=emu.getState()["cpu.cycleCount"]-t0 end end, emu.callbackType.write, 0x2006, 0x2007)
emu.addMemoryCallback(function()
  f=f+1
  for _,x in ipairs({${DUMPS.join(',')}}) do if f==x then print("F"..f.."|"..row(2,11,29).."|"..row(3,2,29).."|"..row(4,2,29).."|"..row(25,2,29).."|"..bars().."|"..row(27,0,31,0x2800)..row(27,0,31,0x2800).."|"..hex(0x3F00,16).."|"..hex(0x23C0,64).."|"..row(5,2,29).."|"..row(24,6,24).."|"..row(26,2,29).."|"..row(2,2,9)) end end
  if f>=${DUMPS[DUMPS.length - 1]} then if last>mx then mx=last end print("PPUEND "..mx) print("DONE") emu.stop(0) end
end, emu.callbackType.exec, ${META.tickAddr}, ${META.tickAddr})
emu.addEventCallback(function()
${PRESS.map(([a, b, k]) => `  if f>=${a} and f<=${b} then emu.setInput({${k}=true},0) end`).join('\n')}
end, emu.eventType.inputPolled)
`;
      writeFileSync(path.join(dir, 's.lua'), lua);
      const set = path.join(homedir(), 'Library/Application Support/Mesen2');
      mkdirSync(set, { recursive: true });
      if (!existsSync(path.join(set, 'Settings.json'))) writeFileSync(path.join(set, 'Settings.json'), '{"FirstRun":false}');
      let out = '';
      try { out = execFileSync(MESEN, ['--testRunner', '--timeout=60', '--nes.region=Ntsc', '--nes.port1.type=NesController', '--doNotSaveSettings', '--enableStdout', path.join(dir, 's.lua'), path.join(dir, 'p.nes')], { encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26 }); } catch (e) { out = String((e as { stdout?: string }).stdout ?? ''); console.log(out.slice(0, 1500)); }
      expect(out).toContain('DONE');
      console.log(`[fsscreen] ${out.split('\n').filter((l) => l.startsWith('PPUEND') || /^F\d+\|/.test(l)).join('\n[fsscreen] ')}`);
      const d = Object.fromEntries(out.split('\n').filter((l) => /^F\d+\|/.test(l)).map((l) => [l.split('|')[0], l.split('|')]));
      const [, a, b, c] = [d.F30, d.F150, d.F200, d.F330];
      const PAL = '0F102D270F17272C0F1030260F10302C'; // chip/rules, bars, logo/title/author, labels/status/scroller; sprite palettes unused
      const ATTR = ['A0'.repeat(8), '0040505050501000', ...Array(4).fill('0044555555551100'), '0F'.repeat(8), '00'.repeat(8)].join('').toUpperCase();
      for (const f of [a, b, c]) {
        expect(f[7]).toBe(PAL); // $3F00-$3F0F
        expect(f[8]).toBe(ATTR); // $23C0-$23FF
        expect(f[12]).toBe('DEVILBOX'); // logo text at row 2, cols 2-9
        expect(f[9]).toBe('-'.repeat(28)); // rules rows 5 and 26
        expect(f[11]).toBe('-'.repeat(28));
        expect(f[10]).toBe(' 1   2   3   4   5 '); // labels under the bars
      }
      expect(a[1]).toMatch(/^TEST SONG/);
      expect(a[2]).toMatch(/^BY SOME AUTHOR/);
      expect(a[3].startsWith('2A03')).toBe(true);
      expect(a[3].slice(25, 28)).toBe('NES');
      expect(a[4].slice(0, 2)).toBe('> ');
      expect(a[4].slice(20, 28)).toBe('SONG 1/1'); // right-aligned to col 29, unpadded numbers
      expect(a[5].split(',').map(Number).slice(0, 3).every((n) => n > 0)).toBe(true); // pulse 1, pulse 2, triangle sound
      expect(Number(a[5].split(',')[2])).toBe(18); // triangle is on/off: full bar (18 rows)
      expect(a[5].split(',')[4]).toBe('1'); // no DPCM in this song: only the resting cap line
      expect(d.F30[6]).toContain('SONG - SOME AUTHOR'); // scroller falls back to TITLE - AUTHOR (row 27 of nametable $2800 read as a 32-column ring: it scrolls by hardware)
      expect(b[4].slice(0, 2)).toBe('= '); // Start pauses
      expect(b[5]).toBe('2,2,2,2,1'); // pause silences the engine: bars empty, cap line resting on the floor (h=7 spills one row on the four tone channels)
      expect(c[4].slice(0, 2)).toBe('> '); // Start resumed
      expect(Number(out.match(/PPUEND (\d+)/)![1])).toBeLessThan(2273 - 7); // last VRAM write ($2006/$2007) of any NMI; the scroller split's $2001/$2005/$2006 writes at scanline 212 are meant to be mid-frame and not counted, counted from the NMI vector (7 cycles)
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 120000);

  it('expandProcMacro: pre-245 volume ADSR 0..15 attack 255 decay 16 holds 15 for three ticks then falls one per tick (The East tambourine)', () => {
    const adsr = { code: 0, type: 3, mode: 0, speed: 1, delay: 0, length: 16, loop: 255, release: 255, data: [0, 15, 255, 0, 16, 0, 0, 0, ...Array(8).fill(0)] };
    expect(expandProcMacro(adsr as never, 223).data.slice(0, 8)).toEqual([15, 15, 14, 13, 12, 11, 10, 9]);
  });

  it('expandProcMacro runs a pre-245 ADSR pitch macro (smashtv "slide down") as a 16 semitone slide in about 19 ticks', () => {
    const adsr = { code: 4, type: 131, mode: 0, speed: 1, delay: 0, length: 16, loop: 255, release: 255, data: [0, -2048, 13, ...Array(13).fill(0)] };
    const old = expandProcMacro(adsr as never, 218).data, cur = expandProcMacro(adsr as never, 245).data;
    expect(old[0]).toBeLessThan(-100); // about 104 units (0.8 semitone) per tick
    expect(old[19]).toBeLessThan(-1900);
    expect(old[old.length - 1]).toBeLessThanOrEqual(-2040);
    expect(cur[cur.length - 1]).toBeGreaterThan(-20); // 245+ files keep the raw rate: 13/256 per tick
    const seq = { ...adsr, type: 1 };
    expect(expandProcMacro(seq as never, 218)).toBe(seq); // sequence macros pass through
  });
});

describe('famistudio pattern references', () => {
  const chunk = (...b: number[]): number[] => b;
  const build = (chunks: number[][]): { out: number[]; ev: number[] } => {
    const out: number[] = [], ev: number[] = [];
    for (const c of chunks) { out.push(...c); ev.push(out.length); }
    return { out, ev };
  };
  it('replaces repeated chunk runs by 0x41 len addr and expands back to the same bytes', () => {
    const a = chunk(0x46, 6, 0x0d), b = chunk(0x81), c = chunk(0x4a, 0x20, 0x13), d = chunk(0x05);
    const { out, ev } = build([a, b, c, d, a, b, c, d, a, b, c, d, d]);
    const p = compressRefs(out, ev, [], 0);
    expect(p.out.length).toBeLessThan(out.length);
    expect(p.refs.length).toBeGreaterThan(0);
    expect(p.out.filter((_, i) => p.refs.some((r) => r.at === i))).toEqual(p.refs.map(() => 0x41));
    expect(expandRefs(p)).toEqual(out);
    // references never point at references
    for (const r of p.refs) expect(p.refs.some((q) => q.at === r.target)).toBe(false);
  });
  it('keeps the loop target on a real position and treats different envelope ids as different chunks', () => {
    const a = chunk(0x4a, 0, 0, 0x13), b = chunk(0x81, 0x05);
    const { out, ev } = build([a, b, a, b, a, b, a, b]);
    const same = compressRefs(out, ev, [[1, 7], [9, 7], [17, 7], [25, 7]], ev[3]);
    expect(expandRefs(same)).toEqual(out);
    expect(same.refs.some((r) => r.at < same.loopAt && same.loopAt < r.at + 4)).toBe(false);
    const diff = compressRefs(out, ev, [[1, 1], [9, 2], [17, 3], [25, 4]], 0);
    expect(diff.refs.length).toBe(0);
  });
});

describe('furnaceToFamistudio VRC6', () => {
  it('emits 8 streams for 2A03+VRC6, with notes on the pulses and saw, duty 0x4f and the saw volume shift 0x55', () => {
    const base = nesModule({});
    const patterns = new Map<string, { rows: Cell[] }>();
    for (let ch = 0; ch < 8; ch++) patterns.set(`0_${ch}_0`, { rows: Array.from({ length: 16 }, (_, r) => ({ ...empty(), ...(r === 0 && ch >= 5 ? { note: 0, octave: 4, effects: ch === 5 ? [{ type: 0x12, value: 3 }] : [] } : {}) })) });
    const m = { ...base, systems: [6, 0x88], patterns, subsongs: [{ ...base.subsongs[0], orders: Array.from({ length: 8 }, () => [0]) }] } as unknown as FurnaceModule;
    const song = furnaceToFamistudio(m);
    expect(song.vrc6).toBe(true);
    expect(song.channelsWithNotes.length).toBe(8);
    expect(song.channelsWithNotes.slice(5)).toEqual([true, true, true]);
    expect(song.music[1] | (song.music[2] << 8)).toBeGreaterThan(0);
    expect(has(song.music, [0x4f, 3])).toBe(true);
    expect(has(song.music, [0x55, 1])).toBe(true);
    expect(furnaceToFamistudio(nesModule({})).vrc6).toBeFalsy();
  });
});
