/**
 * medleyGrid.ts - the Medley (PV Synth, .mso) tracker grid, read from the module's own track streams.
 *
 * Byte layout (third-party/nuade/players/medley/mdl_module.c, mdl_internal.h; UADE Medley.s): "MSOB", then four u32 at
 * bytes 4/8/12/16, each relative to its own address, giving the Song, Track, Instrument and Wave table bases. The byte
 * before a base is the highest index; an entry is a u32 relative to its own address (0 = empty).
 *   Song record: +0x10..0x13 track of voice 0..3 (0 = unused), +0x1a..0x1d voice instrument, +0x1e default instrument,
 *                +0x1f transpose (int8).
 *   Track: 0x10-byte header (ASCII name), then the stream.
 *   Instrument record: +0x13 transpose (int8).
 * Stream grammar (medley.c mdl_next_step / mdl_run_command): every item is two bytes.
 *   bit 7 set     command (low nibble) + parameter: 0 End, 1 Nop, 2 Volume, 3 Instrument, 4 RandomTrack, 5 Call track,
 *                 6 LoopStart count (0 = 256), 7 LoopEnd, 8 Transpose (voice note offset)
 *   otherwise     note (0 = rest) + duration; duration & 0x7f ticks (0 = skipped, no time), bit 7 = tie
 * One tick = one 50 Hz player tick, the step duration counts down once per tick whatever the song speed.
 * Sounding note = (uint8)(note + song transpose + voice note offset + instrument transpose); the grid shows that value
 * (for a synth instrument it is the replayer's own shown note; for a sampled instrument it is unverified by ear).
 *
 * Layers (docs/FORMAT_COMMAND_STREAM_GRID.md): `blockRows` carry every track stream byte-exact (cutoff = 2, period =
 * byte 0, pan = byte 1). The display grid is carrier-less, one row per tick. A stored note byte is played from every
 * call and loop pass that reaches it, so `placements` lists each of them with the transpose delta in force.
 * Not supported: RandomTrack (command 4) and random-wait voices; a walk that meets one stops that voice.
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellFieldsEqual } from '@/engine/uade/UADEPatternEncoder';

export const MEDLEY_ROWS_PER_PATTERN = 64;
const MAX_FRAMES = 60000;
const MAX_STEPS = 200000;
const STACK_DEPTH = 8;
const CMD_END = 0, CMD_INSTRUMENT = 3, CMD_RANDOM = 4, CMD_CALL = 5, CMD_LOOP_START = 6, CMD_LOOP_END = 7, CMD_TRANSPOSE = 8;

const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) | 0;
const i8 = (v: number): number => (v << 24) >> 24;

export interface MedleyTables { song: number; track: number; instrument: number }

/** Table bases of a Medley module, or null when the header does not hold. */
export function medleyTables(buf: Uint8Array): MedleyTables | null {
  if (buf.length < 0x20 || buf[0] !== 0x4d || buf[1] !== 0x53 || buf[2] !== 0x4f || buf[3] !== 0x42) return null;
  const at = (o: number): number => o + u32(buf, o);
  const t = { song: at(4), track: at(8), instrument: at(12) };
  return [t.song, t.track, t.instrument].every(b => b > 0 && b < buf.length) ? t : null;
}

/** File offset an entry of a table points at, or 0 for an empty or out-of-range entry. */
export function medleyEntry(buf: Uint8Array, base: number, index: number): number {
  const count = buf[base - 1] + 1;
  if (index < 0 || index >= count || base + index * 4 + 4 > buf.length) return 0;
  const rel = u32(buf, base + index * 4);
  const target = rel === 0 ? 0 : base + index * 4 + rel;
  return target > 0 && target < buf.length ? target : 0;
}

/** Stream start and one-past-end (just after the End command) of a track; null for an empty entry. */
export function medleyTrackSpan(buf: Uint8Array, tables: MedleyTables, track: number): { start: number; end: number } | null {
  const t = medleyEntry(buf, tables.track, track);
  if (!t) return null;
  const start = t + 0x10;
  let pos = start;
  while (pos + 1 < buf.length) {
    const op = buf[pos];
    pos += 2;
    if (op >= 0x80 && (op & 0x0f) === CMD_END) break;
  }
  return { start, end: Math.min(pos, buf.length) };
}

/** One carrier cell per two-byte item of a track stream. */
export function decodeMedleyStream(buf: Uint8Array, start: number, end: number): TrackerCell[] {
  const rows: TrackerCell[] = [];
  for (let p = start; p + 1 < end + 1 && p + 1 < buf.length; p += 2) {
    rows.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, cutoff: 2, period: buf[p], pan: buf[p + 1] });
  }
  return rows;
}

