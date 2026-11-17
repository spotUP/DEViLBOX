/**
 * paulSummersGrid.ts - the Paul Summers tracker grid, read from the module's own voice command streams.
 *
 * Source of truth: third-party/nuade/players/paulsummers (ps_module.c detection and table location, paulsummers.c
 * stream grammar). A module is the eagleplayer's engine image: InitPlayer code locates the song table (20-byte entries,
 * 1-based; four voice offsets, then tempo/timer) and the period table (u32 entries counted down from its address).
 * A voice stream (offsets are from the song table; 0 and 0x1EF8 = no voice):
 *   byte < 0x80  Note: note, then a length byte (ticks; OR-ed with the high byte a LengthHigh left).
 *   byte >= 0x80 command by low nibble: 0 Rest (length byte), 1 Jump (s32 from the operand's own address), 2 Call (same,
 *   pushes), 3 Return, 4 LoopStart (u16 count), 5 LoopEnd, 6 Instrument (s32 to a range table), 7 LengthHigh (1),
 *   8 SlideSet (2), 9 SlideSteps (1), E Volume (1), F End; 0xA-0xD stop the 68000 in a loop (the walk ends).
 * Instrument range table: u16 count, then 14-byte ranges (s32 sample offset from the range, u16 length words, u16 base,
 * u16 low, u16 high). A note inside [low, high] plays the sample with period = high word of the u32 at
 * periodTable - ((note - base) << 2). The grid note is that period read through periodToNote (428 = C-2, measured, not
 * a base constant). Slides move the period in the player and are not shown.
 *
 * Layers (docs/FORMAT_COMMAND_STREAM_GRID.md): blockRows carry every stream a voice reaches byte-exact, one carrier cell
 * per byte (cutoff = 1, period = byte). The display grid is one row per player tick of subsong 1 (the tempo gate that
 * skips ticks is not modelled). A stored note byte is played by every repeat that reaches it: `placements`.
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellFieldsEqual } from '@/engine/uade/UADEPatternEncoder';
import { periodToNote } from '@/lib/amiga/periodNotes';

export const PAUL_SUMMERS_ROWS_PER_PATTERN = 64;
const MAX_TICKS = 360000; // runaway guard, about 2 hours at 50 Hz
const MAX_READS = 200000;
const STACK_WORDS = 32;
const MIN_SIZE = 0xbb8;
const CODE_START = 0x28a;
const CHECK_WORDS = 10;
const PATCH_MIN_SIZE = 0x36b0;
const PATCH_AT = 0x360c;
const PATCH_WORD = 0xf87f;
const ENTRY_BYTES = 20;
const VOICE_NONE = 0x1ef8;
const MAX_SUBSONGS = 15;
const SUBSONG = 1;
const RANGE_BYTES = 14;
const OP_MOVE_SR = 0x46fc2700, OP_RTE = 0x4e73, OP_LEA = 0x41fa, OP_LEA_A2 = 0x45fa;
const OP_MULU = 0xc0fc, OP_NEG = 0x4480, OP_MOVE_B_88 = 0x117c0088;

const be16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : -1);
const be32 = (b: Uint8Array, o: number): number => (o >= 0 && o + 3 < b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : -1);

export interface PaulSummersTables { songTable: number; periodTable: number }

/** The eagleplayer image as the player sees it: the word at 0x360C is cleared (ps_module_parse). */
function playerImage(buf: Uint8Array): Uint8Array {
  const mem = new Uint8Array(buf);
  if (mem.length > PATCH_MIN_SIZE && be16(mem, PATCH_AT) === PATCH_WORD) { mem[PATCH_AT] = 0; mem[PATCH_AT + 1] = 0; }
  return mem;
}

