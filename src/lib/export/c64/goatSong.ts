/**
 * Furnace C64 (SID) song -> GoatTracker 2 song data for Cadaver's GT2 playroutine
 * (gtultra-wasm/players/player.s, free licence), relocated by the GTUltra WASM
 * relocator (gt_export_prg) and booted by c64Prg.ts.
 *
 * Milestone 1 scope: notes, note off/release, instrument changes, instrument
 * ADSR, waveform, ring/sync, initial duty, initial filter, speed (tempo), the
 * tick rate (`hz`, played from a CIA timer) and the chip clock (clockSel: NTSC or
 * PAL machine and note table). Everything else is reported in `lossy`.
 */
import type { FurnaceModule } from '../../import/formats/FurnaceSongParser';
import type { FurnaceInstrument, FurnaceMacro } from '../../import/formats/furnace/FurnaceInstrumentParser';
import { expandProcMacro } from '../nes/famistudioSong';
import { arpIsFixed, arpNv, macroOf } from '../pce/husicSong';
import { convertFurnaceNoteValue } from '../../import/formats/furnace/FurnacePatternParser';
import {
  emptyGTInstrument, GT_FIRSTNOTE, GT_LOOPSONG, GT_MAX_INSTR, GT_REST,
  type GTInstrument, type GTPlaySettings, type GTSongData,
} from '../../import/formats/GoatTrackerSid';
import { Lossy } from '../md/mdsSong';

/** Furnace file ids of the SID systems (DIV_SYSTEM_C64_8580, DIV_SYSTEM_C64_6581). */
export const C64_SYSTEM_IDS = [0x07, 0x47];
const GT_KEYOFF = 0xbe;
const GT_MAX_ROWS = 128;
const GT_MAX_PATT = 208;
const CMD_SETTEMPO = 0x0f;
const CMD_FUNKTEMPO = 0x0e;

/** `hz`: player calls per second. `settings.ntsc`: the song's SID runs at the NTSC clock (machine + note table). */
export interface GoatSong { song: GTSongData; settings: GTPlaySettings; hz: number; lossy: string[] }

/** Furnace c64.cpp setFlags clockSel: 0 NTSC 1022727 Hz, 1 PAL 985248 Hz, 2 SSI 2001 (894886 Hz, no C64 runs it). */
export const furnaceSidNtsc = (m: { chipFlags?: string[] }): boolean => Number(/clockSel=(\d)/.exec(m.chipFlags?.[0] ?? '')?.[1] ?? 0) !== 1;

export function goatSystemsSupported(sys: readonly number[]): boolean {
  return sys.length === 1 && C64_SYSTEM_IDS.includes(sys[0]);
}

// Furnace macro codes (instrument.h DIV_MACRO_*): alg is the SID cutoff, ex1 the filter mode, ex2 the resonance.
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_DUTY = 2, MACRO_WAVE = 3, MACRO_PITCH = 4, MACRO_EX1 = 5, MACRO_EX2 = 6, MACRO_ALG = 8;
// The pitch macro is exported per note (furnaceToGoatTracker pitchProgram), not in the instrument.
const MACROS_DONE = new Set([MACRO_VOL, MACRO_ARP, MACRO_DUTY, MACRO_WAVE, MACRO_PITCH, MACRO_EX1, MACRO_EX2, MACRO_ALG]);
const MAX_PROGRAM_TICKS = 64;
const s8 = (v: number) => (v << 24) >> 24;

/** One macro as a value per tick (GT steps its tables once per player call, which is one Furnace tick).
 * `loop`: tick to repeat from, -1 holds the last value. `step` applies one macro value (relative macros add to `prev`). */
