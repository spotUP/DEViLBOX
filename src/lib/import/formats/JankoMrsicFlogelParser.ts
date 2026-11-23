/**
 * JankoMrsicFlogelParser.ts — Janko Mrsic-Flogel Amiga music format native parser
 *
 * Janko Mrsic-Flogel is a proprietary 4-channel Amiga music format. The module
 * is a compiled 68k executable combining player code and music data into a single
 * self-contained file.
 *
 * Detection (from UADE Janko Mrsic-Flogel_v1.asm Check3 routine, big-endian reads):
 *   u32BE(buf, 0)  === 0x000003F3   (68k HUNK_HEADER magic)
 *   buf[20] !== 0                   (non-zero byte at offset 20)
 *   u32BE(buf, 32) === 0x70FF4E75   (68k MOVEQ #-1,D0 + RTS opcodes)
 *   u32BE(buf, 36) === 0x4A2E464C   (ASCII 'J.FL')
 *   u32BE(buf, 40) === 0x4F47454C   (ASCII 'OGEL')
 *   u32BE(buf, 48) !== 0            (Interrupt pointer)
 *   u32BE(buf, 52) !== 0            (InitSong pointer)
 *   u32BE(buf, 56) !== 0            (Subsongs pointer)
 *
 * File prefix: "JMF." (e.g. "JMF.songname")
 * Single-file format: music data binary.
 * Actual audio playback is delegated to UADE (or nuade).
 *
 * Stream grammar: third-party/nuade/players/jankomrsicflogel/jmf_module.c + jankomrsicflogel.c. The module is an Amiga
 * executable (one code hunk at file offset 0x20, HUNK_RELOC32); every pointer in it is a code-relative offset. The init
 * routine (header long 0x10) is a chain of blocks, one per subsong, each three `move.l #stream,variable` (voices 1-3; the
 * fourth voice never plays). A stream is events up to $FF: `$FE mode` selects what the following events carry; an event is
 * a duration byte (replayer steps; 0 = 256) and then, by mode, a note byte (modes 0 and 7 load wave A, 1 wave B, 3/5/6 keep
 * the wave), one skipped byte (2, 4) or nothing (8, DMA off). The note byte plus the driver's note offset indexes the
 * period table; the driver (note offset, ticks per step) is known by an FNV-1a hash of its code, as in the nuade port.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): each stream is a file block whose `blockRows` carry its bytes
 * (cutoff = byte count, period/pan/resonance = the bytes, one token per row); the display is a tick grid (one row per
 * step) of subsong 0 with `noteBytes` naming the byte of every note; instrument 1/2 = wave A/B.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/JankoMrsicFlogel/...
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';
import { jankoMrsicFlogelEncoder } from '@/engine/uade/encoders/JankoMrsicFlogelEncoder';

const MIN_FILE_SIZE = 64;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isJankoMrsicFlogelFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // 68k HUNK_HEADER magic
  if (u32BE(buf, 0) !== 0x000003F3) return false;

  // Byte at offset 20 must be non-zero
  if (buf[20] === 0) return false;

  // 68k MOVEQ #-1,D0 + RTS opcode pair
  if (u32BE(buf, 32) !== 0x70FF4E75) return false;

  // ASCII 'J.FL'
  if (u32BE(buf, 36) !== 0x4A2E464C) return false;

  // ASCII 'OGEL'
  if (u32BE(buf, 40) !== 0x4F47454C) return false;

  // Interrupt pointer
  if (u32BE(buf, 48) === 0) return false;

  // InitSong pointer
  if (u32BE(buf, 52) === 0) return false;

  // Subsongs pointer
  if (u32BE(buf, 56) === 0) return false;

  return true;
}


const HUNK_CODE_OFFSET = 0x20;
const NUM_CHANNELS = 4;
const NUM_VOICES = 3;
const ROWS_PER_PATTERN = 64;
const MAX_DISPLAY_ROWS = ROWS_PER_PATTERN * 256;
const STREAM_END = 0xff;
const STREAM_MODE = 0xfe;
const MODE_COUNT = 9;
const STREAM_MOVE_BYTES = 10;
const BLOCK_BYTES = NUM_VOICES * STREAM_MOVE_BYTES + 4;
const HUNK_RELOC32 = 0x3ec;
const HUNK_END = 0x3f2;
const MAX_PERIODS = 128;

/** What a mode makes its events carry (jump table of the replayer): wave A, wave B, skip, note, stop. */
type Action = 'a' | 'b' | 'skip' | 'note' | 'stop';
const MODE_ACTIONS: readonly Action[] = ['a', 'b', 'skip', 'note', 'skip', 'note', 'note', 'a', 'stop'];

