/**
 * JasonBrookeGrid.ts - the tick grid of the Jason Brooke driver, version A (third-party/nuade/players/jasonbrooke:
 * jb_locate.c finds the tables from instruction patterns, jb_a.c is the sequencer). The tables are located the same way:
 * pc-relative operands of `lea`/`move.w` instructions near the interrupt routine. Subsong 0: voice i has a track (end,
 * loop, list) in the song record; the list holds one stream offset per position (2 bytes each), a NextTrack command moves
 * to the next. Stream bytes, old syntax: 0..$7F note, $80..limit-1 command, $A0 sample, $C0 envelope, $E0 row length;
 * new syntax: below the limit row length, $41..$5F command, $60.. envelope, $80..$DF note, $E0 sample. A note or a Rest
 * command ends a row; the row lasts row_length steps, a step is 256/tempo ticks.
 * Each stream (from its first byte to its NextTrack/Stop) is a file block whose `blockRows` carry its bytes; `noteBytes`
 * name the note byte of the event that plays each grid cell (docs/FORMAT_COMMAND_STREAM_GRID.md).
 * shortcut: version A only (the early version B driver keeps the placeholder grid); each voice plays to its first track
 * list wrap; the pitch sequence (arpeggio) and the slide/vibrato are not in the grid note; a stream played again shows on
 * every play but only the first play writes back; the grid row is the gcd of the row lengths in steps.
 */
import type { Pattern } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { jasonBrookeEncoder } from '@/engine/uade/encoders/JasonBrookeEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';
import { gcd, emptyCell, carrierRows } from './SeanConnollyGrid';

const NUM_CHANNELS = 4;
const MAX_ROWS = 4096;
const MAX_STEPS = 20000;
const SEARCH = 0x600;

type Cmd = 'rest' | 'clear' | 'slide' | 'down' | 'up' | 'next' | 'vibrato' | 'stop' | 'transpose' | 'adkcon' | 'tie' | 'tieNoEnv'
  | 'noEnv' | 'pwm' | 'volume' | 'skip' | 'globalTranspose' | 'tempo' | 'arp' | 'loopStart' | 'loopTwice' | 'loopEnd' | 'invalid';
/** Data bytes each command reads after its own byte (jb_a.c run_command). */
const ARGS: Partial<Record<Cmd, number>> = {
  slide: 3, vibrato: 2, transpose: 1, adkcon: 1, pwm: 3, volume: 1, skip: 1, globalTranspose: 1, tempo: 1, arp: 1, loopStart: 1,
};

const u8 = (b: Uint8Array, o: number): number => (o >= 0 && o < b.length ? b[o] : 0);
const u16 = (b: Uint8Array, o: number): number => (u8(b, o) << 8) | u8(b, o + 1);
const s16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const pc16 = (b: Uint8Array, e: number): number => e + s16(b, e);
const pc8 = (b: Uint8Array, e: number): number => e + ((u8(b, e + 1) << 24) >> 24);

/** jbm_find: first match at an even offset in [from, to); a pattern is words of four hex digits, "x" matches any. */
function find(b: Uint8Array, from: number, to: number, pattern: string): number {
  const words = pattern.split(' ').map((w) => ({ v: parseInt(w.replace(/x/g, '0'), 16), m: parseInt(w.replace(/[0-9a-f]/g, 'f').replace(/x/g, '0'), 16) }));
  for (let at = (from + 1) & ~1; at + 2 * words.length <= b.length && at < to; at += 2) {
    if (words.every((w, i) => (u16(b, at + 2 * i) & w.m) === w.v)) return at;
  }
  return -1;
}

function findVersionA(b: Uint8Array): number {
  for (let at = 0xac; at <= 0xac + 50; at += 2) {
    if (u16(b, at) !== 0x48e7) continue;
    const reg = u16(b, at + 2);
    const u32 = (o: number) => ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0;
    const ok = (reg === 0xf8fc || reg === 0xf8f8) && u32(at + 4) === 0x08f90001 && u32(at + 8) === 0x00bfe001 && u32(at + 12) === 0x33fc0780
      && u32(at + 16) === 0x00dff09a && u16(b, at + 20) === 0x47fa && at + 22 + u16(b, at + 22) === 0x10000;
    return ok ? at : -1;
  }
  return -1;
}

