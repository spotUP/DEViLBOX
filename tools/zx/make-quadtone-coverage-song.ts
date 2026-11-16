/**
 * Writes public/data/songs/furnace/misc/QuadTone Coverage Test.fur: a listening test for the ZX Spectrum
 * Beeper (QuadTone engine) chip, so a musician can judge by ear whether the ZX tape export matches playback.
 *   npx tsx --tsconfig tsconfig.app.json tools/zx/make-quadtone-coverage-song.ts [out.fur]
 *
 * FurnaceExporter / FurnaceModuleExporter only write Neo Geo and AY systems, so this script writes the chip's
 * module itself, with the same layout as exportFurnaceAyScramble (INFO, FLAG, ADIR, INS2, SMP2, PATN) and the
 * repo's INS2 encoder. Prints each section's row range; the parser test and the WAV check read the same table.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pako from 'pako';
import { BinaryWriter } from '@/utils/BinaryWriter';
import { encodeInstrumentAsINS2, type FurnaceInstrument } from '@/lib/import/formats/furnace/FurnaceInstrumentParser';
import { DIV_INS_POKEMINI } from '@/lib/export/FurnaceInstrumentEncoder';

const VERSION = 228;
const DIV_INS_AMIGA = 4;
const SYSTEM_ID = 0xca;
const CHANNELS = 5; // 4 tone voices + 1-bit drum
const PAT_LEN = 16;
const SPEED = 6;
const TICK_HZ = 50;
const NOTE_OFF = 180;
export const ROW_SECONDS = SPEED / TICK_HZ;
const CHIP_FLAGS = 'clockSel=1\n'; // 3546895 Hz, the 128K clock

// -- Notes and cells ----------------------------------------------------------
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C-3', 'F#2' to the Furnace file note (C-0 = 60). */
export function note(s: string): number {
  return (Number(s[2]) + 5) * 12 + SEMI[s[0]] + (s[1] === '#' ? 1 : 0);
}
interface Cell { n?: number; i?: number; v?: number; fx?: [number, number] }
type Fx = [number, number];

// -- Instruments (names say what they are) ------------------------------------
const mac = (code: number, data: number[], loop = 255, speed = 1) =>
  ({ code, length: data.length, loop, release: 255, mode: 0, type: 0, delay: 0, speed, data });
const tone = (name: string, duty?: number[], loop = 255, speed = 1): FurnaceInstrument =>
  ({ name, type: DIV_INS_POKEMINI, macros: duty ? [mac(2, duty, loop, speed)] : [], samples: [], wavetables: [] });
const drum = (name: string, sample: number): FurnaceInstrument => ({
  name, type: DIV_INS_AMIGA, macros: [], samples: [sample], wavetables: [],
  amiga: { initSample: sample, useNoteMap: false, useSample: true, useWave: false, waveLen: 32 },
});
// Duty macro value d gives a high phase of (d+1)/256 (reg = d ^ 0xff, output low while phase < reg).
export const INS = { SQ50: 0, P25: 1, P12: 2, P6: 3, DUTY_FX: 4, SWEEP: 5, KICK: 6, SNARE: 7, HAT: 8, TOM: 9 } as const;
const instruments: FurnaceInstrument[] = [
  tone('Square 50%', [127]), tone('Pulse 25%', [63]), tone('Pulse 12%', [31]), tone('Pulse 6%', [15]),
  tone('Duty set by 12xx command'),
  tone('Duty sweep 6% to 50% and back', [15, 31, 47, 63, 79, 95, 111, 127, 111, 95, 79, 63, 47, 31], 0, 3),
  drum('Kick (1-bit, generated)', 0), drum('Snare (1-bit, generated)', 1), drum('Hi-hat (1-bit, generated)', 2), drum('Tom (1-bit, generated)', 3),
];

