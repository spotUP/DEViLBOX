/**
 * quartetPsgGrid.ts - the Quartet PSG (.sqt, Atari ST YM-2149) tracker grid, read from the module's own voice streams.
 *
 * A .sqt file is a self-contained 68000 program (UADE wanted_team/Quartet_PSG calls it: init = file offset 0, play = 4).
 * Offset 0 is BRA.W to init. Init loads the song base with `lea pc@(d16),a0` (41FA), in one of two forms:
 *   pair   lea song0,a0; tst.w d0; beq; lea song1,a0                  (horror zombies from crypt.sqt)
 *   table  lea table,a0; asl.w #1,d0; adda.w a0@(0,d0.w),a0           (warlock_the_avenger.sqt; word offsets from table)
 * Song: 16-byte header (word at +4 = row step in sub-ticks, the gcd of the durations), then three voice streams back to
 * back: voice 0 starts at base+16, each next voice right after the previous voice's 'F' record.
 * Stream (play routine, 4 sub-ticks per play call): 12-byte big-endian records, command word first.
 *   'P' 0x50  +2 duration (sub-ticks), +4 long frequency F, +8 unused: note on
 *   'R' 0x52  +2 duration: rest            'S' 0x53  +2 duration, +4 long target F, +8 long rate: slide, no retrigger
 *   'V' 0x56  +8 long, only the low word (+10..+11) is read: it is 4 * instrument number, no time, no volume. Bytes +2..+9
 *             are never read by the player (editor leftovers) and stay byte-exact.
 *   'l' 0x6c  loop start                    'L' 0x4c  +8 word count: loop body runs count + 1 times
 *   'F' 0x46  back to the stream start (voice end)
 * Pitch: the replayer turns F into a YM period = 3579545 * 8 / F; on the ST's 2 MHz YM the tone is F / 229.09 Hz, and all
 * stored frequencies sit on that equal-tempered table. The grid note is the nearest MIDI note (octave unverified by ear).
 *
 * Layers (docs/FORMAT_COMMAND_STREAM_GRID.md): `blockRows` carry every voice stream byte-exact, one carrier cell per two
 * bytes (cutoff = 2, period = byte 0, pan = byte 1). The display grid is carrier-less, one row per header step.
 * A record reached by several loop passes is listed once per pass in `placements`.
 *
 * Instruments (decode: thoughts/spot/2026-11-13-quartet-v-decode.md): at note-on the player reads the word table of file
 * offsets (init-adjacent code `lea table,a2` = 45fa disp, followed by 3472 1000) at the voice's V number and copies the
 * 14-byte definition it points to. The grid's instrument column = V number + 1; a note before any V is instrument 0 (id 1).
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellFieldsEqual } from '@/engine/uade/UADEPatternEncoder';
import { midiToNoteValue, noteValueToMidi } from '@/lib/tracker/noteValue';

export const QUARTET_ROWS_PER_PATTERN = 64;
const VOICES = 3;
const REC = 12;
const MAX_ROWS = 200000;
const MAX_STEPS = 2000000;
/** Hz = F / FREQ_PER_HZ on the ST (2 MHz YM clock, period = 3579545 * 8 / F). */
const FREQ_PER_HZ = (3579545 * 8 * 16) / 2000000;
const CMD = { P: 0x50, R: 0x52, S: 0x53, V: 0x56, F: 0x46, LOOP_START: 0x6c, LOOP_END: 0x4c };

const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const s16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export function quartetFreqToNote(freq: number): number {
  if (freq <= 0) return 0;
  return midiToNoteValue(Math.round(69 + 12 * Math.log2(freq / FREQ_PER_HZ / 440)));
}

/** Stored frequency long for a grid note; re-imports to the same note. */
export function quartetNoteToFreq(note: number): number | null {
  const midi = noteValueToMidi(note);
  if (midi === null) return null;
  const f = Math.round(FREQ_PER_HZ * 440 * Math.pow(2, (midi - 69) / 12));
  return f > 0 && f <= 0xffffffff ? f : null;
}