/** Check2 + InitPlayer of the eagleplayer: the two tables, or null when the file is not a Paul Summers module. */
export function detectPaulSummers(buf: Uint8Array): PaulSummersTables | null {
  const mem = playerImage(buf);
  if (mem.length <= MIN_SIZE) return null;
  const findWord = (from: number, op: number): number => {
    for (let at = from; at + 1 < mem.length; at += 2) if (be16(mem, at) === op) return at + 2;
    return -1;
  };
  const target = (at: number): number => { const d = be16(mem, at); return d < 0 ? -1 : at + ((d << 16) >> 16); };
  const startOk = (from: number): boolean => { const at = findWord(from, OP_LEA); return at >= 0 && target(at) === 0; };
  let ok = false;
  for (let i = 0, at = CODE_START; i < CHECK_WORDS && !ok; i++, at += 2) {
    if (be32(mem, at) === OP_MOVE_SR) {
      for (let p = at; ; ) {
        if (be32(mem, p) <= 0) break; // next === 0 or past the image
        const w = be16(mem, p); p += 2;
        if (w !== OP_RTE) continue;
        const n = be16(mem, p); p += 2;
        if (n === OP_LEA) ok = startOk(p);
        if (n === OP_LEA || n < 0) break;
      }
      break;
    }
    if (be16(mem, at) === OP_LEA) {
      let p = at + 4;
      let moves = true;
      for (let m = 0; m < 4; m++) { if (be32(mem, p) !== OP_MOVE_B_88) { moves = false; break; } p += 6; }
      ok = moves && startOk(p);
      break;
    }
  }
  if (!ok) return null;
  let at = findWord(CODE_START, OP_LEA_A2);
  if (at < 0) return null;
  const afterSongs = target(at);
  at = findWord(at, OP_MULU);
  if (at < 0) return null;
  const factor = be16(mem, at - 8);
  at += 4;
  const songTable = target(at);
  if (songTable < 0 || factor < 0) return null;
  const bytes = afterSongs - songTable;
  let subsongs = 0;
  if (bytes < 0) subsongs = factor - 1;
  else if (bytes % ENTRY_BYTES === 0 && bytes / ENTRY_BYTES <= 0xffff) subsongs = bytes / ENTRY_BYTES - 1;
  if (subsongs < 1 || subsongs > MAX_SUBSONGS) return null;
  for (let s = 1; s <= subsongs; s++) {
    const t = be32(mem, songTable + s * ENTRY_BYTES + 16);
    if (t < 0) return null;
    const tempo = t >>> 24;
    if (tempo !== 0 && tempo < 0x80) return null;
  }
  at = findWord(at, OP_NEG);
  if (at < 0) return null;
  const periodTable = target(at + 2);
  return periodTable < 0 ? null : { songTable, periodTable };
}

/** One past the last byte of a stream block: the scan follows the grammar to its first Jump, Return, End or stray byte. */
export function paulSummersStreamEnd(mem: Uint8Array, start: number): number {
  let pos = start;
  for (let guard = 0; guard < 65536 && pos < mem.length; guard++) {
    const op = mem[pos++];
    if (op < 0x80) { pos++; continue; }
    switch (op & 0xf) {
      case 0: case 7: case 9: case 14: pos += 1; continue;
      case 4: case 8: pos += 2; continue;
      case 2: case 6: pos += 4; continue;
      case 5: continue;
      case 1: pos += 4; break;
      default: break; // Return, End, unused
    }
    break;
  }
  return Math.min(pos, mem.length);
}

export function encodePaulSummersStream(rows: TrackerCell[]): Uint8Array {
  return Uint8Array.from(rows, c => (c.period ?? 0) & 0xff);
}

export interface PaulSummersPlacement {
  voice: number; tick: number;
  /** File offset of the stored note byte. */
  offset: number;
  note: number;
  /** Grid note minus the stored byte. */
  delta: number;
  instrument: number;
  /** File offset of the instrument range that played it. */
  rangeAt: number;
}