// -- Generated 1-bit drum samples: signed bytes, > 0 is a high bit ----------------
const DRUM_RATE = 22050;
function bits(n: number, f: (i: number, t: number) => boolean): Int8Array {
  return Int8Array.from({ length: n }, (_, i) => (f(i, i / DRUM_RATE) ? 127 : -127));
}
function sweepSquare(n: number, f0: number, f1: number): Int8Array {
  let phase = 0;
  return bits(n, (i) => { phase += (f0 + (f1 - f0) * (i / n)) / DRUM_RATE; return phase % 1 < 0.5; });
}
function noise(n: number, holdStart: number, holdEnd: number): Int8Array {
  let lfsr = 0xace1, left = 0, level = false;
  return bits(n, (i) => {
    if (left-- <= 0) {
      const bit = ((lfsr >> 0) ^ (lfsr >> 2) ^ (lfsr >> 3) ^ (lfsr >> 5)) & 1;
      lfsr = (lfsr >> 1) | (bit << 15); level = (lfsr & 1) === 1;
      left = Math.round(holdStart + (holdEnd - holdStart) * (i / n));
    }
    return level;
  });
}
const samples = [
  { name: 'Kick (1-bit, generated)', data: sweepSquare(4400, 160, 40) },
  { name: 'Snare (1-bit, generated)', data: noise(3300, 1, 4) },
  { name: 'Hi-hat (1-bit, generated)', data: noise(1100, 0, 1) },
  { name: 'Tom (1-bit, generated)', data: sweepSquare(3900, 220, 90) },
];

// -- Patterns ------------------------------------------------------------------
interface Pat { name: string; rows: Map<number, Cell>[] }
const pats: Pat[] = [];
const order: number[] = [];
const sections: { title: string; first: number; rows: number }[] = [];
function newPat(name: string): Pat {
  const p = { name, rows: Array.from({ length: CHANNELS }, () => new Map<number, Cell>()) as Map<number, Cell>[] };
  // rows[ch].set(row, cell): the map key is the row
  pats.push(p);
  return p;
}
const put = (p: Pat, ch: number, row: number, c: Cell) => { p.rows[ch].set(row, { ...p.rows[ch].get(row), ...c }); };
const off = (p: Pat, ch: number, row: number) => put(p, ch, row, { n: NOTE_OFF });
const offAll = (p: Pat, row: number) => { for (let c = 0; c < CHANNELS; c++) off(p, c, row); };
/** Add a section: its patterns in order, then a silent pattern (all channels off) as the gap. */
function section(title: string, build: () => Pat[]): void {
  const first = order.length * PAT_LEN;
  for (const p of build()) { offAll(p, PAT_LEN - 1); order.push(pats.indexOf(p)); }
  sections.push({ title, first, rows: order.length * PAT_LEN - first });
  const gap = newPat(`${title} - silence`); offAll(gap, 0);
  order.push(pats.indexOf(gap));
}

// 1. Pitch range: whole tone steps C-2 to C-6 on voice 1, one note per row
section('1 Pitch range C-2 to C-6', () => {
  const names = ['C-', 'D-', 'E-', 'F#', 'G#', 'A#'];
  const all: string[] = [];
  for (let o = 2; o <= 5; o++) for (const n of names) all.push(`${n}${o}`);
  all.push('C-6');
  const out: Pat[] = [];
  for (let k = 0; k < all.length; k += 15) {
    const p = newPat(`1 Pitch range ${out.length + 1}`);
    all.slice(k, k + 15).forEach((s, r) => put(p, 0, r, { n: note(s), i: INS.SQ50 }));
    off(p, 0, Math.min(15, all.length - k));
    out.push(p);
  }
  return out;
});

// 2. Each voice alone, same note A-3: voice 1 at row 0, voice 2 at row 4, voice 3 at row 8, voice 4 at row 12
section('2 Each voice alone', () => {
  const p = newPat('2 Each voice alone, A-3');
  for (let v = 0; v < 4; v++) { put(p, v, v * 4, { n: note('A-3'), i: INS.SQ50 }); off(p, v, v * 4 + 3); }
  return [p];
});

// 3. Four-voice chord: C major then A minor, sustained
section('3 Four-voice chord', () => {
  const p = newPat('3 Chord C major then A minor');
  ['C-3', 'E-3', 'G-3', 'C-4'].forEach((s, v) => put(p, v, 0, { n: note(s), i: INS.SQ50 }));
  ['A-2', 'C-3', 'E-3', 'A-3'].forEach((s, v) => put(p, v, 8, { n: note(s), i: INS.SQ50 }));
  return [p];
});

// 4. Duty / PWM: 12xx on each voice (8, 32, 64, 128, one value per row), then the duty sweep macro per voice
section('4 Duty and PWM sweep', () => {
  const a = newPat('4 Duty by 12xx per voice');
  for (let v = 0; v < 4; v++) [0x08, 0x20, 0x40, 0x7f].forEach((d, k) => {
    put(a, v, v * 4 + k, { n: note('C-3'), i: INS.DUTY_FX, fx: [0x12, d] });
  });
  const b = newPat('4 Duty sweep macro per voice');
  for (let v = 0; v < 4; v++) { put(b, v, v * 4, { n: note('C-3'), i: INS.SWEEP }); off(b, v, v * 4 + 3); }
  return [a, b];
});

