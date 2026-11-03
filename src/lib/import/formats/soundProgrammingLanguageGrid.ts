/**
 * Sound Programming Language (.spl) - the time-aligned, read-only grid (phase A) and its byte-exact stream carriers.
 *
 * Decoder truth: third-party/nuade/players/spl/spl.c (step_voice, divider_fires, start_note_plain) and spl_builds.c.
 * The module is an Amiga hunk (code starts at file offset 0x20) with a replayer that carries four per-voice command
 * streams. The replayer is one design in several builds, told apart by the FNV-1a hash that spl_module.c computes
 * (hunk size, code up to the build's `prefix_end`, relocation count, relocations); only builds listed in BUILDS are
 * decoded, any other module reports a gridUnmatchedReason.
 *
 * Stream bytes (pointers are hunk offsets, file offset = offset + 0x20): 0xC0..0xEF sets the length (byte - 0xC0
 * steps), 0xF0 copies a 0x22-byte instrument record inline, 0xF1 calls the long that follows (the return resumes
 * behind the operand), 0xF2 returns, 0xF3 jumps, 0xF4 is a no-op, any other byte is a note (octave nibble, semitone
 * nibble). A note whose record flags say so is followed by more note bytes in the same step. A note holds for
 * max(length, 1) steps. One grid row is one stream step (Swing divider: a step every (reload + 1) / 2 ticks).
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): the stream bytes are the truth; `blockRows` holds one carrier
 * cell per stream byte (cutoff 2, period = the byte) so the encoder rebuilds them; the grid shows a note on the row
 * where it starts and empty rows while it is held. A voice is decoded until its first backward jump (the song loop).
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';

const ROWS_PER_PATTERN = 64;
const MAX_ROWS = 32768;
const VOICES = 4;
const CODE = 0x20;
const TIMEBASE_HZ = 709379;
const MAX_COMMANDS = 262144;
const MAX_CALL_DEPTH = 64;
const RECORD_BYTES = 0x22;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

const u8 = (b: Uint8Array, o: number): number => b[o] ?? 0;
const u16 = (b: Uint8Array, o: number): number => (u8(b, o) << 8) | u8(b, o + 1);
const u32 = (b: Uint8Array, o: number): number => (u16(b, o) * 65536 + u16(b, o + 2)) >>> 0;
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** One replayer build of spl_builds.c (Full family, Swing divider: the only combination decoded so far). */
interface SplBuildInfo {
  name: string;
  hash: bigint;
  prefixEnd: number;
  dividerReload: number;
  periodTable: number;
  transpose: number;
  streams: number[];
}

const BUILDS: SplBuildInfo[] = [
  {
    name: 'Boulder Dash',
    hash: 0xb65ea0229bf7fb11n,
    prefixEnd: 0x13a2,
    dividerReload: 7,
    periodTable: 0x2f6,
    transpose: 9,
    streams: [0xa26, 0xabe, 0xbbe, 0xc96],
  },
];

export interface SplHunk { code: number; size: number; relocations: number[] }

/** The hunk as spl_module.c parse_hunk_file takes it (one code hunk, one RELOC32 block), or why not. */
export function readSplHunk(buf: Uint8Array): SplHunk | string {
  if (buf.length < 0x40) return 'the file is too short';
  const expect = [0x3f3, 0, 1, 0, 0];
  for (let i = 0; i < expect.length; i++) if (u32(buf, i * 4) !== expect[i]) return 'not a single-hunk Amiga executable';
  const words = u32(buf, 0x14) & 0x3fffffff;
  if ((u32(buf, 0x18) & 0x3fffffff) !== 0x3e9 || u32(buf, 0x1c) !== words) return 'no code hunk';
  const size = words * 4;
  if (CODE + size > buf.length) return 'the code hunk runs past the end of the file';
  const hdr = '!SOPROL!';
  for (let i = 0; i < hdr.length; i++) if (buf[CODE + 4 + i] !== hdr.charCodeAt(i)) return 'no !SOPROL! identification';
  if (u32(buf, CODE) !== 0x70ff4e75) return 'the code does not start with moveq #-1,d0 / rts';
  const relocations: number[] = [];
  let at = CODE + size;
  if ((u32(buf, at) & 0x3fffffff) === 0x3ec) {
    const count = u32(buf, at + 4);
    for (let i = 0; i < count && at + 12 + i * 4 + 4 <= buf.length; i++) relocations.push(u32(buf, at + 12 + i * 4));
  }
  return { code: CODE, size, relocations };
}