/** Replayer versions by FNV-1a hash of the code (relocated words normalised), from jmf_module.c. */
const DRIVERS = [
  { signature: 0xecc20970a8471127n, length: 0x418, noteOffset: -5, tickDivisor: 4 },
  { signature: 0xf13485b92949e709n, length: 0x3e0, noteOffset: 0, tickDivisor: 6 },
  { signature: 0x4b3501abac6de87bn, length: 0x3fa, noteOffset: 4, tickDivisor: 4 },
  { signature: 0xa4efc89637a2bc21n, length: 0x406, noteOffset: 0, tickDivisor: 6 },
] as const;

function u16(buf: Uint8Array, off: number): number {
  return off + 1 < buf.length ? (buf[off] << 8) | buf[off + 1] : 0;
}

/** Image offsets (code hunk) of every relocated long, from the HUNK_RELOC32 tables behind the code. */
function readRelocations(buf: Uint8Array, imageSize: number): number[] | null {
  const out: number[] = [];
  let at = HUNK_CODE_OFFSET + imageSize;
  while (at + 4 <= buf.length) {
    const id = u32BE(buf, at) & 0x3fffffff;
    at += 4;
    if (id === HUNK_END) return out;
    if (id !== HUNK_RELOC32) return null;
    for (;;) {
      if (at + 4 > buf.length) return null;
      const count = u32BE(buf, at);
      at += 4;
      if (count === 0) break;
      if (at + 4 + count * 4 > buf.length) return null;
      at += 4;
      for (let i = 0; i < count; i++, at += 4) out.push(u32BE(buf, at));
    }
  }
  return null;
}