// 5. Volume: the chip has 3 levels (0 silent, 1 = 7, 2 = 31), column values 0 to 2
section('5 Volume steps', () => {
  const a = newPat('5 Volume 2 1 0 on one voice');
  put(a, 0, 0, { n: note('C-3'), i: INS.SQ50, v: 2 });
  put(a, 0, 4, { v: 1 }); put(a, 0, 8, { v: 0 }); put(a, 0, 12, { v: 2 });
  const b = newPat('5 Chord at volume 2 then 1');
  ['C-3', 'E-3', 'G-3', 'C-4'].forEach((s, v) => put(b, v, 0, { n: note(s), i: INS.SQ50, v: 2 }));
  for (let v = 0; v < 4; v++) put(b, v, 8, { v: 1 });
  return [a, b];
});

// 6. Effects the chip dispatch handles: arpeggio 0xy, slides 1xx 2xx, tone portamento 3xx, vibrato 4xy
section('6 Arpeggio, slides, portamento, vibrato', () => {
  const a = newPat('6 Arpeggio major, minor, slide up');
  const fx = (x: number, y: number): Fx => [x, y];
  put(a, 0, 0, { n: note('C-3'), i: INS.SQ50, fx: fx(0x00, 0x47) });
  put(a, 0, 4, { n: note('C-3'), i: INS.SQ50, fx: fx(0x00, 0x37) });
  put(a, 0, 8, { n: note('A-2'), i: INS.SQ50, fx: fx(0x01, 0x20) });
  put(a, 0, 12, { fx: fx(0x01, 0x00) });
  const b = newPat('6 Slide down, tone portamento, vibrato');
  put(b, 0, 0, { n: note('A-4'), i: INS.SQ50, fx: fx(0x02, 0x20) });
  put(b, 0, 4, { n: note('C-3'), i: INS.SQ50, fx: fx(0x00, 0x00) });
  put(b, 0, 5, { n: note('G-3'), fx: fx(0x03, 0x30) });
  put(b, 0, 9, { n: note('E-3'), i: INS.SQ50, fx: fx(0x04, 0x46) });
  return [a, b];
});

// 7. Drums: each sample alone on the drum channel, then drums over a chord
section('7 Drums', () => {
  const a = newPat('7 Each drum alone');
  [INS.KICK, INS.SNARE, INS.HAT, INS.TOM].forEach((ins, k) => put(a, 4, k * 4, { n: note('C-4'), i: ins }));
  const b = newPat('7 Drums over a chord');
  ['C-3', 'E-3', 'G-3', 'C-4'].forEach((s, v) => put(b, v, 0, { n: note(s), i: INS.SQ50 }));
  [INS.KICK, INS.HAT, INS.SNARE, INS.HAT].forEach((ins, k) => put(b, 4, k * 4, { n: note('C-4'), i: ins }));
  return [a, b];
});

// 8. Phrase: bass (voice 1), chord (voices 2 and 3), lead with vibrato (voice 4), drums
section('8 Musical phrase', () => {
  const chords: [string, string, string, string][] = [['C-2', 'C-3', 'E-3', 'G-4'], ['A-1', 'C-3', 'E-3', 'E-4'], ['F-2', 'A-2', 'C-3', 'C-4'], ['G-1', 'B-2', 'D-3', 'D-4']];
  const lead = ['G-4', 'E-4', 'G-4', 'C-5', 'E-4', 'C-4', 'E-4', 'A-4', 'F-4', 'A-3', 'C-4', 'F-4', 'D-4', 'B-3', 'D-4', 'G-4'];
  const out: Pat[] = [];
  for (let half = 0; half < 2; half++) {
    const p = newPat(`8 Phrase ${half + 1}`);
    chords.forEach(([bass, c1, c2, l], k) => {
      const r = k * 4;
      put(p, 0, r, { n: note(bass), i: INS.P25 }); put(p, 0, r + 2, { n: note(bass) });
      put(p, 1, r, { n: note(c1), i: INS.SQ50 }); put(p, 2, r, { n: note(c2), i: INS.P12 });
      put(p, 3, r, { n: note(half === 0 ? l : lead[k]), i: INS.P25, fx: [0x04, 0x35] });
    });
    [INS.KICK, INS.HAT, INS.SNARE, INS.HAT].forEach((ins, k) => {
      put(p, 4, k * 4, { n: note('C-4'), i: half === 1 && k === 3 ? INS.TOM : ins });
      put(p, 4, k * 4 + 2, { n: note('C-4'), i: INS.HAT });
    });
    out.push(p);
  }
  return out;
});

