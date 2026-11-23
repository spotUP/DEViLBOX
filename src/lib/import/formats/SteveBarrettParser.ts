/**
 * SteveBarrettParser.ts — Steve Barrett music format parser (SB.* prefix)
 *
 * Detection based on Steve Barrett_v2.asm Check2:
 *   - 4 consecutive BRA instructions at the start (offsets 0, 4, 8, 12):
 *     - u16BE(buf, pos) === 0x6000 (BRA opcode)
 *     - u16BE(buf, pos+2) is non-zero, bit 15 clear (positive), bit 0 clear (even)
 *   - The last BRA's target holds MOVE.L #$00DFF0A8 (u16 0x2A7C, then u32 0x00DFF0A8).
 *
 * Playback is the nuade port (third-party/nuade/players/stevebarrett); this parser only reads the song.
 *
 * Stream grammar and tables: sbr_module.c (builds, sbr_decode_event, walk_list) and stevebarrett.c (start_song,
 * next_pattern, start_note, run_voice). The module is one game's driver; its build (sbr_module.c s_builds) gives the
 * song table (four signed words per song, offsets from a4 = module - 6, one list per voice) and the pattern table
 * (a word per pattern, from a4). A list is pattern numbers (< $80), transposes ($80..$FE: transpose = byte + $40) and
 * $FF (restart). A pattern is events: prefixes tempo ($F0..), wave ($E0..), envelope ($C0..), duration ($80..), a
 * command ($7A +1; $7C/$7D/$7B/$7E/$7F +1 in the extended builds), then the note byte; $FF ends the pattern, $FE stops
 * the song. Every voice advances on the same row step (tempo + 1 ticks); a note lasts its duration + 1 row steps.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): every list and played pattern is a file block whose `blockRows`
 * carry its bytes (cutoff = byte count, period/pan/resonance = the bytes, one token per row, longer tokens split over
 * rows); the display is a row-step grid of song 1, with `noteBytes` naming the byte of every note.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { steveBarrettEncoder } from '@/engine/uade/encoders/SteveBarrettEncoder';

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

const MIN_FILE_SIZE = 14;

export function isSteveBarrettFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Steve Barrett_v2.asm Check2: four bra.w with positive even displacements; then lea (A0,D2.W) from offset 16
  // with the last displacement, which must land on move.l #$00DFF0A8.
  let pos = 0;
  let lastD2 = 0;
  for (let i = 0; i < 4; i++) {
    if (pos + 4 > buf.length) return false;
    if (u16BE(buf, pos) !== 0x6000) return false;
    const d2 = u16BE(buf, pos + 2);
    if (d2 === 0) return false;
    if (d2 & 0x8000) return false;
    if (d2 & 0x0001) return false;
    lastD2 = d2;
    pos += 4;
  }

  const targetPos = pos + lastD2;
  if (targetPos + 6 > buf.length) return false;
  if (u16BE(buf, targetPos) !== 0x2A7C) return false;
  if (u32BE(buf, targetPos + 2) !== 0x00DFF0A8) return false;
  return true;
}

// ── The builds (sbr_module.c s_builds): the entries, the driver's code hash and the tables the songs use ──────────

export interface SteveBarrettBuild {
  name: string;
  codeHash: bigint;
  codeStart: number;
  codeEnd: number;
  entry: [number, number, number, number];
  extended: boolean;
  wave: number;
  songs: number;
  patterns: number;
}

const BUILDS: SteveBarrettBuild[] = [
  { name: 'Advanced Ski Simulator', codeHash: 0x6b3f9f4a4a7dd209n, codeStart: 0x70, codeEnd: 0x8fc, entry: [0x7a, 0x70, 0xc8, 0x67a], extended: true, wave: 0xb12, songs: 0xc74, patterns: 0xc94 },
  { name: 'Artificial Dreams', codeHash: 0xfd5f3915379291adn, codeStart: 0x6c, codeEnd: 0x8e2, entry: [0x76, 0x6c, 0xae, 0x65e], extended: true, wave: 0xafc, songs: 0xc04, patterns: 0xc14 },
  { name: 'Dragonscape', codeHash: 0x35907401a287dfc8n, codeStart: 0x66, codeEnd: 0x7fa, entry: [0x70, 0x66, 0xbe, 0x614], extended: true, wave: 0xa08, songs: 0xb10, patterns: 0xb18 },
  { name: 'Kelly X', codeHash: 0xa6fb51ca0f545ef9n, codeStart: 0x66, codeEnd: 0x696, entry: [0x70, 0x66, 0xbe, 0x4fe], extended: false, wave: 0x858, songs: 0x908, patterns: 0x910 },
  { name: 'Chronicles of Omega', codeHash: 0xa60735b7b4e8779dn, codeStart: 0x46, codeEnd: 0x676, entry: [0x50, 0x46, 0x9e, 0x4de], extended: false, wave: 0x83e, songs: 0x916, patterns: 0x92e },
  { name: 'Street Fighter', codeHash: 0x21c154dec85122d6n, codeStart: 0x38, codeEnd: 0x8a6, entry: [0x42, 0x38, 0x7e, 0x622], extended: true, wave: 0xab8, songs: 0xb98, patterns: 0xbc0 },
];

const MASK64 = (1n << 64n) - 1n;
function fnv1a64(b: Uint8Array, from: number, to: number): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = from; i < to; i++) h = ((h ^ BigInt(b[i])) * 0x100000001b3n) & MASK64;
  return h;
}

/**
 * The build of a module, or null. shortcut: matches the entries and the code hash only; nuade also checks the
 * variables' hash and the title (sbr_module.c identify), so a hacked copy of a known driver passes here and fails there.
 */
