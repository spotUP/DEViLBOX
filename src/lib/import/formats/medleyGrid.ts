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
// A runaway guard only: combat.mso subsong 7 (Combat) really runs 123264 ticks (16 passes of its loop), so the cap must stay above any real song.
const MAX_FRAMES = 400000;
const MAX_STEPS = 4000000;
const STACK_DEPTH = 8;
const CMD_END = 0, CMD_INSTRUMENT = 3, CMD_RANDOM = 4, CMD_CALL = 5, CMD_LOOP_START = 6, CMD_LOOP_END = 7, CMD_TRANSPOSE = 8;

const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) | 0;
const i8 = (v: number): number => (v << 24) >> 24;

export interface MedleyTables { song: number; track: number; instrument: number; wave: number }

/** Table bases of a Medley module, or null when the header does not hold. */
export function medleyTables(buf: Uint8Array): MedleyTables | null {
  if (buf.length < 0x20 || buf[0] !== 0x4d || buf[1] !== 0x53 || buf[2] !== 0x4f || buf[3] !== 0x42) return null;
  const at = (o: number): number => o + u32(buf, o);
  const t = { song: at(4), track: at(8), instrument: at(12), wave: at(16) };
  return [t.song, t.track, t.instrument, t.wave].every(b => b > 0 && b < buf.length) ? t : null;
}

/** File offset an entry of a table points at, or 0 for an empty or out-of-range entry. */
export function medleyEntry(buf: Uint8Array, base: number, index: number): number {
  const count = buf[base - 1] + 1;
  if (index < 0 || index >= count || base + index * 4 + 4 > buf.length) return 0;
  const rel = u32(buf, base + index * 4);
  const target = rel === 0 ? 0 : base + index * 4 + rel;
  return target > 0 && target < buf.length ? target : 0;
}

/**
 * Every filled entry of the instrument table: `number` is the table index the stream's Instrument command and the song
 * record's instrument bytes use (index 0 is never filled), `name` the NUL-padded ASCII name in the record's first 16 bytes.
 */