// -- Module writer ----------------------------------------------------------------
function block(w: BinaryWriter, tag: string, body: () => void): number {
  const start = w.getOffset();
  w.writeMagic(tag); w.writeUint32(0); body();
  const end = w.getOffset();
  w.setOffset(start + 4); w.writeUint32(end - start - 8); w.setOffset(end);
  return start;
}
function patch(w: BinaryWriter, at: number, value: number): void {
  const here = w.getOffset(); w.setOffset(at); w.writeUint32(value); w.setOffset(here);
}
/** PATN rows (fur.cpp new pattern format): skip byte, mask, values, 0xff end. One effect column. */
function encodeRows(cells: Map<number, Cell>, w: BinaryWriter): void {
  for (let r = 0; r < PAT_LEN;) {
    const c = cells.get(r);
    if (!c) {
      let n = 1;
      while (r + n < PAT_LEN && n < 129 && !cells.has(r + n)) n++;
      w.writeUint8(n >= 2 ? 128 | (n - 2) : 0);
      r += n; continue;
    }
    w.writeUint8((c.n !== undefined ? 1 : 0) | (c.i !== undefined ? 2 : 0) | (c.v !== undefined ? 4 : 0) | (c.fx ? 8 | 16 : 0));
    if (c.n !== undefined) w.writeUint8(c.n);
    if (c.i !== undefined) w.writeUint8(c.i);
    if (c.v !== undefined) w.writeUint8(c.v);
    if (c.fx) { w.writeUint8(c.fx[0]); w.writeUint8(c.fx[1]); }
    r++;
  }
  w.writeUint8(0xff);
}

export const SONG_NAME = 'QuadTone Coverage Test';
export function songComment(): string {
  return [
    'Listening test for the ZX Spectrum Beeper (QuadTone engine): compare DEViLBOX playback with the ZX tape export section by section.',
    `Chip clock: ZX Spectrum (clockSel 1, 3546895 Hz). Tick rate ${TICK_HZ} Hz, speed ${SPEED}, ${PAT_LEN} rows per pattern (${ROW_SECONDS * 1000} ms per row). Every section ends with a silent pattern.`,
    'Channels: Voice 1 to Voice 4 (tone, PWM duty, 3 volume levels), Drum (1-bit sample, replaces tone output while it plays).',
    'The four 1-bit drum samples (kick = falling square, snare and hi-hat = noise bits, tom = falling square) are generated test sounds, not recordings.',
    'Instruments: Square 50%, Pulse 25%, Pulse 12%, Pulse 6% (duty macros), Duty set by 12xx command, Duty sweep macro, and the four drums.',
    'Sections (row = order position * 16 + row in pattern): ' + sections.map((s) => `${s.title}: rows ${s.first}-${s.first + s.rows - 1}`).join('; ') + '.',
    'Not used, because the chip code ignores them: panning (08xx, mono 1-bit output), sample offset commands (TODO in zxbeeperquadtone.cpp), wave and noise macros, noise mode; volume above 2 clamps.',
  ].join('\n');
}