interface Track { vals: number[]; loop: number }
function macroTrack(mac: FurnaceMacro | undefined, version: number, init: number, rel: boolean,
  step: (prev: number, v: number) => number, lossy: Lossy, what: string): Track | undefined {
  if (!mac) return undefined;
  const m = expandProcMacro(mac, version);
  if (m.length <= 0) return undefined;
  if (m.release !== 0xff && m.release < m.length) lossy.add(`${what} macro release point (played through)`);
  // macroInt.cpp: `delay` ticks of nothing, then each value lasts `speed` ticks.
  const sp = Math.max(1, m.speed);
  const vals = new Array<number>(Math.max(0, m.delay)).fill(init);
  let cur = init;
  for (let i = 0; i < m.length; i++) { cur = step(cur, m.data[i]); for (let k = 0; k < sp; k++) vals.push(cur); }
  let loop = m.loop !== 0xff && m.loop < m.length ? Math.max(0, m.delay) + m.loop * sp : -1;
  // shortcut: a looping relative macro drifts forever; it holds after one pass. Upgrade with GT modulation rows.
  if (loop >= 0 && rel) { lossy.add(`looping relative ${what} macro (held after one pass)`); loop = -1; }
  return { vals, loop };
}

/** Ticks a table program needs so all tracks play together: rows 0..end-1, then jump back to `loop` (-1: stop, all hold). */
function schedule(tracks: Array<Track | undefined>, lossy: Lossy, what: string): { end: number; loop: number } {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let start = 0, period = 1;
  for (const t of tracks) {
    if (!t) continue;
    start = Math.max(start, t.loop >= 0 ? t.loop : t.vals.length - 1);
    const p = t.loop >= 0 ? t.vals.length - t.loop : 1;
    period = (period * p) / gcd(period, p);
  }
  if (period === 1) return { end: start + 1, loop: -1 };
  if (start + period > MAX_PROGRAM_TICKS) { lossy.add(`${what} macro loops longer than ${MAX_PROGRAM_TICKS} ticks (held)`); return { end: MAX_PROGRAM_TICKS, loop: -1 }; }
  return { end: start + period, loop: start };
}

const at = (t: Track | undefined, tick: number, dflt: number): number => {
  if (!t) return dflt;
  if (tick < t.vals.length) return t.vals[tick];
  const start = t.loop >= 0 ? t.loop : t.vals.length - 1;
  return t.vals[start + ((tick - start) % (t.vals.length - start))];
};

/** Pulse program for one duty value per tick: a $8X set row, then runs of equal steps as modulation rows (left 1-127 ticks,
 * right signed speed added each tick, player.s mt_pulsemod), so long duty sweeps fit GT's 255-row table. The loop tick
 * always starts with a set row, since a step row there would add to the value at the end of the loop instead.
 * A run continues while the played value stays within `tol` of Furnace's (LFO macros round to uneven steps); `err` is the largest miss. */
export function pulseRows(vals: number[], loop: number, tol = 0): { rows: Array<[number, number]>; loopRow: number; err: number } {
  const rows: Array<[number, number]> = [];
  let loopRow = -1, err = 0;
  for (let t = 0; t < vals.length;) {
    if (t === loop) loopRow = rows.length;
    rows.push([0x80 | ((vals[t] >> 8) & 15), vals[t] & 0xff]);
    let cur = vals[t];
    t++;
    while (t < vals.length && t !== loop) {
      // Furnace's own step, not the gap to the drifted value (that overshoots and the next run swings back further).
      const d = s12(vals[t] - vals[t - 1]);
      if (d < -128 || d > 127) break;
      let n = 0, runErr = 0;
      for (; n < 127 && t + n < vals.length && (n === 0 || t + n !== loop); n++) {
        const miss = Math.abs(s12(cur + d * (n + 1) - vals[t + n]));
        if (miss > tol) break;
        runErr = Math.max(runErr, miss);
      }
      if (!n) break;
      rows.push([n, d & 0xff]);
      cur += d * n;
      err = Math.max(err, runErr);
      t += n;
    }
  }
  return { rows, loopRow, err };
}
/** Largest pulse width miss (of 4096) a modulation run may take to fit an LFO duty macro in the pulse table. */
const PULSE_TOL = 8;
const s12 = (v: number) => (((v & 4095) << 20) >> 20);

type C64Ins = NonNullable<FurnaceInstrument['c64']>;
const waveCtl = (c: C64Ins) => (c.ringMod ? 0x04 : 0) | (c.oscSync ? 0x02 : 0) | 0x01;
const baseWaveOf = (c: C64Ins) => (c.noiseOn ? 8 : 0) | (c.pulseOn ? 4 : 0) | (c.sawOn ? 2 : 0) | (c.triOn ? 1 : 0);