export function identifySteveBarrett(b: Uint8Array): SteveBarrettBuild | null {
  for (const build of BUILDS) {
    if (b.length < build.patterns || b.length < build.codeEnd) continue;
    const entries = build.entry.every((e, k) => u16BE(b, 4 * k) === 0x6000 && 4 * k + 2 + u16BE(b, 4 * k + 2) === e);
    if (entries && fnv1a64(b, build.codeStart, build.codeEnd) === build.codeHash) return build;
  }
  return null;
}

// ── Streams ──────────────────────────────────────────────────────────────────────────────────────────────────

const A4_BIAS = 6;
const SONG_BYTES = 8;
const NUM_CHANNELS = 4;
const ROWS_PER_PATTERN = 64;
const MAX_DISPLAY_ROWS = ROWS_PER_PATTERN * 512;
const MAX_EVENTS = 1 << 16;

const s16 = (b: Uint8Array, o: number): number => (u16BE(b, o) << 16) >> 16;
const listStart = (b: Uint8Array, m: SteveBarrettBuild, song: number, voice: number): number =>
  s16(b, m.songs + song * SONG_BYTES + 2 * voice) - A4_BIAS;
const patternStart = (b: Uint8Array, m: SteveBarrettBuild, n: number): number => u16BE(b, m.patterns + 2 * n) - A4_BIAS;

interface SbEvent { end: boolean; stop: boolean; len: number; wave: number; duration: number; note: number }

/** sbr_decode_event: the event at `p`, or null when it runs out of the module. */
function decodeEvent(b: Uint8Array, m: SteveBarrettBuild, p: number): SbEvent | null {
  let pos = p;
  const next = (): number => (pos < b.length ? b[pos++] : -1);
  const ev = (end: boolean, stop: boolean, note = 0): SbEvent => ({ end, stop, len: pos - p, wave, duration, note });
  let wave = -1;
  let duration = -1;
  let x = next();
  if (x < 0) return null;
  if (x === 0xff || x === 0xfe) return ev(true, x === 0xfe);
  if (x > 0xef && (x = next()) < 0) return null;
  if (x > 0xdf) {
    wave = x & 0xf;
    if ((x = next()) < 0) return null;
    if (x === 0xff) return ev(true, false);
  }
  if (x > 0xbf) {
    if ((x = next()) < 0) return null;
    if (x === 0xff) return ev(true, false);
  }
  if (x > 0x7f) {
    duration = x & 0x3f;
    if ((x = next()) < 0) return null;
  }
  const twoMore = x === 0x7a || (m.extended && (x === 0x7c || x === 0x7d));
  const oneMore = m.extended && (x === 0x7b || x === 0x7e || x === 0x7f);
  if (twoMore && (next() < 0 || (x = next()) < 0)) return null;
  if (oneMore && (x = next()) < 0) return null;
  return ev(false, false, x);
}

