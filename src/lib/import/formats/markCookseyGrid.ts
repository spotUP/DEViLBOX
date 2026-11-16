/**
 * markCookseyGrid.ts - the Mark Cooksey tracker grid, read from the module's own per-channel command streams.
 *
 * Read from the replayer code inside the module itself (the "new format", files starting D040 D040 4EFB; the Wanted
 * Team eagleplayer third-party/uade-3.05/amigasrc/players/wanted_team/Mark_Cooksey_Don_Adan/Mark Cooksey_v2.asm calls
 * it with d0 = (subsong << 16) | 1 to start music and d0 = 0 every 50 Hz frame to play):
 *   - `jmp (pc,d0)` at offset 4 indexes a table of `bra` entries at 6 + displacement byte: 0 play, 1 music init.
 *   - Music init: the first `lea (pc),a1` is the song table, 16 bytes per subsong = four longs, one per Paula channel
 *     0..3; a long L at address A starts the channel's stream at A + L (0 = channel unused). The channel counter starts
 *     at 0, so the first frame reads.
 *   - Play, per channel: `subq.w #1,counter; bhi skip` - the channel reads when the counter reaches 0 (or wraps from
 *     0), so a duration d lasts max(d, 1) frames. One grid row = one frame.
 *   - Stream bytes (op = byte & 0x7F): below 0x60 a note: [note, instrument, duration, x]; the pitch is the period
 *     table word at (note + transpose) * 4 times the instrument's base period, >> 16. Ends the frame.
 *     0x60 rest [op, duration hi, duration lo, x], ends the frame. 0x63 volume (1 arg). 0x64 call [op, sub, transpose]
 *     (plays once), 0x65 call [op, sub, transpose, repeats] (plays repeats + 1 times); the sub table entry i is
 *     table + 2i + its signed word; transpose is set (not added). 0x66 return (repeat or pop; clears transpose).
 *     0x67 channel off. 0x68 jump [op, s16]: target = op address + s16 (the song loop when backwards). 0x69
 *     portamento (1 arg). 0x6B portamento off. Every other op loops on itself in the replayer (a hang), so the walk
 *     stops there.
 *   - Instrument record (play routine `lea (pc),a0; add.w d1,d1; adda.w d1,a0; adda.w (a0),a0`): longs sample, loop,
 *     env, env; words +16, +18, +20, +22. The base period is +20 when the sample long is set, else +22.
 *
 * Layers (docs/FORMAT_COMMAND_STREAM_GRID.md): `blockRows` carry every stream start a channel reaches (main stream,
 * jump targets, subroutines) byte-exact to its first ending command, one carrier cell per byte (cutoff = 1,
 * period = byte). The display grid is one row per frame. A note byte is played from every call and repeat that
 * reaches it, so `placements` lists each of them with its delta (grid note minus stored byte, for the transpose and
 * instrument in force); the period table has four steps per semitone, so one byte step is one semitone.
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellFieldsEqual } from '@/engine/uade/UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

export const MARK_COOKSEY_ROWS_PER_PATTERN = 64;
// A runaway guard only (about 2 hours at 50 Hz).
const MAX_TICKS = 360000;
const COMMAND_LIMIT = 4096;
const NOTE_OPS = 0x60;
const MAX_NOTE_BYTE = 0x5f;
const MAX_DEPTH = 16;

const u16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0);
const u32 = (b: Uint8Array, o: number): number => ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0;
const s16 = (v: number): number => (v << 16) >> 16;
const s8 = (v: number): number => (v << 24) >> 24;

/** Bytes an op takes, op byte included (0 for an op the replayer hangs on). */
const opSize = (op: number): number => {
  if (op < NOTE_OPS || op === 0x60 || op === 0x65) return 4;
  if (op === 0x64 || op === 0x68) return 3;
  if (op === 0x63 || op === 0x69) return 2;
  if (op === 0x66 || op === 0x67 || op === 0x6b) return 1;
  return 0;
};

/** First `lea (pc),aN` (opcode word `lea`) at or after `from` followed by `tail` words; returns its target or -1. */
function findLea(buf: Uint8Array, from: number, to: number, lea: number, tail: number[]): number {
  for (let o = from; o + 4 + tail.length * 2 <= Math.min(to, buf.length); o += 2) {
    if (u16(buf, o) !== lea) continue;
    if (tail.every((w, i) => u16(buf, o + 4 + i * 2) === w)) return o + 2 + s16(u16(buf, o + 2));
  }
  return -1;
}

export interface MarkCookseyTables {
  song: number; sub: number; instrument: number; period: number;
}