/** File offsets of the songs the init routine can select, in subsong order; [] when the code shape is not recognised. */
export function quartetSongBases(buf: Uint8Array): number[] {
  if (buf.length < 0x40 || u16(buf, 0) !== 0x6000) return [];
  const init = 2 + s16(buf, 2);
  const valid = (o: number): boolean => o > 0 && o + 16 + REC <= buf.length;
  for (let p = init; p >= 0 && p + 16 < buf.length && p < init + 0x40; p += 2) {
    if (u16(buf, p) !== 0x41fa) continue;
    const a = p + 2 + s16(buf, p + 2);
    if (u16(buf, p + 4) === 0xe340 && u16(buf, p + 6) === 0xd0f0) {
      // word offsets from the table; the table ends where the first song starts
      const out: number[] = [];
      for (let i = 0; a + i * 2 + 2 <= buf.length; i++) {
        const t = a + s16(buf, a + i * 2);
        // entries ascend; the first one that does not is padding after the real table (warlock: 5 songs, then 0xe96 repeated)
        if (!valid(t) || t <= a + i * 2 || (out.length && (a + i * 2 >= Math.min(...out) || t <= out[out.length - 1]))) break;
        out.push(t);
      }
      return out;
    }
    if (u16(buf, p + 4) === 0x4a40 && (u16(buf, p + 6) & 0xff00) === 0x6700) {
      const q = p + 8;
      if (u16(buf, q) !== 0x41fa) return valid(a) ? [a] : [];
      const b = q + 2 + s16(buf, q + 2);
      return [a, b].filter(valid);
    }
    return valid(a) ? [a] : [];
  }
  return [];
}

/** Voice stream spans [start, end) of a song: end is just past the voice's 'F' record. */
export function quartetVoiceSpans(buf: Uint8Array, base: number): Array<{ start: number; end: number }> | null {
  const spans: Array<{ start: number; end: number }> = [];
  let p = base + 16;
  for (let v = 0; v < VOICES; v++) {
    const start = p;
    while (p + REC <= buf.length && u16(buf, p) !== CMD.F) p += REC;
    if (p + REC > buf.length) return null;
    p += REC;
    spans.push({ start, end: p });
  }
  return spans;
}

/** One carrier cell per two bytes of a voice stream. */
export function decodeQuartetStream(buf: Uint8Array, start: number, end: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  for (let p = start; p + 1 < end + 1 && p + 1 < buf.length; p += 2) {
    rows.push({ ...emptyCell(), cutoff: 2, period: buf[p], pan: buf[p + 1] });
  }
  return rows;
}

export function encodeQuartetStream(rows: TrackerCell[]): Uint8Array {
  const out: number[] = [];
  for (const c of rows) out.push((c.period ?? 0) & 0xff, (c.pan ?? 0) & 0xff);
  return new Uint8Array(out);
}

/** A stored note record placed on the grid: `offset` is the record, the frequency long is at offset + 4. */
export interface QuartetPlacement {
  voice: number; row: number; offset: number; note: number; slide: boolean;
  /** offset of the 'V' record that governs this note (its low word is at +10), or null before the voice's first V */
  vOffset: number | null;
  /** instrument column value: V number + 1 */
  instrument: number;
}

export interface QuartetInstrumentDef { number: number; offset: number; name: string }

const INSTR_LEN = 14;

/** The word table of instrument-definition file offsets; entries run until an odd or out-of-file entry or the first definition. */
export function quartetInstrumentOffsets(buf: Uint8Array): number[] {
  for (let p = 0; p + 8 <= buf.length && p < 0x2000; p += 2) {
    if (u16(buf, p) !== 0x45fa || u16(buf, p + 4) !== 0x3472 || u16(buf, p + 6) !== 0x1000) continue;
    const a = p + 2 + s16(buf, p + 2);
    const out: number[] = [];
    let lowest = Infinity;
    for (let i = 0; a + i * 2 + 2 <= buf.length && a + i * 2 < lowest; i++) {
      const o = u16(buf, a + i * 2);
      if ((o & 1) || o + INSTR_LEN > buf.length) break;
      out.push(o);
      lowest = Math.min(lowest, o);
    }
    return out;
  }
  return [];
}

/** Name from the decoded fields of a 14-byte definition, full English words. */
export function quartetInstrumentName(buf: Uint8Array, o: number): string {
  const mixer = buf[o + 6], flags = buf[o + 12];
  const parts: string[] = [];
  const tone = !(mixer & 1), noise = !(mixer & 8);
  parts.push(tone && noise ? 'Tone and Noise' : tone ? 'Tone' : noise ? 'Noise' : 'Silent');
  if (buf[o + 8] !== 0) parts.push(flags & 2 ? 'Vibrato' : 'Pitch Sweep');
  if (buf[o + 7] !== 0) parts.push('Random Pitch');
  if (flags & 1) parts.push('Hold');
  if (flags & 4) parts.push('Octave Down');
  parts.push(`Volume Sequence ${buf[o + 10]}`);
  return parts.join(', ');
}