export function encodeMedleyStream(rows: TrackerCell[]): Uint8Array {
  const out: number[] = [];
  for (const c of rows) { out.push((c.period ?? 0) & 0xff, (c.pan ?? 0) & 0xff); }
  return new Uint8Array(out);
}

export interface MedleyPlacement {
  voice: number; tick: number;
  /** File offset of the stored note byte. */
  offset: number;
  /** Grid note shown. */
  note: number;
  /** Grid note minus the stored byte: song + voice + instrument transpose in force. Two cells of one byte with different deltas are not the same note. */
  delta: number;
  instrument: number;
}

export interface MedleyGrid {
  patterns: Pattern[];
  voices: number;
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
  blockRows: TrackerCell[][];
  placements: MedleyPlacement[];
  ticks: number;
  /** Voices whose walk stopped at a RandomTrack command. */
  unsupportedVoices: number[];
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** Build the grid of one subsong (1-based, as the song table is indexed). */
export function buildMedleyGrid(buf: Uint8Array, sourceFile: string, subsong = 1): MedleyGrid | null {
  const tables = medleyTables(buf);
  if (!tables) return null;
  const song = medleyEntry(buf, tables.song, subsong);
  if (!song || song + 0x30 > buf.length) return null;
  const songTranspose = i8(buf[song + 0x1f]);
  const trackCount = buf[tables.track - 1] + 1;

  const blockRows: TrackerCell[][] = [];
  const addrs: number[] = [];
  const sizes: number[] = [];
  for (let t = 0; t < trackCount; t++) {
    const span = medleyTrackSpan(buf, tables, t);
    const rows = span ? decodeMedleyStream(buf, span.start, span.end) : [];
    blockRows.push(rows);
    addrs.push(span ? span.start : 0);
    sizes.push(rows.length * 2);
  }

  const instTranspose = (inst: number): number => {
    const r = medleyEntry(buf, tables.instrument, inst);
    return r ? i8(buf[r + 0x13]) : 0;
  };

  const placements: MedleyPlacement[] = [];
  const unsupported: number[] = [];
  const voiceTracks = [0, 1, 2, 3].map(v => buf[song + 0x10 + v]);

  // One pass of a voice's own track from `tick`; returns the tick it ends on (null = RandomTrack met).
  const runPass = (voice: number, track: number, tick: number, line: TrackerCell[], startInst: number): number | null => {
    const span = medleyTrackSpan(buf, tables, track);
    if (!span) return tick;
    let pos = span.start, noteOffset = 0, inst = startInst, steps = 0;
    const calls: number[] = [];
    const loops: Array<{ pos: number; count: number }> = [];
    while (pos + 1 < buf.length && steps++ < MAX_STEPS && tick < MAX_FRAMES) {
      const op = buf[pos], arg = buf[pos + 1];
      if (op >= 0x80) {
        const cmd = op & 0x0f;
        if (cmd === CMD_END) {
          const ret = calls.pop();
          if (ret === undefined) return tick;
          pos = ret;
          continue;
        }
        if (cmd === CMD_RANDOM) return null;
        if (cmd === CMD_INSTRUMENT && medleyEntry(buf, tables.instrument, arg)) inst = arg;
        else if (cmd === CMD_TRANSPOSE) noteOffset = arg;
        else if (cmd === CMD_CALL) {
          const s = medleyTrackSpan(buf, tables, arg);
          if (calls.length < STACK_DEPTH && s) { calls.push(pos + 2); pos = s.start; continue; }
        } else if (cmd === CMD_LOOP_START) {
          if (loops.length < STACK_DEPTH) loops.push({ pos: pos + 2, count: arg === 0 ? 256 : arg });
        } else if (cmd === CMD_LOOP_END) {
          const top = loops[loops.length - 1];
          if (top) {
            if (--top.count > 0) { pos = top.pos; continue; }
            loops.pop();
          }
        }
        pos += 2;
        continue;
      }
      const dur = arg & 0x7f;
      if (dur !== 0) {
        if (op !== 0) {
          const delta = (songTranspose + noteOffset + instTranspose(inst)) | 0;
          const note = (op + delta) & 0xff;
          line[tick] = { ...(line[tick] ?? emptyCell()), note, instrument: inst };
          placements.push({ voice, tick, offset: pos, note, delta: note - op, instrument: inst });
        }
        tick += dur;
      }
      pos += 2;
    }
    return tick;
  };

  const timelines: TrackerCell[][] = [];
  const passLen: number[] = [];
  const startInst = buf[song + 0x1e];
  for (let v = 0; v < 4; v++) {
    const line: TrackerCell[] = [];
    const track = voiceTracks[v];
    let end = 0;
    if (track) {
      const e = runPass(v, track, 0, line, buf[song + 0x1a + v] || startInst || 1);
      if (e === null) { unsupported.push(v); } else end = e;
    }
    line.length = Math.max(line.length, Math.min(end, MAX_FRAMES));
    timelines.push(line);
    passLen.push(end);
  }
  const ticks = Math.max(1, ...passLen);
  // shorter voices loop (the voice restarts its own track on End) until the longest pass is full
  for (let v = 0; v < 4; v++) {
    const track = voiceTracks[v];
    if (!track || passLen[v] <= 0 || unsupported.includes(v)) continue;
    let t = passLen[v];
    while (t < ticks) {
      const e = runPass(v, track, t, timelines[v], buf[song + 0x1a + v] || startInst || 1);
      if (e === null || e <= t) break;
      t = e;
    }
    timelines[v].length = Math.max(timelines[v].length, ticks);
  }
  const rows = Math.max(ticks, ...timelines.map(l => l.length));
  const numPatterns = Math.ceil(Math.min(rows, MAX_FRAMES) / MEDLEY_ROWS_PER_PATTERN);
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: MEDLEY_ROWS_PER_PATTERN,
    channels: timelines.map((line, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: MEDLEY_ROWS_PER_PATTERN }, (_, r) => ({ ...(line[p * MEDLEY_ROWS_PER_PATTERN + r] ?? emptyCell()) })),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: numPatterns, originalInstrumentCount: buf[tables.instrument - 1] + 1,
    },
  }));
  return {
    patterns, voices: 4, filePatternAddrs: addrs, filePatternSizes: sizes,
    trackMap: patterns.map(() => voiceTracks.map(t => t)), blockRows, placements, ticks, unsupportedVoices: unsupported,
  };
}