export interface PaulSummersGrid {
  patterns: Pattern[];
  voices: number;
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
  blockRows: TrackerCell[][];
  placements: PaulSummersPlacement[];
  ticks: number;
  tables: PaulSummersTables;
  /** Instrument range count per distinct range table, for the parser's instrument list. */
  rangeCount: number;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

interface Range { at: number; index: number; base: number; low: number; high: number }

/** The ranges of the table at `at`. */
function readRanges(mem: Uint8Array, at: number): Range[] {
  const count = be16(mem, at);
  const out: Range[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    const r = at + 2 + i * RANGE_BYTES;
    if (be16(mem, r + 12) < 0) break;
    out.push({ at: r, index: i, base: (be16(mem, r + 8) << 16) >> 16, low: (be16(mem, r + 10) << 16) >> 16, high: (be16(mem, r + 12) << 16) >> 16 });
  }
  return out;
}

/** The grid note stored byte `byte` plays in `range`, or 0 when the byte has no period. */
function gridNoteOf(mem: Uint8Array, tables: PaulSummersTables, range: Range, byte: number): number {
  const period = be16(mem, tables.periodTable - ((byte - range.base) << 2));
  return period > 0 ? periodToNote(period) : 0;
}

interface Walk {
  stream: number; stack: number[]; lengthHigh: number; ranges: Range[]; tick: number; ended: boolean; seen: Set<string>;
}

/** Build the grid of a Paul Summers module (subsong 1); null when it is not one. */
export function buildPaulSummersGrid(buf: Uint8Array, sourceFile: string): PaulSummersGrid | null {
  const tables = detectPaulSummers(buf);
  if (!tables) return null;
  const mem = playerImage(buf);
  const u8 = (o: number): number => (o >= 0 && o < mem.length ? mem[o] : 0xff); // past the image reads as End
  const s32 = (o: number): number => (be32(mem, o) | 0);

  const blockIndex = new Map<number, number>();
  const blockRows: TrackerCell[][] = [];
  const addrs: number[] = [];
  const sizes: number[] = [];
  const blockOf = (start: number): void => {
    if (blockIndex.has(start) || start < 0 || start >= mem.length) return;
    blockIndex.set(start, blockRows.length);
    const end = paulSummersStreamEnd(mem, start);
    blockRows.push(Array.from(buf.subarray(start, end), byte => ({ ...emptyCell(), cutoff: 1, period: byte })));
    addrs.push(start);
    sizes.push(end - start);
  };

  const placements: PaulSummersPlacement[] = [];
  const timelines: TrackerCell[][] = [[], [], [], []];
  let rangeCount = 0;

  const runVoice = (voice: number, w: Walk): void => {
    let reads = 0;
    while (!w.ended && w.tick < MAX_TICKS && reads++ < MAX_READS) {
      const key = `${w.stream}|${w.stack.join(',')}`;
      if (w.seen.has(key)) { w.ended = true; break; }
      w.seen.add(key);
      let sliding = false;
      // Read commands until a note or a rest sets a length.
      for (let cmds = 0; ; cmds++) {
        if (cmds > 4096) { w.ended = true; break; }
        const at = w.stream;
        const op = u8(w.stream++);
        if (op < 0x80) {
          const len = w.lengthHigh | u8(w.stream++);
          w.lengthHigh = 0;
          const range = w.ranges.find(r => op >= r.low && op <= r.high);
          if (range) {
            const note = gridNoteOf(mem, tables, range, op);
            if (note > 0 && len > 0) {
              timelines[voice][w.tick] = { ...emptyCell(), note, instrument: range.index + 1 };
              placements.push({ voice, tick: w.tick, offset: at, note, delta: note - op, instrument: range.index + 1, rangeAt: range.at });
            }
          }
          w.tick += len;
          break;
        }
        const operand = w.stream;
        switch (op & 0xf) {
          case 0: { const len = w.lengthHigh | u8(w.stream++); w.lengthHigh = 0; w.tick += len; } break;
          case 1: { const t = operand + s32(operand); w.stream = t; blockOf(t); continue; }
          case 2: {
            if (w.stack.length >= STACK_WORDS) { w.ended = true; break; }
            const t = operand + s32(operand); w.stack.push(operand + 4); w.stream = t; blockOf(t); continue;
          }
          case 3: { const r = w.stack.pop(); if (r === undefined) w.ended = true; else w.stream = r; continue; }
          case 4: {
            if (w.stack.length + 2 > STACK_WORDS) { w.ended = true; break; }
            w.stack.push(operand + 2, (u8(operand) << 8) | u8(operand + 1)); w.stream = operand + 2; continue;
          }
          case 5: {
            const count = w.stack.pop(), start = w.stack.pop();
            if (count === undefined || start === undefined) { w.ended = true; break; }
            const left = (count - 1) & 0xffff;
            if (left !== 0) { w.stack.push(start, left); w.stream = start; }
            continue;
          }
          case 6: { const t = operand + s32(operand); w.stream = operand + 4; w.ranges = readRanges(mem, t); rangeCount = Math.max(rangeCount, w.ranges.length); continue; }
          case 7: w.lengthHigh = u8(w.stream++) << 8; continue;
          case 8:
            if (sliding) w.stream += 2;
            else { sliding = true; w.stream += 1; w.lengthHigh = 0; w.stream += 1; }
            continue;
          case 9: w.stream += 1; continue;
          case 14: w.stream += 1; continue;
          default: w.ended = true; // End and the unused commands
        }
        if ((op & 0xf) === 0) break; // a rest ended the read
        if (w.ended) break;
      }
    }
  };

  const walks: Array<Walk | null> = [];
  for (let v = 0; v < 4; v++) {
    const off = be32(mem, tables.songTable + SUBSONG * ENTRY_BYTES + v * 4);
    const stream = off + tables.songTable;
    if (off <= 0 || off === VOICE_NONE || stream <= 0 || stream >= mem.length) { walks.push(null); continue; }
    blockOf(stream);
    const w: Walk = { stream, stack: [], lengthHigh: 0, ranges: [], tick: 0, ended: false, seen: new Set() };
    walks.push(w);
    runVoice(v, w);
  }
  const ticks = Math.max(1, ...walks.map(w => (w ? Math.min(w.tick, MAX_TICKS) : 0)));

  const R = PAUL_SUMMERS_ROWS_PER_PATTERN;
  const numPatterns = Math.ceil(ticks / R);
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: R,
    channels: timelines.map((line, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: R }, (_, r) => ({ ...(line[p * R + r] ?? emptyCell()) })),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: blockRows.length, originalInstrumentCount: rangeCount,
    },
  }));
  const blockAt: number[][] = [[], [], [], []];
  for (const pl of placements) {
    const block = addrs.findIndex((a, i) => pl.offset >= a && pl.offset < a + sizes[i]);
    const p = Math.floor(pl.tick / R);
    if (blockAt[pl.voice][p] === undefined && block >= 0) blockAt[pl.voice][p] = block;
  }
  const trackMap = patterns.map((_, p) => [0, 1, 2, 3].map(v => blockAt[v][p] ?? -1));
  return { patterns, voices: 4, filePatternAddrs: addrs, filePatternSizes: sizes, trackMap, blockRows, placements, ticks, tables, rangeCount };
}

