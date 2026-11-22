/**
 * MikeDaviesParser.ts - Mike Davies Amiga game music (md.*), a memory image of the game's driver plus its song data.
 * Playback is the nuade port (third-party/nuade/players/mikedavies); this parser only reads subsong 0.
 *
 * Grammar (md_module.c, mikedavies.c): the tables are found by the operands of the driver code (the eagleplayer's
 * InitPlayer search). Pointers in the file are image addresses: offset = pointer - image_base. Each of four voices has a
 * track of word entries: a note (index below $80) followed by its duration in ticks, or a command: $94 track end, $95
 * call (repeats, transpose, long track), $9D loop back, $9E loop start (count), $FF restart, $FE stop, any other
 * value an instrument number (value & $7F). The note plays period table[note + call transpose + instrument transpose].
 * Only the word-track versions that do not interpolate (Strider, Strider II, Dynasty Wars, Die Hard II, Indiana Jones),
 * measured on strider.md, are read; any other version keeps an empty grid with no layout.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): each track is a file block whose `blockRows` carry its bytes; the
 * display is one pattern, a row per gcd of the note durations, with `noteBytes` naming the note word of the first event
 * that plays at each cell.
 * shortcut: a note word played again (a called track, a loop) is shown on every play but only its first play writes
 * back; a note 0, a call inside a called track and a main track end stop that voice's grid. Upgrade if a song needs it.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { mikeDaviesEncoder } from '@/engine/uade/encoders/MikeDaviesEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

const NUM_CHANNELS = 4;
const MAX_TICKS = 24000;
const MAX_ROWS = 4096;
const MAX_STEPS = 200000;
const OP_MOVEM = 0x48e7fffe;
const OP_ENABLE = 0x33fc0001;
const CMD_END = 0x94;
const CMD_CALL = 0x95;
const CMD_LOOP_NEXT = 0x9d;
const CMD_LOOP_START = 0x9e;
const CMD_RESTART = 0xff;
const CMD_STOP = 0xfe;
/** Period table offset of each supported version (all: command end $94, word tracks, no interpolation). */
const SUPPORTED_PERIODS = new Set([0x598, 0x59c, 0x4aa, 0x4ac, 0x4ae]);

const u16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : -1);
const s16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const u32 = (b: Uint8Array, o: number): number => (o >= 0 && o + 3 < b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : -1);

function findWord(b: Uint8Array, from: number, w: number): number {
  for (let o = from; o + 1 < b.length; o += 2) if (u16(b, o) === w) return o;
  return -1;
}
function findLong(b: Uint8Array, from: number, v: number): number {
  for (let o = from; o + 3 < b.length; o += 2) if (u32(b, o) === v >>> 0) return o;
  return -1;
}

interface MdTables { base: number; subsongs: number; subsongCount: number; instruments: number; instrumentsLimit: number; periods: number }

/** The tables named by the operands of the driver code, or null when the module is not a supported version. */
export function mikeDaviesTables(b: Uint8Array): MdTables | null {
  const init = findLong(b, 0, OP_MOVEM);
  if (init < 0) return null;
  const en = findLong(b, init, OP_ENABLE);
  if (en < 0) return null;
  const base = u32(b, en + 4);
  let at = findWord(b, en + 4, 0x41f9);
  if (at < 0) return null;
  const subsongsOp = at + 2;
  at = findWord(b, subsongsOp, 0xb1fc);
  if (at < 0) return null;
  const subsongsEndOp = at + 2;
  at = findWord(b, subsongsEndOp, 0x41f9);
  if (at < 0) return null;
  const sfxOp = at + 2;
  at = findWord(b, sfxOp, 0xb1fc);
  if (at < 0) return null;
  at = findWord(b, at + 2, 0x303c);
  if (at < 0) return null;
  let tick = -1;
  for (let from = at + 2; (tick = findLong(b, from, OP_MOVEM)) >= 0; from = tick + 2) if (u16(b, tick + 8) === 0x6100) break;
  if (tick < 0) return null;
  at = findWord(b, tick, 0x41f9);
  if (at < 0) return null;
  const instOp = at + 2;
  at = findWord(b, instOp, 0xb1fc);
  if (at < 0) return null;
  const instEndOp = at + 2;
  at = findWord(b, instEndOp, 0x4bf9);
  if (at < 0) return null;
  const periodsOp = at + 2;
  const subsongs = u32(b, subsongsOp) - base;
  const subsongCount = Math.floor((u32(b, subsongsEndOp) - u32(b, subsongsOp)) / 16);
  const periods = u32(b, periodsOp) - base;
  const tables = { base, subsongs, subsongCount, instruments: u32(b, instOp) - base, instrumentsLimit: u32(b, instEndOp) - base, periods };
  if (!SUPPORTED_PERIODS.has(periods) || subsongCount < 1 || subsongCount > 0x800) return null;
  if (subsongs < 0 || subsongs + subsongCount * 16 > b.length || tables.instruments < 0 || tables.instrumentsLimit > b.length) return null;
  return tables;
}