/** The replayer's tables, located from its own code; null when the module is not the D040 D040 4EFB format. */
export function findMarkCookseyTables(buf: Uint8Array): MarkCookseyTables | null {
  if (buf.length < 64 || u16(buf, 0) !== 0xd040 || u16(buf, 2) !== 0xd040 || u16(buf, 4) !== 0x4efb) return null;
  const base = 6 + s8(buf[7]);
  const entry = (k: number): number => {
    const at = base + 4 * k;
    return u16(buf, at) === 0x6000 ? at + 2 + s16(u16(buf, at + 2)) : -1;
  };
  const play = entry(0), init = entry(1);
  if (play < 0 || init < 0) return null;
  const song = findLea(buf, init, init + 64, 0x43fa, []);
  const span = Math.min(buf.length, play + 0x800);
  const sub = findLea(buf, play, span, 0x41fa, [0xd040, 0xd0c0, 0xd0d0]);
  const instrument = findLea(buf, play, span, 0x41fa, [0xd241, 0xd0c1, 0xd0d0]);
  const period = findLea(buf, play, span, 0x41fa, [0x302d, 0x005c, 0xd040]);
  if ([song, sub, instrument, period].some(a => a <= 0 || a >= buf.length)) return null;
  return { song, sub, instrument, period };
}

export function encodeMarkCookseyStream(rows: TrackerCell[]): Uint8Array {
  return Uint8Array.from(rows, c => (c.period ?? 0) & 0xff);
}

export interface MarkCookseyPlacement {
  voice: number; tick: number;
  /** File offset of the stored note byte. */
  offset: number;
  note: number;
  /** Grid note minus the stored byte, for the transpose and instrument in force. */
  delta: number;
  instrument: number;
}

export interface MarkCookseyGrid {
  patterns: Pattern[];
  voices: number;
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
  blockRows: TrackerCell[][];
  placements: MarkCookseyPlacement[];
  ticks: number;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

interface Frame { start: number; ret: number; count: number }
interface VoiceWalk { pc: number; stack: Frame[]; transpose: number; tick: number; active: boolean; ended: boolean }

/** Build the grid of subsong 0 of a Mark Cooksey module; null when it is not one the walk can read. */
export function buildMarkCookseyGrid(buf: Uint8Array, sourceFile: string): MarkCookseyGrid | null {
  const t = findMarkCookseyTables(buf);
  if (!t) return null;

  const blockIndex = new Map<number, number>();
  const blockRows: TrackerCell[][] = [];
  const addrs: number[] = [];
  const sizes: number[] = [];
  const blockOf = (start: number): void => {
    if (blockIndex.has(start)) return;
    let end = start;
    for (let guard = 0; guard < COMMAND_LIMIT && end < buf.length; guard++) {
      const op = buf[end] & 0x7f;
      const size = opSize(op);
      if (size === 0) break;
      end += size;
      if (op === 0x66 || op === 0x67 || op === 0x68) break;
    }
    end = Math.min(end, buf.length);
    blockIndex.set(start, blockRows.length);
    blockRows.push(Array.from(buf.subarray(start, end), byte => ({ ...emptyCell(), cutoff: 1, period: byte })));
    addrs.push(start);
    sizes.push(end - start);
  };

  const basePeriod = (instr: number): number => {
    const rec = t.instrument + 2 * instr + s16(u16(buf, t.instrument + 2 * instr));
    if (rec < 0 || rec + 24 > buf.length) return 0;
    return u32(buf, rec) !== 0 ? u16(buf, rec + 20) : u16(buf, rec + 22);
  };
  const gridNote = (index: number, instr: number): number => {
    const w = t.period + ((index * 4) & 0xffff) * 2;
    if (index < 0 || w + 2 > buf.length) return 0;
    return periodToGridNote(Math.floor((u16(buf, w) * basePeriod(instr)) / 65536));
  };

  const placements: MarkCookseyPlacement[] = [];
  const timelines: TrackerCell[][] = [[], [], [], []];

  /** Read the bytes of one frame (until a note or rest); returns its duration, or 0 when the channel stopped. */
  const step = (voice: number, w: VoiceWalk): number => {
    for (let guard = 0; guard < COMMAND_LIMIT; guard++) {
      const at = w.pc;
      const byte = buf[at] ?? 0x7f;
      const op = byte & 0x7f;
      if (opSize(op) === 0 || at + opSize(op) > buf.length) break;
      w.pc += opSize(op);
      if (op < NOTE_OPS) {
        const instr = buf[at + 1];
        if (byte <= MAX_NOTE_BYTE) {
          const note = gridNote(byte + w.transpose, instr);
          if (note > 0) {
            timelines[voice][w.tick] = { ...emptyCell(), note, instrument: instr + 1 };
            placements.push({ voice, tick: w.tick, offset: at, note, delta: note - byte, instrument: instr + 1 });
          }
        }
        return Math.max(buf[at + 2], 1);
      }
      switch (op) {
        case 0x60: return Math.max(u16(buf, at + 1), 1);
        case 0x64: case 0x65: {
          if (w.stack.length >= MAX_DEPTH) break;
          const idx = buf[at + 1];
          const start = t.sub + 2 * idx + s16(u16(buf, t.sub + 2 * idx));
          if (start <= 0 || start >= buf.length) break;
          w.transpose = s8(buf[at + 2]);
          w.stack.push({ start, ret: w.pc, count: op === 0x65 ? buf[at + 3] : 0 });
          w.pc = start;
          blockOf(start);
          continue;
        }
        case 0x66: {
          const f = w.stack[w.stack.length - 1];
          if (!f) break;
          f.count = (f.count - 1) & 0xffff;
          if (f.count !== 0xffff) { w.pc = f.start; continue; }
          w.stack.pop();
          w.pc = f.ret;
          w.transpose = 0;
          continue;
        }
        case 0x67: w.active = false; w.ended = true; return 0;
        case 0x68: {
          const target = at + s16(u16(buf, at + 1));
          if (target <= 0 || target >= buf.length) break;
          if (w.stack.length === 0 && target <= at) w.ended = true;
          w.pc = target;
          blockOf(target);
          continue;
        }
        default: continue; // 0x63 volume, 0x69 / 0x6B portamento
      }
      break;
    }
    w.active = false; w.ended = true;
    return 0;
  };

  const walks: Array<VoiceWalk | null> = [0, 1, 2, 3].map(ch => {
    const at = t.song + ch * 4;
    const rel = u32(buf, at);
    if (rel === 0) return null;
    const pc = (at + rel) >>> 0;
    if (pc >= buf.length) return null;
    blockOf(pc);
    return { pc, stack: [], transpose: 0, tick: 0, active: true, ended: false };
  });
  const runUntil = (voice: number, w: VoiceWalk, limit: number, firstPass: boolean): void => {
    while (w.active && w.tick < limit && !(firstPass && w.ended)) {
      const d = step(voice, w);
      if (d === 0) break;
      w.tick += d;
    }
  };
  walks.forEach((w, v) => { if (w) runUntil(v, w, MAX_TICKS, true); });
  if (placements.length === 0) return null;
  const ticks = Math.max(1, ...walks.map(w => (w ? Math.min(w.tick, MAX_TICKS) : 0)));
  // Shorter channels keep looping (their state carries on) until the longest pass is full.
  walks.forEach((w, v) => { if (w && w.active) runUntil(v, w, ticks, false); });
  // A note read on the last looping frame can lie past the grid.
  const kept = placements.filter(pl => pl.tick < ticks);

  const R = MARK_COOKSEY_ROWS_PER_PATTERN;
  const numPatterns = Math.ceil(ticks / R);
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: R,
    channels: timelines.map((line, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: R }, (_, r) => ({ ...(line[p * R + r] ?? emptyCell()) })),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: blockRows.length, originalInstrumentCount: 0,
    },
  }));
  // Each voice's block at a pattern's first note: the stream a cell there was most likely read from.
  const blockAt: number[][] = [[], [], [], []];
  for (const pl of kept) {
    const block = addrs.findIndex((a, i) => pl.offset >= a && pl.offset < a + sizes[i]);
    const p = Math.floor(pl.tick / R);
    if (blockAt[pl.voice][p] === undefined && block >= 0) blockAt[pl.voice][p] = block;
  }
  const trackMap = patterns.map((_, p) => [0, 1, 2, 3].map(v => blockAt[v][p] ?? -1));
  return { patterns, voices: 4, filePatternAddrs: addrs, filePatternSizes: sizes, trackMap, blockRows, placements: kept, ticks };
}