/** A pattern's token lengths, up to and including its end ($FF) or stop ($FE) byte. */
function patternTokens(b: Uint8Array, m: SteveBarrettBuild, start: number): number[] | null {
  const lens: number[] = [];
  for (let p = start; lens.length < MAX_EVENTS;) {
    const e = decodeEvent(b, m, p);
    if (!e) return null;
    lens.push(e.len);
    if (e.end) return lens;
    p += e.len;
  }
  return null;
}

/** A list's bytes up to and including its $FF; the driver's position is a byte, so a list holds at most 256. */
function listTokens(b: Uint8Array, start: number): number[] | null {
  for (let i = 0; i < 256 && start + i < b.length; i++) {
    if (b[start + i] === 0xff) return Array.from({ length: i + 1 }, () => 1);
  }
  return null;
}

function carrierRows(b: Uint8Array, start: number, lens: number[]): TrackerCell[] {
  const rows: TrackerCell[] = [];
  let p = start;
  for (const len of lens) {
    for (let left = len; left > 0;) {
      const n = Math.min(3, left);
      rows.push({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        cutoff: n, period: b[p], pan: n > 1 ? b[p + 1] : 0, resonance: n > 2 ? b[p + 2] : 0,
      } as TrackerCell);
      p += n;
      left -= n;
    }
  }
  return rows;
}

interface SbNote { row: number; offset: number; byte: number; transpose: number; instrument: number }

/**
 * One voice's first pass through its list (stevebarrett.c start_song / next_pattern / start_note): a note at row r
 * holds for duration + 1 row steps. Every played pattern is reported to `seen`. Stops at the list's first $FF or the
 * song's stop; `stopRow` is the row of a stop, else -1.
 */
function walkVoice(
  b: Uint8Array, m: SteveBarrettBuild, list: number, seen: (pattern: number) => void,
): { notes: SbNote[]; stopRow: number } | null {
  const notes: SbNote[] = [];
  let transpose = 0;
  let duration = 0;
  let wave = 0;
  let row = 0;
  for (let i = 0; i < 256; i++) {
    const entry = b[list + i];
    if (entry === undefined) return null;
    if (entry === 0xff) return { notes, stopRow: -1 };
    if (entry & 0x80) { transpose = (entry + 0x40) & 0xff; continue; }
    const start = patternStart(b, m, entry);
    if (start < m.wave || start >= b.length) return null;
    seen(start);
    for (let p = start, k = 0; ; k++) {
      if (k > MAX_EVENTS) return null;
      const e = decodeEvent(b, m, p);
      if (!e) return null;
      if (e.wave >= 0) wave = e.wave;
      if (e.stop) return { notes, stopRow: row };
      if (e.end) break;
      if (e.duration >= 0) duration = e.duration;
      notes.push({ row, offset: p + e.len - 1, byte: e.note, transpose, instrument: wave + 1 });
      row += duration + 1;
      p += e.len;
    }
  }
  return null;
}

/** Grid note of a note byte under its transpose: the driver's note number + 1 (the extended builds' bend is not shown). */
export const steveBarrettGridNote = (byte: number, transpose: number): number => ((byte + transpose) & 0xff) + 1;