export interface MedleyEditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * Write the grid's note edits into the module. Each changed cell becomes its stored note byte (grid note minus the transpose
 * in force there, 1..127) in place; cells that play the same byte must agree, else the byte is left and a warning returned.
 */
export function applyMedleyGridEdits(source: Uint8Array, edited: Pattern[], subsong = 1): MedleyEditResult {
  const base = buildMedleyGrid(source, '', subsong);
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  if (!base) return { data: out, patched: 0, warnings: ['the module has no track streams to write into'] };
  const cellAt = (voice: number, tick: number): TrackerCell | undefined =>
    edited[Math.floor(tick / MEDLEY_ROWS_PER_PATTERN)]?.channels[voice]?.rows[tick % MEDLEY_ROWS_PER_PATTERN];
  const placed = new Set<string>();
  const wanted = new Map<number, Set<number>>();
  for (const pl of base.placements) {
    placed.add(`${pl.voice}:${pl.tick}`);
    const cell = cellAt(pl.voice, pl.tick);
    if (!cell) continue;
    if (cell.note !== pl.note) {
      const b = (((cell.note ?? 0) - pl.delta) | 0);
      if (b >= 1 && b < 0x80 && (cell.note ?? 0) > 0) {
        if (!wanted.has(pl.offset)) wanted.set(pl.offset, new Set());
        wanted.get(pl.offset)!.add(b);
      } else warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: note ${cell.note} is outside the stored range or removes the note; not written`);
    }
    if ((cell.instrument ?? 0) !== pl.instrument) warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: instrument changes are not written yet`);
  }
  let patched = 0;
  for (const [offset, set] of wanted) {
    if (set.size === 1) { out[offset] = [...set][0]; patched++; }
    else warnings.push(`stream byte ${offset}: cells that play it were edited to different notes; not written`);
  }
  let stray = 0;
  edited.forEach((pat, p) => pat.channels.forEach((chn, v) => chn.rows.forEach((cell, r) => {
    const tick = p * MEDLEY_ROWS_PER_PATTERN + r;
    if (placed.has(`${v}:${tick}`)) return;
    const was = base.patterns[p]?.channels[v]?.rows[r] ?? emptyCell();
    if (!cellFieldsEqual(cell, was)) stray++;
  })));
  if (stray > 0) warnings.push(`${stray} edited cell(s) are not on a note; not written (the stream would change length)`);
  return { data: out, patched, warnings };
}