export interface PaulSummersEditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * Write the grid's note edits into the module. A changed note cell becomes the stored note byte of its instrument range
 * whose period reads as that grid note (in place, so an unedited export is byte-identical); cells that play the same
 * byte must agree, else the byte is left and a warning returned. Instruments and lengths are not written.
 */
export function applyPaulSummersGridEdits(source: Uint8Array, edited: Pattern[]): PaulSummersEditResult {
  const base = buildPaulSummersGrid(source, '');
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  if (!base) return { data: out, patched: 0, warnings: ['the module is not a Paul Summers module'] };
  const mem = playerImage(source);
  const R = PAUL_SUMMERS_ROWS_PER_PATTERN;
  const cellAt = (voice: number, tick: number): TrackerCell | undefined => edited[Math.floor(tick / R)]?.channels[voice]?.rows[tick % R];
  const placed = new Set<string>();
  const wanted = new Map<number, Set<number>>();
  for (const pl of base.placements) {
    placed.add(`${pl.voice}:${pl.tick}`);
    const cell = cellAt(pl.voice, pl.tick);
    if (!cell) continue;
    const want = cell.note ?? 0;
    if (want !== pl.note) {
      const r: Range = { at: pl.rangeAt, index: 0, base: (be16(mem, pl.rangeAt + 8) << 16) >> 16, low: (be16(mem, pl.rangeAt + 10) << 16) >> 16, high: (be16(mem, pl.rangeAt + 12) << 16) >> 16 };
      let byte = -1;
      if (want > 0) for (let b = Math.max(0, r.low); b <= Math.min(0x7f, r.high); b++) if (gridNoteOf(mem, base.tables, r, b) === want) { byte = b; break; }
      if (byte >= 0) {
        if (!wanted.has(pl.offset)) wanted.set(pl.offset, new Set());
        wanted.get(pl.offset)!.add(byte);
      } else warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: note ${want} is outside the instrument's range or removes the note; not written`);
    }
    if ((cell.instrument ?? 0) !== pl.instrument) {
      warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: the instrument comes from an Instrument command shared by other notes; not written`);
    }
  }
  let patched = 0;
  for (const [offset, set] of wanted) {
    if (set.size === 1) { out[offset] = [...set][0]; patched++; }
    else warnings.push(`stream byte ${offset}: cells that play it were edited to different notes; not written`);
  }
  let stray = 0;
  edited.forEach((pat, p) => pat.channels.forEach((chn, v) => chn.rows.forEach((cell, r) => {
    if (placed.has(`${v}:${p * R + r}`)) return;
    if (!cellFieldsEqual(cell, base.patterns[p]?.channels[v]?.rows[r] ?? emptyCell())) stray++;
  })));
  if (stray > 0) warnings.push(`${stray} edited cell(s) are not on a note; not written (the stream would change length)`);
  return { data: out, patched, warnings };
}