/** Bytes of the track entry at `o`, or 0 for a terminator. */
function entryBytes(code: number): number {
  if (code < 0x80) return 4;
  if (code === CMD_CALL) return 10;
  if (code === CMD_LOOP_START) return 4;
  return 2;
}
const isTerminator = (code: number): boolean => code === CMD_END || code === CMD_RESTART || code === CMD_STOP;

/** Start and size of the track at `start` (up to and including its terminator), or null when it leaves the file. */
function trackExtent(b: Uint8Array, start: number): { start: number; size: number; calls: number[] } | null {
  const calls: number[] = [];
  let p = start;
  for (let n = 0; n < MAX_STEPS; n++) {
    const code = u16(b, p);
    if (code < 0 || start < 0) return null;
    if (code === CMD_CALL) calls.push(u32(b, p + 6));
    if (isTerminator(code)) return { start, size: p + 2 - start, calls };
    p += entryBytes(code);
  }
  return null;
}

interface MdEvent { tick: number; note: number; at: number; period: number; inst: number }
interface MdTrackState { pos: number; start: number; transpose: number; loopPos: number; loopCount: number }

function playVoice(b: Uint8Array, t: MdTables, mainStart: number): MdEvent[] | null {
  const events: MdEvent[] = [];
  const main: MdTrackState = { pos: mainStart, start: mainStart, transpose: 0, loopPos: 0, loopCount: 0 };
  let called = null as MdTrackState | null;
  let repeats = 0;
  let tick = 0;
  let inst = -1;
  let instTranspose = 0;
  for (let n = 0; n < MAX_STEPS && tick < MAX_TICKS; n++) {
    const tr: MdTrackState = called ?? main;
    const code = u16(b, tr.pos);
    if (code < 0) return null;
    if (code < 0x80) {
      const dur = u16(b, tr.pos + 2);
      if (code === 0 || dur < 1) return events;
      const pi = code + tr.transpose + instTranspose;
      const period = pi >= 0 ? u16(b, t.periods + pi * 2) : -1;
      events.push({ tick, note: code, at: tr.pos, period: period > 0 ? period : 0, inst });
      tick += dur;
      tr.pos += 4;
    } else if (code === CMD_END) {
      if (!called) return events;
      repeats = (repeats - 1) & 0xffff;
      if (repeats === 0) called = null;
      else called.pos = called.start;
    } else if (code === CMD_CALL) {
      if (called) return events;
      const target: number = u32(b, tr.pos + 6) - t.base;
      repeats = u16(b, tr.pos + 2);
      main.pos += 10;
      called = { pos: target, start: target, transpose: s16(b, tr.pos + 4), loopPos: 0, loopCount: 0 };
    } else if (code === CMD_LOOP_NEXT) {
      tr.loopCount = (tr.loopCount - 1) & 0xffff;
      tr.pos = tr.loopCount === 0 ? tr.pos + 2 : tr.loopPos;
    } else if (code === CMD_LOOP_START) {
      tr.loopCount = u16(b, tr.pos + 2);
      tr.pos += 4;
      tr.loopPos = tr.pos;
    } else if (code === CMD_RESTART || code === CMD_STOP) {
      return events;
    } else {
      inst = code & 0x7f;
      const rec = t.instruments + inst * 0x18;
      instTranspose = rec + 0x18 > t.instrumentsLimit ? 0 : s16(b, rec + 18);
      tr.pos += 2;
    }
  }
  return events;
}

const gcd = (a: number, c: number): number => (c === 0 ? a : gcd(c, a % c));