function replayerSignature(img: Uint8Array, relocs: number[], begin: number, length: number): bigint | null {
  if (begin + length > img.length) return null;
  const image = img.slice(begin, begin + length);
  for (const at of relocs) {
    if (at + 4 <= begin || at >= begin + length) continue;
    const target = u32BE(img, at);
    const inside = target >= begin && target - begin < length + 0xba ? target - begin : 0;
    for (let k = 0; k < 4; k++) if (at + k >= begin && at + k < begin + length) image[at + k - begin] = (inside >>> (24 - 8 * k)) & 0xff;
  }
  let hash = 0xcbf29ce484222325n;
  for (const b of image) hash = ((hash ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return hash;
}

/** Operand of each `head, relocated long` occurrence inside [from, to) of the image. */
function findOperands(img: Uint8Array, from: number, to: number, head: number[], tail: number[] = []): number[] {
  const out: number[] = [];
  for (let at = from; at + head.length + 4 + tail.length <= to; at += 2) {
    if (head.every((b, i) => img[at + i] === b) && tail.every((b, i) => img[at + head.length + 4 + i] === b)) out.push(u32BE(img, at + head.length));
  }
  return out;
}

export interface JankoStream { start: number; size: number; events: JankoEvent[] }
export interface JankoEvent { row: number; offset: number; note: number; wave: 1 | 2 }
export interface JankoModule {
  /** Period table (image offsets) of the note lookup, its length and the driver's note offset and ticks per step. */
  periodTable: number; periodCount: number; noteOffset: number; tickDivisor: number;
  /** Per subsong, the stream start (image offset) of each of the three voices. */
  streams: number[][];
}

/** Locate driver, period table and subsong streams; null when the module is not one the nuade port models. */
export function analyseJankoMrsicFlogel(file: Uint8Array): JankoModule | null {
  if (file.length < HUNK_CODE_OFFSET + 0x30) return null;
  const imageSize = u32BE(file, 0x1c) * 4;
  if (HUNK_CODE_OFFSET + imageSize > file.length) return null;
  const img = file.subarray(HUNK_CODE_OFFSET, HUNK_CODE_OFFSET + imageSize);
  const relocs = readRelocations(file, imageSize);
  if (!relocs) return null;
  const play = u32BE(img, 0x0c);
  const init = u32BE(img, 0x10);
  const subsongs = u32BE(img, 0x14);
  if (subsongs === 0 || play >= img.length || init >= img.length) return null;
  const driver = DRIVERS.find((d) => replayerSignature(img, relocs, play, d.length) === d.signature);
  if (!driver) return null;
  const end = play + driver.length;
  const tables = findOperands(img, play, end, [0x45, 0xf9], [0x32, 0x32, 0x10, 0x00]);
  const counters = findOperands(img, play, end, [0x04, 0x39, 0x00, 0x01]);
  if (tables.length !== 1 || counters.length !== 4) return null;
  const variables = Math.min(...counters);
  const periodTable = tables[0];
  if (periodTable % 2 !== 0 || periodTable >= variables) return null;
  const periodCount = (variables - periodTable) / 2;
  if (periodCount > MAX_PERIODS) return null;
  if ((img.length - init) / BLOCK_BYTES < subsongs) return null;
  const streams: number[][] = [];
  let at = init;
  for (let s = 0; s < subsongs; s++) {
    if (s + 1 < subsongs) at += (s === 0 ? 2 : 4) + 2;
    const voices: number[] = [];
    for (let v = 0; v < NUM_VOICES; v++, at += STREAM_MOVE_BYTES) {
      if (u16(img, at) !== 0x23fc) return null;
      const stream = u32BE(img, at + 2);
      if (stream >= img.length) return null;
      voices.push(stream);
    }
    if (u16(img, at) !== 0x6000) return null;
    at += 4;
    streams.push(voices);
  }
  return { periodTable, periodCount, noteOffset: driver.noteOffset, tickDivisor: driver.tickDivisor, streams };
}

/** Period-table index a note byte plays, or -1 outside the table. */
function periodIndex(m: JankoModule, noteByte: number): number {
  const i = noteByte + m.noteOffset;
  return i >= 0 && i < m.periodCount ? i : -1;
}

/** Grid note of table index `i`. */
export function jankoGridNote(img: Uint8Array, m: JankoModule, i: number): number {
  return periodToGridNote(u16(img, m.periodTable + i * 2));
}

/** Walk one stream from `start` (image offsets): its events on the step grid, its byte size, null when it leaves the module. */
function walkStream(img: Uint8Array, m: JankoModule, start: number, voice: number): JankoStream | null {
  const events: JankoEvent[] = [];
  let p = start;
  let row = 0;
  let mode = 0;
  let wave: 1 | 2 = 1;
  while (p + 1 < img.length) {
    const b = img[p];
    if (b === STREAM_END) return { start, size: p + 1 - start, events };
    if (b === STREAM_MODE) {
      mode = img[p + 1];
      if (mode >= MODE_COUNT || (voice === 2 && mode === 4)) return null;
      p += 2;
      continue;
    }
    const action = MODE_ACTIONS[mode];
    const steps = b || 256;
    if (action === 'stop') p += 1;
    else {
      if (action === 'skip') { /* byte skipped */ } else {
        const i = periodIndex(m, img[p + 1]);
        if (i < 0) return null;
        if (action === 'a') wave = 1; else if (action === 'b') wave = 2;
        events.push({ row, offset: p + 1, note: jankoGridNote(img, m, i), wave });
      }
      p += 2;
    }
    row += steps;
    if (row > MAX_DISPLAY_ROWS) return null;
  }
  return null;
}

/** Byte-exact carrier rows of a stream: one token (duration + operand, or a $FE mode pair, or $FF) per row. */
function carrierRows(img: Uint8Array, m: JankoModule, s: JankoStream): TrackerCell[] {
  const rows: TrackerCell[] = [];
  let mode = 0;
  for (let p = s.start; p < s.start + s.size;) {
    const b = img[p];
    const len = b === STREAM_END ? 1 : b === STREAM_MODE ? 2 : MODE_ACTIONS[mode] === 'stop' ? 1 : 2;
    if (b === STREAM_MODE) mode = img[p + 1];
    rows.push({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      cutoff: len, period: img[p], pan: len > 1 ? img[p + 1] : 0, resonance: 0,
    } as TrackerCell);
    p += len;
  }
  void m;
  return rows;
}

export function parseJankoMrsicFlogelFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJankoMrsicFlogelFormat(buf)) throw new Error('Not a Janko Mrsic-Flogel module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^jmf\./i, '') || baseName;

  const m = analyseJankoMrsicFlogel(buf);
  const img = buf.subarray(HUNK_CODE_OFFSET);
  const blocks = new Map<number, JankoStream>();
  let ok = m !== null;
  if (m) {
    for (const voices of m.streams) {
      voices.forEach((start, v) => {
        if (blocks.has(start)) return;
        const s = walkStream(img, m, start, v);
        if (s) blocks.set(start, s); else ok = false;
      });
    }
  }
  const grid = ok && m ? m.streams[0].map((start) => blocks.get(start)!) : [];
  const voiceRows = grid.map((s) => s.events.length ? s.events[s.events.length - 1].row + 1 : 0);
  const numPatterns = Math.max(1, Math.ceil(Math.max(0, ...voiceRows) / ROWS_PER_PATTERN));
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, pi) => ({
    id: `pattern-${pi}`,
    name: `Pattern ${pi}`,
    length: ROWS_PER_PATTERN,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: Array.from({ length: ROWS_PER_PATTERN }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
  }));

  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  grid.forEach((s, ch) => {
    for (const ev of s.events) {
      if (ev.note === 0) continue;
      const pattern = Math.floor(ev.row / ROWS_PER_PATTERN);
      const row = ev.row % ROWS_PER_PATTERN;
      const cell = patterns[pattern].channels[ch].rows[row];
      cell.note = ev.note;
      cell.instrument = ev.wave;
      noteBytes.push({ pattern, channel: ch, row, offset: HUNK_CODE_OFFSET + ev.offset, note: ev.note });
    }
  });

  const sorted = [...blocks.values()].sort((a, b) => a.start - b.start);
  const layout: UADEVariablePatternLayout | undefined = ok && m ? {
    formatId: 'jankoMrsicFlogel',
    numChannels: NUM_CHANNELS,
    numFilePatterns: sorted.length,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buf.length,
    encoder: jankoMrsicFlogelEncoder,
    filePatternAddrs: sorted.map((b) => HUNK_CODE_OFFSET + b.start),
    filePatternSizes: sorted.map((b) => b.size),
    // The display is a tick grid, not the file streams: no display pattern maps to a block.
    trackMap: patterns.map(() => Array.from({ length: NUM_CHANNELS }, () => -1)),
    blockRows: sorted.map((b) => carrierRows(img, m, b)),
    noteBytes,
  } : undefined;

  const instruments: InstrumentConfig[] = [1, 2].map((id) => ({
    id, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const songPositions = patterns.map((_, i) => i);
  return {
    name: `${moduleName} [Janko Mrsic-Flogel]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: m?.tickDivisor ?? 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePlayerTickGrid: true,
    ...(layout ? { uadeVariableLayout: layout } : {}),
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  } as TrackerSong;
}