export function parseSteveBarrettFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSteveBarrettFormat(buf)) throw new Error('Not a Steve Barrett module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^sb\./i, '').replace(/\.sb$/i, '') || baseName;

  const m = identifySteveBarrett(buf);
  // Blocks: every list of every song and every pattern a pass reaches. An unknown build keeps an empty grid.
  const blocks = new Map<number, number[]>();
  let ok = m !== null;
  const display: SbNote[][] = [];
  let stopRow = -1;
  if (m) {
    const songs = (m.patterns - m.songs) / SONG_BYTES;
    for (let s = 0; s < songs && ok; s++) {
      for (let v = 0; v < NUM_CHANNELS && ok; v++) {
        const l = listStart(buf, m, s, v);
        if (l < m.wave) { ok = false; break; }
        if (!blocks.has(l)) {
          const lens = listTokens(buf, l);
          if (lens) blocks.set(l, lens); else ok = false;
        }
        const pass = walkVoice(buf, m, l, (p) => {
          if (blocks.has(p)) return;
          const lens = patternTokens(buf, m, p);
          if (lens) blocks.set(p, lens); else ok = false;
        });
        if (!pass) ok = false;
        else if (s === 0) {
          display.push(pass.notes);
          if (pass.stopRow >= 0) stopRow = stopRow < 0 ? pass.stopRow : Math.min(stopRow, pass.stopRow);
        }
      }
    }
  }
  const sorted = ok ? [...blocks.entries()].sort((a, c) => a[0] - c[0]) : [];
  const sizeOf = (lens: number[]) => lens.reduce((a, n) => a + n, 0);
  // Blocks must not overlap: two streams sharing bytes would encode them twice.
  for (let i = 1; i < sorted.length && ok; i++) ok = sorted[i - 1][0] + sizeOf(sorted[i - 1][1]) <= sorted[i][0];

  // A stop ends every voice at that row step.
  const shown = ok ? display.map((notes) => notes.filter((n) => stopRow < 0 || n.row < stopRow)) : [];
  const lastRow = Math.min(MAX_DISPLAY_ROWS - 1, Math.max(0, ...shown.flat().map((n) => n.row)));
  const numPatterns = Math.max(1, Math.ceil((lastRow + 1) / ROWS_PER_PATTERN));
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
  const usedInstruments = new Set<number>();
  shown.forEach((notes, ch) => {
    for (const n of notes) {
      const note = steveBarrettGridNote(n.byte, n.transpose);
      if (n.row > lastRow || note > 96) continue;
      const pattern = Math.floor(n.row / ROWS_PER_PATTERN);
      const row = n.row % ROWS_PER_PATTERN;
      const cell = patterns[pattern].channels[ch].rows[row];
      cell.note = note;
      cell.instrument = n.instrument;
      usedInstruments.add(n.instrument);
      noteBytes.push({ pattern, channel: ch, row, offset: n.offset, note });
    }
  });

  const layout: UADEVariablePatternLayout | undefined = ok && sorted.length ? {
    formatId: 'steveBarrett',
    numChannels: NUM_CHANNELS,
    numFilePatterns: sorted.length,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buf.length,
    encoder: steveBarrettEncoder,
    filePatternAddrs: sorted.map(([start]) => start),
    filePatternSizes: sorted.map(([, lens]) => sizeOf(lens)),
    // The display is a row-step grid, not the file streams: no display pattern maps to a block.
    trackMap: patterns.map(() => Array.from({ length: NUM_CHANNELS }, () => -1)),
    blockRows: sorted.map(([start, lens]) => carrierRows(buf, start, lens)),
    noteBytes,
  } : undefined;

  const instruments: InstrumentConfig[] = [...usedInstruments].sort((a, c) => a - c).map((id) => ({
    id, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const songPositions = patterns.map((_, i) => i);
  return {
    name: `${moduleName} [Steve Barrett]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePlayerTickGrid: true,
    ...(layout ? { uadeVariableLayout: layout } : {}),
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  } as TrackerSong;
}