function classify(b: Uint8Array, globals: number, newSyntax: boolean, h: number): Cmd {
  const w = [0, 2, 4, 6].map((k) => u16(b, h + k));
  switch (w[0]) {
    case 0x4a28: return 'rest';
    case 0x4210: return 'clear';
    case 0x1159: {
      const transpose = newSyntax ? 0x1a : 0x18;
      const volume = newSyntax ? 0x12 : 0x10;
      if (w[1] === 0x08) return 'slide';
      if (w[2] === 0x1019) return 'vibrato';
      if (w[2] === 0x93cb) return 'loopStart';
      if (w[1] === transpose) return 'transpose';
      if (w[1] === volume) return 'volume';
      return newSyntax && w[1] === 0x1c ? 'arp' : 'invalid';
    }
    case 0x08d0:
      if (w[1] === 7 && w[2] === 0x08d0 && w[3] === 3) return 'down';
      if (w[1] === 3) return 'up';
      if (w[1] === 5) return w[2] === 0x08d0 && w[3] === 1 ? 'tieNoEnv' : 'tie';
      return w[1] === 1 ? 'noEnv' : 'invalid';
    case 0x1028: return w[1] === 1 ? 'next' : 'invalid';
    case 0x7600: return 'stop';
    case 0x1219: return 'adkcon';
    case 0x117c: return w[1] === 2 ? 'loopTwice' : 'invalid';
    case 0x5328: return 'loopEnd';
    case 0x1759:
      if (w[2] === 0x1759) return 'pwm';
      return w[1] - globals === 5 ? 'tempo' : w[1] - globals === 12 ? 'globalTranspose' : 'skip';
    default: return 'invalid';
  }
}

export interface JbTables {
  noteLimit: number; newSyntax: boolean; songs: number; periods: number; samples: number; globalTranspose: boolean;
  commands: Cmd[];
}

export function jasonBrookeATables(b: Uint8Array): JbTables | null {
  const entry = findVersionA(b);
  if (entry < 0) return null;
  const end = entry + SEARCH;
  const at = (p: string, from = entry, to = end) => find(b, from, to, p);
  const g = at('383c 00xx'); const lim = at('143c 00xx'); const syn = at('1019 b002');
  const env = at('43fa xxxx 4a28');
  if (g < 0 || lim < 0 || syn < 0 || env < 0) return null;
  const seq = at('1031 10xx', env);
  const per = seq < 0 ? -1 : at('323b 00xx', seq);
  const smp = at('c2fc 000a 45fa xxxx');
  const song = at('43fa xxxx 4880 c0fc 0012');
  const cmd = at('d4fb 00xx 4ed2');
  if (per < 0 || smp < 0 || song < 0 || cmd < 0) return null;
  const globals = 4 * u8(b, g + 3);
  const newSyntax = u8(b, syn + 4) === 0x6d;
  const noteLimit = u8(b, lim + 3);
  const count = newSyntax ? 0x1f : noteLimit - 0x80;
  if (count < 0 || count > 64) return null;
  const table = pc8(b, cmd + 2);
  const commands = Array.from({ length: count }, (_, i) => classify(b, globals, newSyntax, u16(b, table + 2 * i)));
  return { noteLimit, newSyntax, songs: pc16(b, song + 2), periods: pc8(b, per + 2), samples: pc16(b, smp + 6), globalTranspose: u16(b, per - 6) === 0xd03a, commands };
}

interface JbEvent { step: number; at: number; period: number; sample: number }
interface JbWalk { events: JbEvent[]; blocks: Array<{ start: number; end: number }>; steps: number }

type Decoded = { kind: 'param' } | { kind: 'note'; note: number } | { kind: 'cmd'; cmd: Cmd };

function walkVoice(b: Uint8Array, t: JbTables, voice: number): JbWalk | null {
  const rec = t.songs + voice * 4 + 1; // first song record only (subsong 0): tempo byte, then 4 x (end, loop, list)
  const trackEnd = u8(b, rec);
  const trackLoop = u8(b, rec + 1);
  const list = u16(b, rec + 2);
  const off = (v: number) => (v << 16) >> 16;
  let position = 0;
  let p = off(u16(b, off(list)));
  let tempo = u8(b, t.songs);
  let rowLength = 1;
  let sample = 0;
  let sampleNext = 0;
  let transpose = 0;
  let globalTranspose = 0;
  let loopCount = 0;
  let loopPos = 0;
  let step = 0;
  let steps = 0;
  const events: JbEvent[] = [];
  const blocks: Array<{ start: number; end: number }> = [];
  let blockStart = p;
  for (let guard = 0; guard < MAX_STEPS; guard++) {
    // one row: read bytes until a note or a Rest
    let ended = false;
    for (let n = 0; n < 4096 && !ended; n++) {
      const byte = u8(b, p++);
      let d: Decoded;
      if (t.newSyntax) {
        if (byte >= 0x80 && byte < 0xe0) d = { kind: 'note', note: byte - 0x80 };
        else if (byte >= 0xe0) { sampleNext = byte - 0xe0; d = { kind: 'param' }; }
        else if (byte < t.noteLimit) { rowLength = byte; d = { kind: 'param' }; }
        else if (byte >= 0x60) d = { kind: 'param' };
        else { const i = byte - 0x41; d = { kind: 'cmd', cmd: t.commands[i] ?? 'invalid' }; }
      } else if (byte < 0x80) d = { kind: 'note', note: byte };
      else if (byte < t.noteLimit) d = { kind: 'cmd', cmd: t.commands[byte - 0x80] ?? 'invalid' };
      else {
        if (byte >= 0xe0) rowLength = byte - 0xdf;
        else if (byte >= 0xa0 && byte < 0xc0) sampleNext = byte - 0xa0;
        d = { kind: 'param' };
      }
      if (d.kind === 'note') {
        sample = sampleNext;
        const mult = u16(b, t.samples + 10 * sample);
        const pitch = (d.note + transpose + (t.globalTranspose ? globalTranspose : 0)) & 0xff;
        const period = ((u16(b, t.periods + ((pitch << 1) & 0x1fe)) * mult) << 3 >>> 16) & 0xffff;
        events.push({ step, at: p - 1, period, sample });
        ended = true;
      } else if (d.kind === 'cmd') {
        const arg = p;
        p += ARGS[d.cmd] ?? 0;
        switch (d.cmd) {
          case 'rest': ended = true; break;
          case 'transpose': transpose = u8(b, arg); break;
          case 'globalTranspose': globalTranspose = u8(b, arg); break;
          case 'tempo': tempo = u8(b, arg); break;
          case 'loopStart': loopCount = u8(b, arg); loopPos = p; break;
          case 'loopTwice': loopCount = 2; loopPos = p; break;
          case 'loopEnd': loopCount = (loopCount - 1) & 0xff; if (loopCount !== 0) p = loopPos; break;
          case 'stop': blocks.push({ start: blockStart, end: p }); return { events, blocks, steps: step };
          case 'invalid': return null;
          case 'next': {
            blocks.push({ start: blockStart, end: p });
            position = (position + 2) & 0xff;
            if (position === trackEnd) return { events, blocks, steps: step + rowLength };
            p = off(u16(b, off((list + position) & 0xffff)));
            blockStart = p;
            break;
          }
          default: break;
        }
      }
    }
    if (!ended) return null;
    step += rowLength;
    steps += rowLength;
    if (tempo === 0) return null;
  }
  void trackLoop;
  return blocks.length ? { events, blocks, steps } : null;
}