export function buildModule(): Uint8Array {
  const w = new BinaryWriter(256 * 1024);
  w.writeMagic('-Furnace module-'); w.writeUint16(VERSION); w.writeUint16(0); w.writeUint32(32); w.writeZeros(8);
  const flagAt: number[] = [], insAt: number[] = [], smpAt: number[] = [], patAt: number[] = [], adirAt: number[] = [];
  const names = ['Voice 1', 'Voice 2', 'Voice 3', 'Voice 4', 'Drum'];
  const used: { ch: number; index: number }[] = [];
  pats.forEach((p, index) => p.rows.forEach((cells, ch) => { if (cells.size > 0) used.push({ ch, index }); }));
  block(w, 'INFO', () => {
    w.writeUint8(0); w.writeUint8(SPEED); w.writeUint8(SPEED); w.writeUint8(1); w.writeFloat32(TICK_HZ);
    w.writeUint16(PAT_LEN); w.writeUint16(order.length); w.writeUint8(4); w.writeUint8(16);
    w.writeUint16(instruments.length); w.writeUint16(0); w.writeUint16(samples.length); w.writeUint32(used.length);
    for (let i = 0; i < 32; i++) w.writeUint8(i === 0 ? SYSTEM_ID : 0);
    for (let i = 0; i < 32; i++) w.writeInt8(64);
    for (let i = 0; i < 32; i++) w.writeInt8(0);
    for (let i = 0; i < 32; i++) { if (i === 0) flagAt.push(w.getOffset()); w.writeUint32(0); }
    w.writeNullTerminatedString(SONG_NAME); w.writeNullTerminatedString('DEViLBOX'); w.writeFloat32(440);
    for (const v of [0, 1, 2, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1]) w.writeUint8(v);
    for (let i = 0; i < instruments.length; i++) { insAt.push(w.getOffset()); w.writeUint32(0); }
    for (let i = 0; i < samples.length; i++) { smpAt.push(w.getOffset()); w.writeUint32(0); }
    for (let i = 0; i < used.length; i++) { patAt.push(w.getOffset()); w.writeUint32(0); }
    for (let ch = 0; ch < CHANNELS; ch++) for (const pos of order) w.writeUint8(pos);
    for (let ch = 0; ch < CHANNELS; ch++) w.writeUint8(1); // effect columns
    for (let ch = 0; ch < CHANNELS; ch++) w.writeUint8(1); // shown
    for (let ch = 0; ch < CHANNELS; ch++) w.writeUint8(0); // collapsed
    for (const n of names) w.writeNullTerminatedString(n);
    for (const n of ['V1', 'V2', 'V3', 'V4', 'DR']) w.writeNullTerminatedString(n);
    w.writeNullTerminatedString(songComment());
    w.writeFloat32(1);
    for (const v of [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 4, 0, 0, 1, 1, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0]) w.writeUint8(v);
    w.writeUint16(150); w.writeUint16(150);
    w.writeNullTerminatedString(SONG_NAME); w.writeNullTerminatedString('');
    w.writeUint8(0); w.writeZeros(3);
    for (const s of ['ZX Spectrum Beeper (QuadTone Engine)', '', '', '', '', '']) w.writeNullTerminatedString(s);
    w.writeFloat32(1); w.writeFloat32(0); w.writeFloat32(0);
    w.writeUint32(0); w.writeUint8(1);
    for (let i = 0; i < 8; i++) w.writeUint8(0);
    w.writeUint8(1); for (let i = 0; i < 16; i++) w.writeUint8(i === 0 ? SPEED : 0);
    w.writeUint8(0);
    for (let i = 0; i < 3; i++) { adirAt.push(w.getOffset()); w.writeUint32(0); }
  });
  for (const at of flagAt) patch(w, at, block(w, 'FLAG', () => w.writeNullTerminatedString(CHIP_FLAGS)));
  for (const at of adirAt) patch(w, at, block(w, 'ADIR', () => w.writeUint32(0)));
  instruments.forEach((ins, i) => {
    const at = w.getOffset(); w.writeBytes(encodeInstrumentAsINS2(ins, VERSION)); patch(w, insAt[i], at);
  });
  samples.forEach((s, i) => {
    patch(w, smpAt[i], block(w, 'SMP2', () => {
      w.writeNullTerminatedString(s.name); w.writeUint32(s.data.length);
      w.writeUint32(DRUM_RATE); w.writeUint32(DRUM_RATE);
      w.writeUint8(8); w.writeUint8(0); w.writeUint8(0); w.writeUint8(0);
      w.writeUint32(0xffffffff); w.writeUint32(0xffffffff);
      for (let k = 0; k < 4; k++) w.writeUint32(0xffffffff);
      for (const b of s.data) w.writeUint8(b);
    }));
  });
  used.forEach(({ ch, index }, i) => {
    patch(w, patAt[i], block(w, 'PATN', () => {
      w.writeUint8(0); w.writeUint8(ch); w.writeUint16(index);
      w.writeNullTerminatedString(ch === 0 ? pats[index].name : '');
      encodeRows(pats[index].rows[ch], w);
    }));
  });
  return pako.deflate(w.getBuffer());
}

export function sectionTable(): { title: string; first: number; rows: number }[] { return sections; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../../public/data/songs/furnace/misc/QuadTone Coverage Test.fur'));
  const bytes = buildModule();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log(`[OK] ${out}: ${bytes.length} bytes, ${order.length} orders, ${pats.length} patterns`);
  for (const s of sections) console.log(`${s.title}: rows ${s.first}-${s.first + s.rows - 1} (${(s.first * ROW_SECONDS).toFixed(2)}s-${((s.first + s.rows) * ROW_SECONDS).toFixed(2)}s)`);
}