export interface QuartetGrid {
  patterns: Pattern[];
  voices: number;
  step: number;
  rows: number;
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
  blockRows: TrackerCell[][];
  placements: QuartetPlacement[];
  /** one per V number used in this song, in number order */
  instruments: QuartetInstrumentDef[];
  subsongs: number;
}

export function buildQuartetGrid(buf: Uint8Array, sourceFile: string, subsong = 0): QuartetGrid | null {
  const bases = quartetSongBases(buf);
  const base = bases[Math.min(Math.max(0, subsong), bases.length - 1)];
  if (base === undefined) return null;
  const spans = quartetVoiceSpans(buf, base);
  if (!spans) return null;
  const step = Math.max(1, u16(buf, base + 4));
  const placements: QuartetPlacement[] = [];
  const timelines: TrackerCell[][] = spans.map(() => []);

  // the voice's current V record survives loop passes and the stream restart
  const curV: Array<{ offset: number; number: number } | null> = spans.map(() => null);
  const usedNumbers = new Set<number>();

  // One pass of a voice stream from sub-tick t0; returns the sub-tick it ends on.
  const runPass = (v: number, t0: number): number => {
    const { start, end } = spans[v];
    const loops: Array<{ at: number; done: number }> = [];
    let t = t0, p = start, steps = 0;
    while (p + REC <= end && steps++ < MAX_STEPS && t / step < MAX_ROWS) {
      const cmd = u16(buf, p);
      if (cmd === CMD.F) break;
      if (cmd === CMD.LOOP_START) { loops.push({ at: p + REC, done: 0 }); p += REC; continue; }
      if (cmd === CMD.LOOP_END) {
        const top = loops[loops.length - 1];
        if (top && top.done < u16(buf, p + 8)) { top.done++; p = top.at; continue; }
        loops.pop(); p += REC; continue;
      }
      if (cmd === CMD.V) {
        curV[v] = { offset: p, number: u16(buf, p + 10) >> 2 };
        usedNumbers.add(curV[v]!.number);
        p += REC; continue;
      }
      if (cmd === CMD.P || cmd === CMD.S) {
        const row = Math.floor(t / step);
        const line = timelines[v];
        while (line.length <= row) line.push(emptyCell());
        if (!line[row].note) {
          const note = quartetFreqToNote(u32(buf, p + 4));
          const instrument = (curV[v]?.number ?? 0) + 1;
          if (!curV[v]) usedNumbers.add(0);
          line[row] = { ...emptyCell(), note, instrument, effTyp: cmd === CMD.S ? 3 : 0 };
          placements.push({ voice: v, row, offset: p, note, slide: cmd === CMD.S, vOffset: curV[v]?.offset ?? null, instrument });
        }
      }
      if (cmd === CMD.P || cmd === CMD.S || cmd === CMD.R) t += u16(buf, p + 2);
      p += REC;
    }
    return t;
  };

  const passLen = spans.map((_, v) => runPass(v, 0));
  const ticks = Math.max(step, ...passLen);
  // a voice that ends restarts its own stream ('F'), so shorter voices loop until the longest pass is full
  spans.forEach((_, v) => {
    let t = passLen[v];
    while (passLen[v] > 0 && t < ticks) { const e = runPass(v, t); if (e <= t) break; t = e; }
  });
  const table = quartetInstrumentOffsets(buf);
  const instruments: QuartetInstrumentDef[] = [...usedNumbers].sort((a, b) => a - b)
    .filter(n => n < table.length)
    .map(n => ({ number: n, offset: table[n], name: quartetInstrumentName(buf, table[n]) }));
  const rows = Math.min(MAX_ROWS, Math.ceil(ticks / step));
  const numPatterns = Math.max(1, Math.ceil(rows / QUARTET_ROWS_PER_PATTERN));
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: QUARTET_ROWS_PER_PATTERN,
    channels: timelines.map((line, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: QUARTET_ROWS_PER_PATTERN }, (_, r) => {
        const at = p * QUARTET_ROWS_PER_PATTERN + r;
        return at < rows ? { ...(line[at] ?? emptyCell()) } : emptyCell();
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: VOICES, originalPatternCount: numPatterns, originalInstrumentCount: Math.max(1, instruments.length),
    },
  }));
  return {
    patterns, voices: VOICES, step, rows,
    filePatternAddrs: spans.map(s => s.start), filePatternSizes: spans.map(s => s.end - s.start),
    trackMap: patterns.map(() => spans.map((_, v) => v)),
    blockRows: spans.map(s => decodeQuartetStream(buf, s.start, s.end)),
    placements: placements.filter(pl => pl.row < rows), instruments, subsongs: bases.length,
  };
}