function carrierRows(b: Uint8Array, start: number, size: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  for (let p = start; p < start + size;) {
    const n = Math.min(3, start + size - p);
    rows.push({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      cutoff: n, period: b[p], pan: n > 1 ? b[p + 1] : 0, resonance: n > 2 ? b[p + 2] : 0,
    } as TrackerCell);
    p += n;
  }
  return rows;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export function isMikeDaviesFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return mikeDaviesTables(data) !== null;
}

export function parseMikeDaviesFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const name = filename.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');
  const t = mikeDaviesTables(buf);

  let ok = t !== null;
  const voices: MdEvent[][] = [];
  const blocks: Array<{ start: number; size: number }> = [];
  if (t) {
    const mains = Array.from({ length: NUM_CHANNELS }, (_, v) => u32(buf, t.subsongs + v * 4));
    const queue = mains.filter((a) => a !== 0xffffffff).map((a) => a - t.base);
    const seen = new Set<number>();
    while (queue.length && ok) {
      const start = queue.shift()!;
      if (seen.has(start)) continue;
      seen.add(start);
      const ext = trackExtent(buf, start);
      if (!ext || blocks.length > 512) { ok = false; break; }
      blocks.push({ start: ext.start, size: ext.size });
      queue.push(...ext.calls.map((a) => a - t.base));
    }
    blocks.sort((a, c) => a.start - c.start);
    for (let i = 1; i < blocks.length && ok; i++) ok = blocks[i - 1].start + blocks[i - 1].size <= blocks[i].start;
    for (let v = 0; v < NUM_CHANNELS && ok; v++) {
      const m = mains[v];
      const ev = m === 0xffffffff ? [] : playVoice(buf, t, m - t.base);
      if (!ev) ok = false;
      else voices.push(ev);
    }
  }

  const all = voices.flat();
  const durations = all.flatMap((e, i, l) => [e.tick, l[i + 1] && l[i + 1].tick > e.tick ? l[i + 1].tick - e.tick : 0]);
  const rowTicks = Math.max(1, durations.reduce(gcd, 0));
  const lastTick = Math.max(0, ...all.map((e) => e.tick));
  const rowCount = ok ? Math.min(MAX_ROWS, Math.max(1, Math.floor(lastTick / rowTicks) + 1)) : 64;
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: rowCount,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: Array.from({ length: rowCount }, emptyCell),
    })),
  };

  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  const usedInstruments = new Set<number>();
  if (ok) {
    const written = new Set<number>();
    voices.forEach((events, channel) => {
      for (const e of events) {
        const row = Math.floor(e.tick / rowTicks);
        if (row >= rowCount) break;
        const cell = pattern.channels[channel].rows[row];
        const note = e.period ? periodToGridNote(e.period) : 0;
        if (cell.note !== 0 || note === 0) continue;
        cell.note = note;
        cell.instrument = e.inst + 1;
        usedInstruments.add(e.inst + 1);
        if (!written.has(e.at)) {
          written.add(e.at);
          noteBytes.push({ pattern: 0, channel, row, offset: e.at, note });
        }
      }
    });
  }

  const layout: UADEVariablePatternLayout | undefined = ok && blocks.length ? {
    formatId: 'mikeDavies',
    numChannels: NUM_CHANNELS,
    numFilePatterns: blocks.length,
    rowsPerPattern: rowCount,
    moduleSize: buf.length,
    encoder: mikeDaviesEncoder,
    filePatternAddrs: blocks.map((b) => b.start),
    filePatternSizes: blocks.map((b) => b.size),
    // The display is a tick grid, not the file streams: no display pattern maps to a block.
    trackMap: [Array.from({ length: NUM_CHANNELS }, () => -1)],
    blockRows: blocks.map((b) => carrierRows(buf, b.start, b.size)),
    noteBytes,
  } : undefined;

  const instruments: InstrumentConfig[] = [...usedInstruments].sort((a, c) => a - c).map((id) => ({
    id, name: `Instrument ${id - 1}`, type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  return {
    name: `${name} [Mike Davies]`,
    format: 'MOD' as TrackerFormat,
    patterns: layout ? [pattern] : [{ ...pattern, channels: pattern.channels.map((c) => ({ ...c, rows: c.rows.map(emptyCell) })) }],
    instruments: layout ? instruments : [],
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: rowTicks,
    initialBPM: 125,
    linearPeriods: false,
    uadePlayerTickGrid: true,
    ...(layout ? { uadeVariableLayout: layout } : {}),
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  } as TrackerSong;
}