/** spl_module.c build_hash: FNV-1a over size, code prefix, relocation count and relocations. */
function buildHash(buf: Uint8Array, hunk: SplHunk, prefixEnd: number): bigint {
  let h = FNV_OFFSET;
  const feed = (byte: number): void => { h = ((h ^ BigInt(byte)) * FNV_PRIME) & MASK64; };
  const feed32 = (v: number): void => { feed(v >>> 24); feed((v >>> 16) & 0xff); feed((v >>> 8) & 0xff); feed(v & 0xff); };
  feed32(hunk.size);
  for (let i = 0; i < prefixEnd; i++) feed(u8(buf, CODE + i));
  feed32(hunk.relocations.length);
  for (const r of hunk.relocations) feed32(r);
  return h;
}

/** The known build of a module, or why the module cannot be decoded. */
export function readSplBuild(buf: Uint8Array): { build: SplBuildInfo; hunk: SplHunk; timer: number } | string {
  const hunk = readSplHunk(buf);
  if (typeof hunk === 'string') return hunk;
  for (const build of BUILDS) {
    if (build.prefixEnd <= hunk.size && buildHash(buf, hunk, build.prefixEnd) === build.hash) {
      return { build, hunk, timer: u32(buf, CODE + 0x34) };
    }
  }
  return 'the replayer build is not one of the decoded builds';
}

export function isSplModule(buf: Uint8Array): boolean {
  return typeof readSplBuild(buf) !== 'string';
}

export interface SplStream { offset: number; size: number }
export type SplRowSource = { stream: number; offset: number; length: number } | null;

export interface SplGrid {
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  streams: SplStream[];
  blockRows: TrackerCell[][];
  rowSources: SplRowSource[][][];
  streamAtStart: number[][];
  /** BPM that makes one grid row last one replayer step at speed 1 */
  bpm: number;
  buildName: string;
}

interface Placed { tick: number; note: number; instrument: number; run: number; offset: number; length: number }
interface Run { start: number; end: number }

/** transpose_note: octave in the high nibble, semitone in the low. */
function transposeNote(note: number, steps: number): number {
  let n = note;
  for (let s = steps & 0xff; s > 0; s--) {
    n = (n + 1) & 0xff;
    if ((n & 0x0f) === 0x0c) n = (n + 0x10) & 0xf0;
  }
  return n;
}