export function medleyInstrumentList(buf: Uint8Array): Array<{ number: number; name: string }> {
  const tables = medleyTables(buf);
  if (!tables) return [];
  const out: Array<{ number: number; name: string }> = [];
  for (let n = 0; n <= buf[tables.instrument - 1]; n++) {
    const rec = medleyEntry(buf, tables.instrument, n);
    if (!rec || rec + 0x10 > buf.length) continue;
    let name = '';
    for (let i = 0; i < 16 && buf[rec + i] !== 0; i++) name += String.fromCharCode(buf[rec + i]);
    out.push({ number: n, name });
  }
  return out;
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

// Sampled-instrument pitch (mdl_module.c mdl_note_region / mdl_region_wave / mdl_sample_period_index, medley.c
// mdl_select_pitch). The replayer's period table (mdl_data.c) steps one semitone per index and holds ProTracker's C-1 (856)
// at index MDL_C1_INDEX = 50, so DEViLBOX's note for period 856 (periodNotes.ts: 856 = note 13 = C-1, 428 = note 25 =
// C-2) is index - 50 + 13. The medleyRoundtrip test reads mdl_data.c to hold the index of 856 and 428.
const REGION_START = [0x00, 0x1a, 0x26, 0x32, 0x3e, 0x4a, 0x56, 0x62];
const SAMPLED_PERIOD_BASE = 0x30;
const C1_INDEX = 50;
const PERIOD_COUNT = 110;
const INST_TYPE = 0x10, INST_WAVE = 0x14, WAVE_OCTAVE = 0x14, TYPE_LOOPED = 1, TYPE_SYNTH = 2;
const GRID_NOTE_OF_C1 = 13;

/**
 * The grid note a note byte sounds on an instrument: for a synth instrument the sounding value itself, for a sampled one
 * the note of the period the replayer picks. Null when the period index is outside the replayer's table (or the wave is
 * missing), where the grid shows no note.
 */
export function medleySoundingGridNote(buf: Uint8Array, tables: MedleyTables, instrument: number, sounding: number): number | null {
  const rec = medleyEntry(buf, tables.instrument, instrument);
  if (!rec || buf[rec + INST_TYPE] === TYPE_SYNTH) return sounding;
  let region = REGION_START.length - 1;
  while (region > 0 && sounding < REGION_START[region]) region--;
  let wave = buf[rec + INST_WAVE + region];
  while (wave === 0 && region > 0) wave = buf[rec + INST_WAVE + --region];
  const w = medleyEntry(buf, tables.wave, wave);
  if (!w) return null;
  let index = (sounding - buf[w + WAVE_OCTAVE] * 12) & 0xff;
  if (buf[rec + INST_TYPE] === TYPE_LOOPED) index = (index - 12) & 0xff;
  index = (index + SAMPLED_PERIOD_BASE) & 0xff;
  const note = index - C1_INDEX + GRID_NOTE_OF_C1;
  return index < PERIOD_COUNT && note >= 1 ? note : null;
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
  /** File offset of the argument byte of the Instrument command in force (it serves every note until the next one); -1 = the instrument is the song record's. */
  instrOffset: number;
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

/**
 * Index convention. The file-subsong registry (fileSubsongs.ts) counts tunes from 0; Medley's song table has an empty entry 0
 * and holds its tunes at 1..N, and UADE's Medley player (DTP_SubSongRange 1..N, N = the count word before the table) plays
 * the same numbers. Registry tune i is therefore table entry / UADE subsong i + MEDLEY_FIRST_TUNE.
 */
export const MEDLEY_FIRST_TUNE = 1;

/** Tunes in the file: the count word two bytes before the song table (what the UADE player reports), clamped to 1..64; 0 when it is no Medley module. */
export function medleySubsongCount(buf: Uint8Array): number {
  const tables = medleyTables(buf);
  if (!tables || tables.song < 2) return 0;
  const raw = (buf[tables.song - 2] << 8) | buf[tables.song - 1];
  return Math.min(Math.max(raw, 1), 64);
}

/** Does registry tune `subsong` (0-based) start a note? The replayer walk of buildMedleyGrid decides, never the header. */
export function medleySubsongAudible(buf: Uint8Array, subsong: number): boolean {
  const grid = buildMedleyGrid(buf, '', subsong + MEDLEY_FIRST_TUNE);
  return !!grid && grid.placements.length > 0;
}

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

  // The state a voice keeps from one pass of its track to the next: End on the voice's own track only sets the position
  // back to the track start (medley.c mdl_command_end); note offset, instrument and loop stack are not reset
  // (mdl_reset_voice clears them once, at the song start).
  interface VoiceState { noteOffset: number; inst: number; instAt: number; loops: Array<{ pos: number; count: number }> }
  const states: VoiceState[] = [];

  // One pass of a voice's own track from `tick`; returns the tick it ends on (null = RandomTrack met).
  const runPass = (voice: number, track: number, tick: number, line: TrackerCell[]): number | null => {
    const span = medleyTrackSpan(buf, tables, track);
    if (!span) return tick;
    const state = states[voice];
    let pos = span.start, steps = 0;
    const calls: number[] = [];
    const loops = state.loops;
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
        if (cmd === CMD_INSTRUMENT && medleyEntry(buf, tables.instrument, arg)) { state.inst = arg; state.instAt = pos + 1; }
        else if (cmd === CMD_TRANSPOSE) state.noteOffset = arg;
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
          const sounding = (op + songTranspose + state.noteOffset + instTranspose(state.inst)) & 0xff;
          const note = medleySoundingGridNote(buf, tables, state.inst, sounding);
          if (note !== null) {
            line[tick] = { ...(line[tick] ?? emptyCell()), note, instrument: state.inst };
            placements.push({ voice, tick, offset: pos, note, delta: note - op, instrument: state.inst, instrOffset: state.instAt });
          }
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
      states[v] = { noteOffset: 0, inst: buf[song + 0x1a + v] || startInst || 1, instAt: -1, loops: [] };
      const e = runPass(v, track, 0, line);
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
      const e = runPass(v, track, t, timelines[v]);
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
  const tables = medleyTables(source);
  const wantedInst = new Map<number, Set<number>>();
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
    if ((cell.instrument ?? 0) !== pl.instrument) {
      const inst = cell.instrument ?? 0;
      if (pl.instrOffset < 0) warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: the instrument comes from the song record, no Instrument command to write; not written`);
      else if (inst < 0 || inst > 255 || (!tables || !medleyEntry(source, tables.instrument, inst))) warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: instrument ${inst} does not exist; not written`);
      else {
        if (!wantedInst.has(pl.instrOffset)) wantedInst.set(pl.instrOffset, new Set());
        wantedInst.get(pl.instrOffset)!.add(inst);
      }
    }
  }
  let patched = 0;
  for (const [offset, set] of wantedInst) {
    if (set.size === 1) { out[offset] = [...set][0]; patched++; }
    else warnings.push(`stream byte ${offset}: cells served by this Instrument command were edited to different instruments; not written`);
  }
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