export interface MarkCookseyEditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * Write the grid's note edits into the module. Each changed note cell becomes its stored note byte (grid note minus the
 * delta in force) in place; cells that play the same byte must agree, else the byte is left and a warning returned.
 * Instruments are the note's own byte but also pick the base period, so they are not written.
 */
export function applyMarkCookseyGridEdits(source: Uint8Array, edited: Pattern[]): MarkCookseyEditResult {
  const base = buildMarkCookseyGrid(source, '');
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  if (!base) return { data: out, patched: 0, warnings: ['the module is not a Mark Cooksey module this grid can read'] };
  const R = MARK_COOKSEY_ROWS_PER_PATTERN;
  const cellAt = (voice: number, tick: number): TrackerCell | undefined => edited[Math.floor(tick / R)]?.channels[voice]?.rows[tick % R];
  const placed = new Set<string>();
  const wanted = new Map<number, Set<number>>();
  for (const pl of base.placements) {
    placed.add(`${pl.voice}:${pl.tick}`);
    const cell = cellAt(pl.voice, pl.tick);
    if (!cell) continue;
    if ((cell.note ?? 0) !== pl.note) {
      const b = (cell.note ?? 0) - pl.delta;
      if ((cell.note ?? 0) > 0 && b >= 0 && b <= MAX_NOTE_BYTE) {
        if (!wanted.has(pl.offset)) wanted.set(pl.offset, new Set());
        wanted.get(pl.offset)!.add(b);
      } else warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: note ${cell.note} is outside the stored range or removes the note; not written`);
    }
    if ((cell.instrument ?? 0) !== pl.instrument) {
      warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: instrument edits are not written (the instrument sets the note's base period)`);
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