/** Furnace c64.cpp coarse cutoff (11xx) and fine cutoff (4xxx) as the GT cutoff byte ($D416); the low 3 bits ($D415) are dropped like the cutoff macro's. */
export const coarseCutoffByte = (v: number): number => (((Math.min(v, 100) + 2) * 2047 / 102) | 0) >> 3;
export const fineCutoffByte = (type: number, v: number): number => ((((type & 7) << 8) | v) >> 3) & 0xff;

/** One instrument: ADSR, wave program (waveform + gate, arpeggio), pulse program, filter program, from the
 * instrument and its arp / wave / duty / cutoff / filter mode / resonance macros. */
function instrumentOf(ins: FurnaceInstrument | undefined, idx: number, tables: GTSongData['tables'], lossy: Lossy,
  version: number, multiplyRel: boolean, voices: number): GTInstrument {
  const g = emptyGTInstrument();
  const c = ins?.c64;
  if (!ins || !c) return g;
  g.name = ins.name.slice(0, 16);
  g.ad = ((c.a & 15) << 4) | (c.d & 15);
  g.sr = ((c.s & 15) << 4) | (c.r & 15);
  // GT's default hard restart: 2 frames gate off before the note, test bit + gate on its first frame.
  g.gatetimer = 2;
  g.firstwave = c.noTest ? 0x01 : 0x09;
  const ctl = waveCtl(c);
  const baseWave = baseWaveOf(c);
  const mac = (code: number) => macroOf(ins, code);
  const program = (t: number, rows: Array<[number, number]>, loopRow: number): number => {
    const tb = tables[t];
    const pos = tb.left.length + 1;
    for (const [l, r] of rows) { tb.left.push(l); tb.right.push(r); }
    // $FF row: right column is the 1-based row to jump to, 0 stops the program.
    tb.left.push(0xff); tb.right.push(loopRow >= 0 ? pos + loopRow : 0);
    return pos;
  };
  const relStep = (k: number) => (p: number, v: number) => p + (multiplyRel ? s8(v) * k : v);

  // Wave program: c64.cpp writes wave<<4 | ring | sync | gate; GT values below $10 are delays, $E0-$EF are "no waveform".
  const arp = macroTrack(mac(MACRO_ARP), version, 0, false, (_, v) => v, lossy, 'arpeggio');
  const wav = macroTrack(mac(MACRO_WAVE), version, baseWave, false, (_, v) => v & 15, lossy, 'wave');
  const ws = schedule([arp, wav], lossy, 'wave/arpeggio');
  const waveRows: Array<[number, number]> = [];
  for (let t = 0; t < ws.end; t++) {
    const w = (at(wav, t, baseWave) << 4) | ctl;
    // Right column: $80 keeps the pitch, below $80 is a note offset (mod 128), $81-$DF an absolute GT note.
    let r = t ? 0x80 : 0x00;
    if (arp) {
      const v = at(arp, t, 0);
      if (arpIsFixed(v)) {
        const n = arpNv(0, v);
        if (n < 1 || n > 95) lossy.add('fixed arpeggio note outside GT range');
        r = 0x80 | Math.min(95, Math.max(1, n));
      } else r = v & 0x7f;
    }
    waveRows.push([w >= 0x10 ? w : 0xe0 | w, r]);
  }
  g.ptr[0] = program(0, waveRows, ws.loop);

  const duty = macroTrack(mac(MACRO_DUTY), version, c.duty, !c.dutyIsAbs,
    c.dutyIsAbs ? (_, v) => v & 4095 : (p, v) => (p - (multiplyRel ? s8(v) * 4 : v)) & 4095, lossy, 'duty');
  if (c.pulseOn || duty || wav?.vals.some((v) => v & 4)) {
    const ps = schedule([duty], lossy, 'duty');
    const { rows, loopRow, err } = pulseRows(Array.from({ length: ps.end }, (_, t) => at(duty, t, c.duty)), ps.loop, PULSE_TOL);
    if (err) lossy.add(`duty macro steps rounded (up to ${PULSE_TOL}/4096 pulse width)`);
    g.ptr[1] = program(1, rows, loopRow);
  }

  if (c.initFilter) {
    const mode0 = (c.lp ? 1 : 0) | (c.bp ? 2 : 0) | (c.hp ? 4 : 0) | (c.ch3off ? 8 : 0);
    const mode = macroTrack(mac(MACRO_EX1), version, mode0, false, (_, v) => v & 15, lossy, 'filter mode');
    const res = macroTrack(mac(MACRO_EX2), version, c.res & 15, false, (_, v) => v & 15, lossy, 'resonance');
    const cut = macroTrack(mac(MACRO_ALG), version, c.cut, !c.filterIsAbs,
      c.filterIsAbs ? (_, v) => Math.min(2047, v) : (p, v) => Math.min(2047, Math.max(0, relStep(7)(p, v))), lossy, 'cutoff');
    const fs = schedule([mode, res, cut], lossy, 'filter');
    const rows: Array<[number, number]> = [];
    let loopRow = -1, last = '';
    for (let t = 0; t < fs.end; t++) {
      if (t === fs.loop) loopRow = rows.length;
      const md = at(mode, t, mode0), rs = at(res, t, c.res & 15), key = `${md},${rs}`;
      // A $80-$F0 parameter row and the $00 cutoff row after it run in the same frame (player.s mt_setfilt).
      // $D417 low nibble is absolute: route the voices this instrument plays on (Furnace toFilter), never all three.
      // shortcut: the mask is per instrument for the whole song, so a voice stays routed after another instrument takes it
      // over until the next filter program runs; upgrade to a per-note filter command if a song needs it.
      if (key !== last || t === fs.loop) rows.push([0x80 | ((md & 7) << 4), (rs << 4) | (c.toFilter ? voices : 0)]);
      last = key;
      rows.push([0x00, (at(cut, t, c.cut) >> 3) & 0xff]);
    }
    g.ptr[2] = program(2, rows, loopRow);
  } else {
    if (c.toFilter) lossy.add('filter routing without init filter');
    if (mac(MACRO_ALG) || mac(MACRO_EX1) || mac(MACRO_EX2)) lossy.add('filter macros without init filter');
  }
  if (mac(MACRO_VOL)) lossy.add('volume macro (SID master volume)');
  for (const m of ins.macros) if (m.length > 0 && !MACROS_DONE.has(m.code)) lossy.add(`instrument ${idx} macro ${m.code}`);
  return g;
}

