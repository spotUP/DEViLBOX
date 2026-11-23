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
const MACRO_VOL = 0, MACRO_ARP = 1, MACRO_DUTY = 2, MACRO_WAVE = 3, MACRO_EX1 = 5, MACRO_EX2 = 6, MACRO_ALG = 8;
const MACROS_DONE = new Set([MACRO_VOL, MACRO_ARP, MACRO_DUTY, MACRO_WAVE, MACRO_EX1, MACRO_EX2, MACRO_ALG]);
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
  const ctl = (c.ringMod ? 0x04 : 0) | (c.oscSync ? 0x02 : 0) | 0x01;
  const baseWave = (c.noiseOn ? 8 : 0) | (c.pulseOn ? 4 : 0) | (c.sawOn ? 2 : 0) | (c.triOn ? 1 : 0);
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
    const rows: Array<[number, number]> = [];
    for (let t = 0; t < ps.end; t++) { const d = at(duty, t, c.duty); rows.push([0x80 | ((d >> 8) & 15), d & 0xff]); }
    g.ptr[1] = program(1, rows, ps.loop);
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
  const slices = Math.ceil(s.patLen / GT_MAX_ROWS);
  for (let ch = 0; ch < 3; ch++) {
    for (let o = 0; o < s.ordersLen; o++) {
      const pat = s.orders[ch]?.[o] ?? 0;
      for (let sl = 0; sl < slices; sl++) {
        const first = ch === 0 && o === 0 && sl === 0;
        const key = first ? 'tempo' : `${ch}_${pat}_${sl}`;
        let gi = byKey.get(key);
        if (gi === undefined) {
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
                else note = GT_FIRSTNOTE + gt;
              }
              if (cell.instrument >= 0) {
                if (cell.instrument < GT_MAX_INSTR - 1) ins = cell.instrument + 1;
                else lossy.add('instrument past 63');
              }
              if (cell.volume >= 0) lossy.add('volume column');
              for (const e of cell.effects) if (e.type >= 0) lossy.add(`effect ${e.type.toString(16).padStart(2, '0')}`);
            }
            if (first && r === 0) { cmd = funk ? CMD_FUNKTEMPO : CMD_SETTEMPO; data = funk || tempo; }
            rows.push([note, ins, cmd, data]);
          }
          gi = patterns.length;
          patterns.push(rows);
          byKey.set(key, gi);
        }
        orderlists[ch].push(gi);
      }
    }
    orderlists[ch].push(GT_LOOPSONG, 0);
  }
  if (patterns.length > GT_MAX_PATT) throw new Error(`song needs ${patterns.length} GT patterns (maximum ${GT_MAX_PATT})`);
  for (let t = 0; t < 3; t++) if (tables[t].left.length > 255) throw new Error(`GT table ${t} overflows (${tables[t].left.length} rows)`);

  const song: GTSongData = { name: m.name.slice(0, 32), author: m.author.slice(0, 32), copyright: '', orderlists: [orderlists], instruments, tables, patterns };
  return { song, settings: { multiplier: 1, ntsc, adparam: 0x0f00, optimizeRealtime: true }, hz: s.hz, lossy: lossy.list() };
}