export function buildSplGrid(buf: Uint8Array): SplGrid | string {
  const found = readSplBuild(buf);
  if (typeof found === 'string') return found;
  const { build, hunk, timer } = found;
  const at = (hunkOffset: number): number => CODE + hunkOffset;
  const inHunk = (hunkOffset: number, n = 1): boolean => hunkOffset >= 0 && hunkOffset + n <= hunk.size;

  const runs: Run[] = [];
  const runIndex = new Map<number, number>();
  const runOf = (start: number): number => {
    let i = runIndex.get(start);
    if (i === undefined) { i = runs.length; runs.push({ start, end: start }); runIndex.set(start, i); }
    return i;
  };
  const instruments = new Map<number, number>();
  const periodOf = (note: number, octave: number): number => {
    const shifted = (note + ((octave << 4) & 0xff)) & 0xff;
    return u16(buf, at(build.periodTable + 2 * (shifted & 0x0f))) >> (shifted >> 4);
  };

  const voices: Placed[][] = [];
  const lengths: number[] = [];
  let commands = 0;
  for (let v = 0; v < VOICES; v++) {
    const placed: Placed[] = [];
    let pos = build.streams[v];
    let run = runOf(pos);
    const stack: Array<{ operand: number; run: number }> = [];
    let row = 0;
    let reload = 0;
    let instrument = 0;
    const rec = { flags: 0, octave: 0, transpose: 0 };
    let done = false;
    while (!done && row < MAX_ROWS) {
      if (commands++ > MAX_COMMANDS || !inHunk(pos)) return 'a command stream runs out of the hunk or does not loop';
      const b = u8(buf, at(pos));
      const touch = (end: number): void => { if (end > runs[run].end) runs[run].end = end; };
      if (b === 0xf4) { pos += 1; touch(pos); }
      else if (b === 0xf3) {
        const target = u32(buf, at(pos + 1));
        touch(pos + 5);
        if (pos + 1 >= target) done = true;
        else { pos = target; run = runOf(pos); }
      } else if (b === 0xf1) {
        if (stack.length >= MAX_CALL_DEPTH) return 'a command stream nests calls too deep';
        stack.push({ operand: pos + 1, run });
        touch(pos + 5);
        pos = u32(buf, at(pos + 1));
        run = runOf(pos);
      } else if (b === 0xf2) {
        const top = stack.pop();
        touch(pos + 1);
        if (!top) { done = true; } else { pos = top.operand + 4; run = top.run; }
      } else if (b === 0xf0) {
        const rp = pos + 1;
        if (!inHunk(rp, RECORD_BYTES)) return 'an instrument record runs out of the hunk';
        rec.octave = u16(buf, at(rp + 0x0c));
        rec.flags = u16(buf, at(rp + 0x0e));
        rec.transpose = u16(buf, at(rp + 0x20));
        if (!instruments.has(rp)) instruments.set(rp, instruments.size + 1);
        instrument = instruments.get(rp) ?? 0;
        pos = rp + RECORD_BYTES;
        touch(pos);
      } else if (b >= 0xc0 && b <= 0xef) {
        reload = b - 0xc0;
        pos += 1;
        touch(pos);
      } else {
        const more = (rec.flags & 1) === 0 ? 0 : (rec.flags & 0x20) !== 0 ? 3 : 1;
        const moved = transposeNote(b, build.transpose + rec.transpose);
        const period = periodOf(moved, rec.octave);
        placed.push({ tick: row, note: period > 0 ? periodToNote(period) : 0, instrument, run, offset: at(pos), length: 1 + more });
        pos += 1 + more;
        touch(pos);
        row += Math.max(reload, 1);
      }
    }
    voices.push(placed);
    lengths.push(row);
  }

  const rows = Math.min(MAX_ROWS, Math.max(1, ...lengths));
  if (voices.every((p) => p.length === 0)) return 'the voices have no notes';

  const grid: TrackerCell[][] = Array.from({ length: VOICES }, () => Array.from({ length: rows }, emptyCell));
  const sources: SplRowSource[][] = Array.from({ length: VOICES }, () => new Array<SplRowSource>(rows).fill(null));
  const runAtTick: number[][] = Array.from({ length: VOICES }, () => new Array<number>(rows).fill(-1));
  voices.forEach((placed, v) => {
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      if (p.tick >= rows) break;
      const cell = grid[v][p.tick];
      cell.note = p.note;
      if (p.note > 0) cell.instrument = p.instrument;
      sources[v][p.tick] = { stream: p.run, offset: p.offset, length: p.length };
      const endTick = Math.min(rows, i + 1 < placed.length ? placed[i + 1].tick : rows);
      for (let t = p.tick; t < endTick; t++) runAtTick[v][t] = p.run;
    }
  });

  const streams: SplStream[] = runs.map((r) => ({ offset: at(r.start), size: r.end - r.start }));
  const blockRows = streams.map((s) => {
    const out: TrackerCell[] = [];
    for (let o = s.offset; o < s.offset + s.size; o++) out.push({ ...emptyCell(), cutoff: 2, period: u8(buf, o) });
    return out;
  });

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const rowSources: SplRowSource[][][] = [];
  const streamAtStart: number[][] = [];
  for (let start = 0, p = 0; start < rows; start += ROWS_PER_PATTERN, p++) {
    const len = Math.min(ROWS_PER_PATTERN, rows - start);
    const chData: ChannelData[] = grid.map((cells, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      rows: cells.slice(start, start + len),
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    rowSources.push(sources.map((s) => s.slice(start, start + len)));
    streamAtStart.push(runAtTick.map((s) => s[start]));
  }
  // one step every (reload + 1) / 2 ticks of TIMEBASE_HZ / timer Hz; at speed 1 a row is one tick of 2.5 / BPM seconds
  const ticksPerStep = (build.dividerReload + 1) / 2;
  const bpm = Math.max(32, Math.min(255, Math.round((2.5 * TIMEBASE_HZ) / (timer * ticksPerStep))));
  return { patterns, songPositions, rows, streams, blockRows, rowSources, streamAtStart, bpm, buildName: build.name };
}