export function furnaceToGoatTracker(m: FurnaceModule, subsong: number): GoatSong {
  if (!goatSystemsSupported(m.systems)) {
    throw new Error(`C64 export needs a song with one SID chip; systems are ${m.systems.map((x) => x.toString(16)).join(',')}`);
  }
  const s = m.subsongs[subsong];
  const lossy = new Lossy();
  const tables: GTSongData['tables'] = [0, 1, 2, 3].map(() => ({ left: [] as number[], right: [] as number[] }));
  if (m.instruments.length > GT_MAX_INSTR - 1) lossy.add('instruments past 63', m.instruments.length - (GT_MAX_INSTR - 1));
  const instruments: GTInstrument[] = [emptyGTInstrument()];
  const multiplyRel = /multiplyRel=true/.test(m.chipFlags?.[0] ?? '');
  // Voices each instrument plays on (bit per SID voice), for the filter routing mask.
  const voices = new Array<number>(m.instruments.length).fill(0);
  for (let ch = 0; ch < 3; ch++) for (let o = 0; o < s.ordersLen; o++) {
    for (const cell of m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o] ?? 0}`)?.rows ?? []) if (cell && cell.instrument >= 0) voices[cell.instrument] |= 1 << ch;
  }
  for (let i = 0; i < Math.min(m.instruments.length, GT_MAX_INSTR - 1); i++) instruments.push(instrumentOf(m.instruments[i], i, tables, lossy, m.version, multiplyRel, voices[i]));
  // GT's note table is A-4 = 440 Hz.
  if (Math.abs((m.tuning ?? 440) - 440) > 0.5) lossy.add(`tuning ${m.tuning} Hz (GT plays A-4 = 440 Hz)`);

  const ntsc = furnaceSidNtsc(m);
  if (/clockSel=2/.test(m.chipFlags?.[0] ?? '')) lossy.add('SSI 2001 clock (played on an NTSC C64)');
  if (s.virtualTempo !== s.virtualTempoD) lossy.add('virtual tempo');
  const tempo = Math.max(3, s.speed1), tempo2 = Math.max(3, s.speed2);
  if (Math.min(s.speed1, s.speed2) < 3) lossy.add(`speed ${Math.min(s.speed1, s.speed2)} (GT tempo minimum 3)`);
  // Furnace alternates speed1 / speed2 per row: GT funktempo, one speedtable pair (1-based pointer).
  let funk = 0;
  if (tempo !== tempo2) { tables[3].left.push(tempo); tables[3].right.push(tempo2); funk = tables[3].left.length; }

  // One GT pattern per (Furnace pattern, 128-row slice); shared across channels like Furnace's per-channel patterns are not.
  const patterns: number[][][] = [];
  const byKey = new Map<string, number>();
  const orderlists: number[][] = [[], [], []];
  // Per channel: last played GT note (slide start), instrument, and the arpeggio (0xy) that stays on until 0000.
  const lastNote = [-1, -1, -1], curIns = [-1, -1, -1];
  const arpOn: Array<[number, number] | null> = [null, null, null];
  const arpProgs = new Map<string, number>();
  // Furnace E1xy/E2xy: portaSpeed x*4 times the linear-pitch slide speed (default 4), in 1/128 semitone per tick
  // (measured on yeah!: E2FC slides 187.5 cents per frame). GT slides linearly, so pick the speed that covers the same distance in the same whole number of ticks.
  const slideSemis = (Number(m.compatFlags?.pitchSlideSpeed) || 4) * 4 / 128;
  const slideTicks = (x: number, y: number): number => Math.max(1, Math.round(y / (x * slideSemis)));
  const speedRow = (spd: number): number => {
    const t = tables[3];
    for (let i = 0; i < t.left.length; i++) if (t.left[i] === (spd >> 8) && t.right[i] === (spd & 255) && i + 1 !== funk) return i + 1;
    t.left.push(spd >> 8); t.right.push(spd & 255);
    return t.left.length;
  };
  // Wave program for `ins` playing arpeggio 0xy: base, +x, +y offsets of the instrument's own waveform, one per tick (Furnace arp effect).
  const arpProgram = (ins: number, x: number, y: number): number => {
    const key = `${ins}_${x}_${y}`;
    const have = arpProgs.get(key);
    if (have) return have;
    const c = m.instruments[ins]?.c64;
    const w = ((c ? baseWaveOf(c) : 1) << 4) | (c ? waveCtl(c) : 1);
    const tb = tables[0], pos = tb.left.length + 1;
    for (const off of [0, x, y]) { tb.left.push(w >= 0x10 ? w : 0xe0 | w); tb.right.push(off); }
    tb.left.push(0xff); tb.right.push(pos);
    arpProgs.set(key, pos);
    return pos;
  };
  const sidFreq = (n: number): number => 440 * 2 ** ((n - 57) / 12) * 16777216 / (ntsc ? 1022730 : 985248);
  // After a wave program's waveform row (tick 0): one wave-table slide row per tick ($F1 up / $F2 down; $E0-$EF is a silent waveform) that moves
  // the SID frequency from `base` to sidFreq(base + semisAt(t)), then the stop row. semisAt is called for every tick in order (it may keep state).
  // GT runs the wave table from the frame after note init, so tick 1 catches up Furnace's tick 0 and 1 steps.
  const pushPitchCurve = (base: number, ticks: number, semisAt: (t: number) => number): void => {
    const tb = tables[0];
    let cur = sidFreq(base);
    const ds: number[] = [];
    for (let t = 0; t < ticks; t++) {
      const semis = semisAt(t);
      if (!t) continue;
      const want = Math.round(Math.min(0xffff, sidFreq(base + semis)) - cur);
      const d = Math.sign(want) * Math.min(0x7fff, Math.abs(want)); // player.s: speed left bit 7 means a note-relative speed
      ds.push(d);
      cur += d;
      if (base + semis < 0) break; // below C-0, GT's lowest note: the rest is inaudible
    }
    while (ds.length && !ds[ds.length - 1]) ds.pop(); // the pitch has settled (or hit the SID floor): the stop row holds it
    for (const d of ds) { tb.left.push(0xf0 | (d >= 0 ? 1 : 2)); tb.right.push(speedRow(Math.abs(d))); }
    tb.left.push(0xff); tb.right.push(0);
  };
  // Wave program for E1xy/E2xy on a row WITH a note (toneporta would not retrigger): waveform, then per-tick slide rows that follow Furnace's
  // linear-pitch slide (c64.cpp DIV_CMD_NOTE_PORTA: x*4*pitchSlideSpeed/128 semitone per tick from tick 0, clamped at the target). A constant
  // SID-frequency speed glided too slowly at the top of a downward slide (yeah! voice 3: 1114 vs Furnace 999 one tick in).
  // shortcut: replaces the instrument's own wave/arpeggio program for that note.
  const slideProgs = new Map<string, number>();
  const slideProgram = (ins: number, note: number, dest: number, x: number): number => {
    const key = `${ins}_${note}_${dest}_${x}`;
    const have = slideProgs.get(key);
    if (have) return have;
    const c = m.instruments[ins]?.c64;
    const w = ((c ? baseWaveOf(c) : 1) << 4) | (c ? waveCtl(c) : 1);
    const tb = tables[0], pos = tb.left.length + 1;
    tb.left.push(w >= 0x10 ? w : 0xe0 | w); tb.right.push(0);
    const y = dest - note, step = x * slideSemis;
    pushPitchCurve(note, Math.ceil(Math.abs(y) / step) + 1, (t) => Math.sign(y) * Math.min(Math.abs(y), (t + 1) * step));
    slideProgs.set(key, pos);
    return pos;
  };
  // Ticks each (instrument, GT note) plays before the next note or key-off on its channel (upper bound: the slower speed per row).
  const noteTicks = new Map<string, number>();
  for (let ch = 0; ch < 3; ch++) {
    let ins = -1, key = '', rows = 0;
    const end = () => { if (key) noteTicks.set(key, Math.max(noteTicks.get(key) ?? 0, rows * Math.max(tempo, tempo2))); };
    for (let o = 0; o < s.ordersLen; o++) {
      const src = m.patterns.get(`${subsong}_${ch}_${s.orders[ch]?.[o] ?? 0}`);
      for (let r = 0; r < s.patLen; r++) {
        const cell = src?.rows[r];
        const nv = cell ? convertFurnaceNoteValue(cell) : -1;
        if (cell && cell.instrument >= 0) ins = cell.instrument;
        if (nv >= 0 || nv === 253 || nv === 254) { end(); key = nv >= 0 ? `${ins}_${nv}` : ''; rows = 0; }
        rows++;
      }
    }
    end();
  }
  // Wave program for a note of an instrument with a pitch macro (Furnace c64.cpp: relative mode adds the value to pitch2 each step,
  // absolute mode sets it; linear pitch, 1/128 semitone): the instrument's waveform row, then one wave-table slide row per tick that moves
  // the SID frequency to Furnace's for that tick (same mechanism as slideProgram). SID frequency steps depend on the note, so one program per note.
  // shortcut: needs a one-row instrument wave program (no stepping wave/arpeggio macro); Furnace's tick 0 offset lands on tick 1.
  // Built after the pattern pass (pitchPending) so they only take the table rows the other wave programs leave free; the pattern
  // pass stores -(index + 1) as a placeholder in the set-wave-pointer data byte.
  const pitchPending: string[] = [];
  const pitchRef = (ins: number, note: number): number => {
    const key = `${ins}_${note}`;
    let i = pitchPending.indexOf(key);
    if (i < 0) i = pitchPending.push(key) - 1;
    return -(i + 1);
  };
  const pitchProgram = (key: string, left: number): number => {
    const [ins, note] = key.split('_').map(Number);
    const own = instruments[ins + 1].ptr[0];
    const mac = macroOf(m.instruments[ins], MACRO_PITCH);
    const tb = tables[0];
    let pos = 0;
    if (mac && own > 0 && tb.left[own] === 0xff && tb.right[own] === 0) {
      const p = expandProcMacro(mac, m.version), sp = Math.max(1, p.speed), dl = Math.max(0, p.delay);
      // Value index per tick (-1: no step this tick); loop jumps back to the loop value, so relative steps keep adding.
      const step = (t: number): number => {
        if (t < dl || (t - dl) % sp) return -1;
        let i = (t - dl) / sp;
        if (i >= p.length) { if (p.loop === 0xff || p.loop >= p.length) return -1; i = p.loop + ((i - p.loop) % (p.length - p.loop)); }
        return i;
      };
      const r0 = tb.right[own - 1];
      const base = r0 === 0 || r0 === 0x80 ? note : r0 > 0x80 ? r0 & 0x7f : note + (r0 >= 0x60 ? r0 - 0x80 : r0);
      // Rows left: the waveform row and the stop row, plus one speed row per tick at worst.
      // Each program still to build gets an equal share, so every note keeps its attack sweep when the table is short.
      const room = Math.floor(Math.min(253 - tb.left.length, 255 - tables[3].left.length) / left);
      const want = Math.min(MAX_PROGRAM_TICKS, noteTicks.get(key) ?? MAX_PROGRAM_TICKS);
      if (room < 2) lossy.add('pitch macro (GT table full)');
      else {
        if (want - 1 > room) lossy.add('pitch macro (cut short: GT table full)');
        const ticks = Math.min(want, room + 1);
        pos = tb.left.length + 1;
        tb.left.push(tb.left[own - 1]); tb.right.push(r0);
        let pitch = 0;
        pushPitchCurve(base, ticks, (t) => {
          const i = step(t);
          if (i >= 0) pitch = p.mode ? Math.max(-65535, Math.min(65535, pitch + p.data[i])) : p.data[i];
          return pitch / 128;
        });
      }
    } else if (mac) lossy.add('pitch macro with a stepping wave/arpeggio program');
    return pos;
  };
  const slices = Math.ceil(s.patLen / GT_MAX_ROWS);
  for (let ch = 0; ch < 3; ch++) {
    for (let o = 0; o < s.ordersLen; o++) {
      const pat = s.orders[ch]?.[o] ?? 0;
      for (let sl = 0; sl < slices; sl++) {
        const first = ch === 0 && o === 0 && sl === 0;
        // Effects carry state (last note, arpeggio), so every play is built and patterns are shared by their rows.
        const rows: number[][] = [];
        const src = m.patterns.get(`${subsong}_${ch}_${pat}`);
        for (let r = sl * GT_MAX_ROWS; r < Math.min(s.patLen, (sl + 1) * GT_MAX_ROWS); r++) {
          const cell = src?.rows[r];
          let note = GT_REST, ins = 0, cmd = 0, data = 0;
          if (cell) {
            const nv = convertFurnaceNoteValue(cell);
            if (nv === 253 || nv === 254) note = GT_KEYOFF;
            else if (nv === 255) lossy.add('macro release');
            else if (nv >= 0) {
              const gt = nv; // both count C-0 = 0 (measured: Furnace nv 19 = G-1 plays $032D at NTSC, GT note 19 too)
              if (gt < 0 || gt > 95) lossy.add('note outside GT range');
              else { note = GT_FIRSTNOTE + gt; lastNote[ch] = gt; }
            }
            if (cell.instrument >= 0) {
              curIns[ch] = cell.instrument;
              if (cell.instrument < GT_MAX_INSTR - 1) ins = cell.instrument + 1;
              else lossy.add('instrument past 63');
            }
            if (cell.volume >= 0) lossy.add('volume column');
            let arpSeen = false;
            for (const e of cell.effects) {
              if (e.type < 0) continue;
              const t = e.type, v = Math.max(0, e.value), name = t.toString(16).padStart(2, '0');
              let c = 0, d = 0;
              if (t === 0x00) {
                if (!v && !arpOn[ch]) continue; // 0000 with no arpeggio running is no effect
                arpSeen = true; arpOn[ch] = v ? [v >> 4, v & 15] : null;
                if (curIns[ch] < 0 || !m.instruments[curIns[ch]]?.c64 || curIns[ch] >= GT_MAX_INSTR - 1) lossy.add('effect 00 (arpeggio without an SID instrument)');
                else { c = 8; d = v ? arpProgram(curIns[ch], v >> 4, v & 15) : instruments[curIns[ch] + 1].ptr[0]; }
              } else if (t === 0x11) { c = 0x0c; d = coarseCutoffByte(v); }
              else if (t >= 0x40 && t <= 0x47) { c = 0x0c; d = fineCutoffByte(t, v); }
              else if ((t === 0xe1 || t === 0xe2) && note === GT_REST && lastNote[ch] >= 0 && v >> 4) {
                // Slide without a note on the row: GT toneportamento to the note y semitones away at Furnace's speed x*4 (SID frequency units per tick).
                const dest = lastNote[ch] + (t === 0xe1 ? 1 : -1) * (v & 15);
                if (dest < 0 || dest > 95) lossy.add(`effect ${name} (target outside GT range)`);
                else { note = GT_FIRSTNOTE + dest; c = 3; d = speedRow(Math.max(1, Math.round(Math.abs(sidFreq(dest) - sidFreq(lastNote[ch])) / slideTicks(v >> 4, v & 15)))); lastNote[ch] = dest; }
              } else if ((t === 0xe1 || t === 0xe2) && note !== GT_REST && note !== GT_KEYOFF && v >> 4 && curIns[ch] >= 0 && m.instruments[curIns[ch]]?.c64 && curIns[ch] < GT_MAX_INSTR - 1) {
                const dest = lastNote[ch] + (t === 0xe1 ? 1 : -1) * (v & 15);
                if (dest < 0 || dest > 95 || !(v & 15)) lossy.add(`effect ${name} (target outside GT range)`);
                else { c = 8; d = slideProgram(curIns[ch], lastNote[ch], dest, v >> 4); lastNote[ch] = dest; }
              } else if (t === 0x14) lossy.add('effect 14 (filter mode; GT sets it in a filter program only)');
              else lossy.add(`effect ${name}`);
              if (c) { if (cmd) lossy.add(`effect ${name} (second command on the row)`); else { cmd = c; data = d; } }
            }
            // Furnace keeps an arpeggio on until 0000; a new note restarts the instrument's own wave program in GT, so re-arm it.
            const ar = arpOn[ch];
            if (!arpSeen && !cmd && ar && note !== GT_REST && note !== GT_KEYOFF && curIns[ch] >= 0 && curIns[ch] < GT_MAX_INSTR - 1) { cmd = 8; data = arpProgram(curIns[ch], ar[0], ar[1]); }
            const ci = curIns[ch];
            if (note !== GT_REST && note !== GT_KEYOFF && ci >= 0 && ci < GT_MAX_INSTR - 1 && macroOf(m.instruments[ci], MACRO_PITCH)) {
              if (cmd) lossy.add('pitch macro on a row with a wave command (dropped)');
              else { cmd = 8; data = pitchRef(ci, lastNote[ch]); }
            }
          }
          if (first && r === 0) { cmd = funk ? CMD_FUNKTEMPO : CMD_SETTEMPO; data = funk || tempo; }
          rows.push([note, ins, cmd, data]);
        }
        const key = first ? 'tempo' : JSON.stringify(rows);
        let gi = byKey.get(key);
        if (gi === undefined) { gi = patterns.length; patterns.push(rows); byKey.set(key, gi); }
        orderlists[ch].push(gi);
      }
    }
    orderlists[ch].push(GT_LOOPSONG, 0);
  }
  const pitchPos = pitchPending.map((k, i) => pitchProgram(k, pitchPending.length - i));
  for (const rows of patterns) for (const r of rows) if (r[2] === 8 && r[3] < 0) { r[3] = pitchPos[-r[3] - 1]; if (!r[3]) r[2] = 0; }
  if (patterns.length > GT_MAX_PATT) throw new Error(`song needs ${patterns.length} GT patterns (maximum ${GT_MAX_PATT})`);
  for (let t = 0; t < 3; t++) if (tables[t].left.length > 255) throw new Error(`GT table ${t} overflows (${tables[t].left.length} rows)`);

  const song: GTSongData = { name: m.name.slice(0, 32), author: m.author.slice(0, 32), copyright: '', orderlists: [orderlists], instruments, tables, patterns };
  return { song, settings: { multiplier: 1, ntsc, adparam: 0x0f00, optimizeRealtime: true }, hz: s.hz, lossy: lossy.list() };
}