export interface JbGrid { pattern: Pattern; layout: UADEVariablePatternLayout; rowTicks: number }

/** The grid and layout of subsong 0 of a version A module, or null when it is not one or leaves the file. */
export function buildJasonBrookeGrid(buf: Uint8Array): JbGrid | null {
  const t = jasonBrookeATables(buf);
  if (!t) return null;
  const voices: JbEvent[][] = [];
  const spans = new Map<number, number>();
  for (let v = 0; v < NUM_CHANNELS; v++) {
    const w = walkVoice(buf, t, v);
    if (!w) return null;
    voices.push(w.events);
    for (const x of w.blocks) spans.set(x.start, Math.max(spans.get(x.start) ?? 0, x.end));
  }
  // streams entered mid-way into another one share its bytes: merge overlapping spans into one block
  const blocks: Array<{ start: number; size: number }> = [];
  for (const [start, end] of [...spans].sort((x, y) => x[0] - y[0])) {
    const last = blocks[blocks.length - 1];
    if (last && start < last.start + last.size) last.size = Math.max(last.size, end - last.start);
    else blocks.push({ start, size: end - start });
  }
  if (!blocks.length || blocks.some((x) => x.start < 0 || x.start + x.size > buf.length)) return null;

  const all = voices.flat();
  const gaps = all.flatMap((e, i, l) => [e.step, l[i + 1] && l[i + 1].step > e.step ? l[i + 1].step - e.step : 0]);
  const rowSteps = Math.max(1, gaps.reduce(gcd, 0));
  const lastStep = Math.max(0, ...all.map((e) => e.step));
  const rowCount = Math.min(MAX_ROWS, Math.max(1, Math.floor(lastStep / rowSteps) + 1));
  const pattern: Pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: rowCount,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: rowCount }, emptyCell),
    })),
  };
  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  const written = new Set<number>();
  voices.forEach((events, channel) => {
    for (const e of events) {
      const row = Math.floor(e.step / rowSteps);
      if (row >= rowCount) break;
      const cell = pattern.channels[channel].rows[row];
      const note = e.period ? periodToGridNote(e.period) : 0;
      if (cell.note !== 0 || note === 0) continue;
      cell.note = note;
      cell.instrument = e.sample + 1;
      if (!written.has(e.at)) { written.add(e.at); noteBytes.push({ pattern: 0, channel, row, offset: e.at, note }); }
    }
  });
  const tempo = Math.max(1, u8(buf, t.songs));
  const rowTicks = Math.max(1, Math.round(((256 + tempo / 2) >> 0) / tempo * rowSteps));
  const layout: UADEVariablePatternLayout = {
    formatId: 'jasonBrooke', numChannels: NUM_CHANNELS, numFilePatterns: blocks.length, rowsPerPattern: rowCount,
    moduleSize: buf.length, encoder: jasonBrookeEncoder,
    filePatternAddrs: blocks.map((x) => x.start), filePatternSizes: blocks.map((x) => x.size),
    trackMap: [Array.from({ length: NUM_CHANNELS }, () => -1)],
    blockRows: blocks.map((x) => carrierRows(buf, x.start, x.size)),
    noteBytes,
  };
  return { pattern, layout, rowTicks };
}