export interface QuartetEditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * Write the grid's note edits into the module: a changed note becomes the stored frequency long of its 'P' / 'S' record.
 * A changed instrument rewrites the low word of the governing 'V' record (number * 4). Cells played from the same record must agree; any other changed cell is reported, not written.
 */
export function applyQuartetGridEdits(source: Uint8Array, edited: Pattern[], subsong = 0): QuartetEditResult {
  const out = new Uint8Array(source);
  const base = buildQuartetGrid(source, '', subsong);
  if (!base) return { data: out, patched: 0, warnings: ['the module has no voice streams to write into'] };
  const cellAt = (voice: number, row: number): TrackerCell | undefined =>
    edited[Math.floor(row / QUARTET_ROWS_PER_PATTERN)]?.channels[voice]?.rows[row % QUARTET_ROWS_PER_PATTERN];
  const warnings: string[] = [];
  const wanted = new Map<number, Set<number>>();
  const wantedV = new Map<number, Set<number>>();
  const tableLen = quartetInstrumentOffsets(source).length;
  const placed = new Set<string>();
  for (const pl of base.placements) {
    placed.add(`${pl.voice}:${pl.row}`);
    const cell = cellAt(pl.voice, pl.row);
    if (!cell) continue;
    if ((cell.instrument ?? 0) !== pl.instrument) {
      const n = (cell.instrument ?? 0) - 1;
      if (pl.vOffset === null) warnings.push(`voice ${pl.voice + 1} row ${pl.row}: no sound setup record before this note, its instrument is read-only; not written`);
      else if (n < 0 || n >= tableLen || n * 4 > 0xffff) warnings.push(`voice ${pl.voice + 1} row ${pl.row}: instrument ${cell.instrument} is not in the module's instrument table; not written`);
      else {
        if (!wantedV.has(pl.vOffset)) wantedV.set(pl.vOffset, new Set());
        wantedV.get(pl.vOffset)!.add(n);
      }
    }
    if (cell.note === pl.note) continue;
    const f = (cell.note ?? 0) > 0 ? quartetNoteToFreq(cell.note ?? 0) : null;
    if (f === null) { warnings.push(`voice ${pl.voice + 1} row ${pl.row}: note ${cell.note} removes the note or has no frequency; not written`); continue; }
    if (!wanted.has(pl.offset)) wanted.set(pl.offset, new Set());
    wanted.get(pl.offset)!.add(f);
  }
  let patched = 0;
  for (const [offset, set] of wanted) {
    if (set.size !== 1) { warnings.push(`record at ${offset}: cells that play it were edited to different notes; not written`); continue; }
    const f = [...set][0];
    out[offset + 4] = (f >>> 24) & 0xff; out[offset + 5] = (f >>> 16) & 0xff; out[offset + 6] = (f >>> 8) & 0xff; out[offset + 7] = f & 0xff;
    patched++;
  }
  // all notes played under one V record share its instrument; the cells that read it must agree
  const vNumbers = new Map<number, Set<number>>();
  for (const pl of base.placements) {
    if (pl.vOffset === null) continue;
    const c = cellAt(pl.voice, pl.row);
    if (!c) continue;
    if (!vNumbers.has(pl.vOffset)) vNumbers.set(pl.vOffset, new Set());
    vNumbers.get(pl.vOffset)!.add((c.instrument ?? 0) - 1);
  }
  for (const [vOffset, set] of wantedV) {
    const all = vNumbers.get(vOffset)!;
    if (all.size !== 1) { warnings.push(`sound setup record at ${vOffset}: the notes under it were given different instruments; not written`); continue; }
    const n = [...set][0], v = n * 4;
    out[vOffset + 10] = (v >>> 8) & 0xff; out[vOffset + 11] = v & 0xff;
    patched++;
  }
  let stray = 0;
  edited.forEach((pat, p) => pat.channels.forEach((chn, v) => chn.rows.forEach((cell, r) => {
    const row = p * QUARTET_ROWS_PER_PATTERN + r;
    const was = base.patterns[p]?.channels[v]?.rows[r] ?? emptyCell();
    if (placed.has(`${v}:${row}`)) { if (!cellFieldsEqual({ ...cell, note: was.note, instrument: was.instrument }, was)) stray++; }
    else if (!cellFieldsEqual(cell, was)) stray++;
  })));
  if (stray > 0) warnings.push(`${stray} edited cell(s) change more than a stored note; not written (the stream would change length)`);
  return { data: out, patched, warnings };
}
