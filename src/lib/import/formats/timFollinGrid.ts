/**
 * timFollinGrid.ts - the Tim Follin (Follin Player II) tracker grid, decoded from the module's voice streams.
 *
 * A module is a 68k program image whose data starts with a song table (third-party/nuade/players/timfollin/
 * tfol_layout.h): per song four voice stream addresses, an instrument table and a voice count. Each voice runs a
 * byte stream of notes (a note byte 1..0x7F, then a length byte unless a NoteLength command set one) and commands
 * (a byte with bit 7 set, or 0; command = byte & 0x7F, then its argument bytes; Call and Jump hold an address
 * long aligned to an even file offset). The wire grammar and the voice state below are tfol_module.c
 * (tfol_module_locate, tfol_module_read_event) and tfol.c (tfol_start, tfol_fetch, tfol_run_command, tfol_play_note,
 * tfol_note_counter): this file is the single place that reads it.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): the stream bytes (truth), `blockRows` (one carrier cell per
 * byte of every event the voices run: cutoff = 1, period = the byte), and the display grid on the replayer's tick
 * timeline (one row = one 50 Hz tick: a note on the tick it starts, its hold as empty rows). The source span of
 * every note is recorded per row. This file only reads; timFollinEdits.ts writes note edits back (phase B).
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { makeRowClock, mainStepFromOnsets, makeOnsetPlacer, setNoteColumn, type RowClock } from './stepRowClock';
import { BD_FX } from './benDaglishEffectGlyphs';

const ROWS_PER_PATTERN = 64;
const MAX_ROWS = 32768;
const VOICES = 4;
const MIN_VOICES = 3;
const SONGS = 16;
const SILENT_SONG = 14;
const FETCH_LIMIT = 65536;
const STACK_PER_VOICE = 4;
const NOTE_COUNTER_ZERO = 256;

const OP_JMP = 0x4ef9;
const TOS_HEADER = 0x601a;
const TOS_HEADER_SIZE = 0x1c;
const DATA_MARKS = [0x1010, 0x1012];
const JUMP_SLOT_SIZE = 6;
const JUMP_SLOTS = 15;
const JUMP_TABLE_CHECKED = 6;
const JUMP_TABLE_DATA = 0x432;
const SONG0_STREAM_HEAD = 0x81043202;
const SONG0_STREAM_TAIL = 0x8f00;
const SONG_VOICES_OFFSET = 4;
const SONG_RECORD_SIZE = 16;
const VOICE_COUNTS_OFFSET = 0x144;
const TABLE_SIZE = 0x154;
const RELOCATED_LONGS = 81;

/** tfol.c tfol_periods: the note period table, indexed by note & 0x7F (the bytes after entry 94 are the eagleplayer's data). */
const PERIODS: readonly number[] = [
  0x0eee, 0x0e18, 0x0d4d, 0x0c8e, 0x0bda, 0x0b2f, 0x0a8f, 0x09f7, 0x0968, 0x08e1, 0x0861, 0x07e9, 0x0777,
  0x070c, 0x06a7, 0x0647, 0x05ed, 0x0598, 0x0547, 0x04fc, 0x04b4, 0x0470, 0x0431, 0x03f4, 0x03bc, 0x0386,
  0x0353, 0x0324, 0x02f6, 0x02cc, 0x02a4, 0x027e, 0x025a, 0x0238, 0x0218, 0x01fa, 0x01de, 0x01c3, 0x01aa,
  0x0192, 0x017b, 0x0166, 0x0152, 0x013f, 0x012d, 0x011c, 0x010c, 0x00fd, 0x00ef, 0x00e1, 0x00d5, 0x00c9,
  0x00be, 0x00b3, 0x00a9, 0x009f, 0x0096, 0x008e, 0x0086, 0x007f, 0x0077, 0x0071, 0x006a, 0x0064, 0x005f,
  0x0059, 0x0054, 0x0050, 0x004b, 0x0047, 0x0043, 0x003f, 0x003c, 0x0038, 0x0035, 0x0032, 0x002f, 0x002d,
  0x002a, 0x0028, 0x0026, 0x0024, 0x0022, 0x0020, 0x001e, 0x001c, 0x001b, 0x0019, 0x0018, 0x0016, 0x0015,
  0x0014, 0x0013, 0x0012, 0x0011, 0x0010, 0x0008, 0x0a14, 0x1e28, 0x323c, 0x4650, 0x0a14, 0x1e28, 0x323c,
  0x4650, 0x204d, 0x494b, 0x452f, 0x5469, 0x6d20, 0x466f, 0x6c6c, 0x696e, 0x2c20, 0x696d, 0x7072, 0x6f76,
  0x6564, 0x2062, 0x7920, 0x414e, 0x4459, 0x2053, 0x494c, 0x5641, 0x2000, 0x0000, 0x0000,
];

/** tfol_internal.h TfolCommand, in command-number order. */
const Cmd = {
  Nop: 0, Instrument: 1, Call: 2, Return: 3, LoopStart: 4, LoopEnd: 5, Envelope: 6, Portamento: 7, Vibrato: 8,
  PitchModulation: 9, Transpose: 10, NoteLength: 11, EnvelopeRestart: 12, WaveFlags: 13, SweepRate: 14, Stop: 15,
  EnvelopeStep: 16, SkipTranspose: 17, Jump: 18, Count: 19,
} as const;

/** tfol_module.c tfol_argument_counts. */
const ARG_COUNTS: Record<number, number> = {
  [Cmd.Instrument]: 1, [Cmd.LoopStart]: 1, [Cmd.Envelope]: 3, [Cmd.Portamento]: 1, [Cmd.Vibrato]: 3,
  [Cmd.PitchModulation]: 4, [Cmd.Transpose]: 1, [Cmd.NoteLength]: 1, [Cmd.EnvelopeRestart]: 1, [Cmd.WaveFlags]: 1,
  [Cmd.SweepRate]: 1, [Cmd.EnvelopeStep]: 1,
};

const u16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : 0);
const u32 = (b: Uint8Array, o: number): number => (o >= 0 && o + 4 <= b.length ? ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0 : 0);

/** The module located by tfol_module_locate: the song table and the offset that turns an address into a file offset. */
export interface TfolModuleInfo { table: number; delta: number; subsongCount: number }

/** tfol_module_locate without the open-time proof: true layout checks only (null: not a Follin module). */
export function locateTimFollin(b: Uint8Array): TfolModuleInfo | null {
  let table = 0;
  let delta = 0;
  if (u16(b, 0) === OP_JMP) {
    for (let i = 0; i < JUMP_TABLE_CHECKED; i++) if (u16(b, i * JUMP_SLOT_SIZE) !== OP_JMP) return null;
    table = JUMP_TABLE_DATA;
    delta = (0 - u32(b, 2)) >>> 0;
  } else {
    const at = u16(b, 0) === TOS_HEADER ? TOS_HEADER_SIZE : 0;
    if (!DATA_MARKS.includes(u16(b, at))) return null;
    table = at + 2;
    if (table + SONG_VOICES_OFFSET + VOICES * 4 > b.length) return null;
    const first = u32(b, table + 4);
    for (let v = 1; v < VOICES; v++) if (u32(b, table + 4 + v * 4) !== first) return null;
    let found = -1;
    for (let o = table; o + 6 <= b.length; o += 2) {
      if (u32(b, o) === SONG0_STREAM_HEAD && u16(b, o + 4) === SONG0_STREAM_TAIL) { found = o; break; }
    }
    if (found < 0) return null;
    delta = (found - first) >>> 0;
  }
  if (table + TABLE_SIZE > b.length) return null;
  for (let i = 0; i < RELOCATED_LONGS; i++) if (b[table + i * 4] !== 0) return null;
  if (b[table + RELOCATED_LONGS * 4] === 0) return null;
  let slots = 0;
  for (let s = 0; s < JUMP_SLOTS; s++) if (u16(b, s * JUMP_SLOT_SIZE) === OP_JMP) slots++;
  return { table, delta, subsongCount: slots !== 0 ? slots : 1 };
}

const toOffset = (m: TfolModuleInfo, address: number): number => (address + m.delta) >>> 0;

/** tfol_module_song: the voice streams (file offsets) and the voice count of a song number (0..15). */
export function timFollinSong(b: Uint8Array, m: TfolModuleInfo, song: number): { streams: number[]; voices: number } {
  const record = m.table + SONG_VOICES_OFFSET + song * SONG_RECORD_SIZE;
  const streams = Array.from({ length: VOICES }, (_, v) => toOffset(m, u32(b, record + v * 4)));
  const voices = b[m.table + VOICE_COUNTS_OFFSET + song] === VOICES ? VOICES : MIN_VOICES;
  return { streams, voices };
}

/** One event of a stream: a note with its length byte (unless the voice has a note length), or a command. */
export interface TfolEvent {
  valid: boolean; isNote: boolean; note: number; command: number; args: number[]; target: number; start: number; next: number;
}

/** tfol_module_read_event. */
export function readTimFollinEvent(b: Uint8Array, m: TfolModuleInfo, from: number, noteHasLength: boolean): TfolEvent {
  const ev: TfolEvent = { valid: false, isNote: false, note: 0, command: 0, args: [], target: 0, start: from, next: from };
  if (from >= b.length) return ev;
  let at = from;
  const byte = b[at++];
  let argCount = 0;
  if (byte !== 0 && (byte & 0x80) === 0) {
    ev.isNote = true;
    ev.note = byte;
    argCount = noteHasLength ? 0 : 1;
  } else {
    ev.command = byte & 0x7f;
    if (ev.command >= Cmd.Count) return ev;
    argCount = ARG_COUNTS[ev.command] ?? 0;
  }
  if (!ev.isNote && (ev.command === Cmd.Call || ev.command === Cmd.Jump)) {
    at += at & 1;
    if (at + 4 > b.length) return ev;
    ev.target = toOffset(m, u32(b, at));
    at += 4;
    if (ev.target >= b.length) return ev;
  }
  if (at + argCount > b.length) return ev;
  ev.args = Array.from(b.subarray(at, at + argCount));
  ev.next = at + argCount;
  ev.valid = true;
  return ev;
}

/** The note a Follin note byte shows: the tracker note of the period its table entry plays. */
export function timFollinShownNote(noteByte: number): number {
  return periodToNote(PERIODS[noteByte & 0x7f]);
}

/** A maximal run of consecutive stream bytes the voices execute. */
export interface TfolRegion { offset: number; size: number }

/** The event a row's note was read from. */
export type TfolRowSource = { region: number; offset: number; length: number; noteByte: number; base: number } | null;

export interface TfolGrid {
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  /** Executed stream bytes, merged into runs by file offset. */
  regions: TfolRegion[];
  /** One carrier cell per byte of each region (cutoff = 1, period = the byte), parallel to `regions`. */
  blockRows: TrackerCell[][];
  /** Per pattern, voice and row: the note starting there (the first note column). */
  rowSources: TfolRowSource[][][];
  /** Per note column from the second (index 0 = note column 2), pattern, voice and row: the further notes starting in one row. */
  rowSourcesExtra: TfolRowSource[][][][];
  /** Processed ticks per row: the song step, measured from the note onsets. */
  step: number;
  clock: RowClock;
  /** Notes that start inside their row (a row offset in the first effect column, or the delay of note column 2). */
  delayedNotes: number;
  /** Onsets deeper than the cell's 4 note columns (plan rule R5 grows the columns, the cell model stops at 4). */
  unplacedNotes: number;
  /** Per voice: 1 plus the largest number of extra notes starting in one row. */
  noteCols: number[];
  /** For each pattern and voice, the region playing on the pattern's first row (-1: none). */
  regionAtStart: number[][];
  /** Notes per voice inside the timeline. */
  noteCounts: number[];
}

interface PlacedNote { tick: number; offset: number; length: number; noteByte: number; base: number; shown: number; instrument: number }

interface VoiceRun { notes: PlacedNote[]; pass: number; spans: Array<[number, number]> }

/** Run one voice as tfol.c does (tfol_start, tfol_fetch), recording each note's tick and every executed byte span. */
function runVoice(b: Uint8Array, m: TfolModuleInfo, stream: number, active: boolean, silent: boolean): VoiceRun {
  const run: VoiceRun = { notes: [], pass: 0, spans: [] };
  if (!active || silent) return run;
  const stack: number[] = [];
  let pc = stream;
  let noteLength = 0, transpose = 0, skipTranspose = false, portamentoRate = 0, curNote = 0;
  let loopCount = 0, loopStart = 0, instrument = -1;
  let tick = 0;
  const seen = new Set<string>();
  let pass = -1;
  for (;;) {
    // A fetch runs events until a note starts (tfol_fetch); the voice's whole state at that point repeats exactly when it loops.
    let started = false;
    let stopped = false;
    for (let steps = 0; steps < FETCH_LIMIT && !started && !stopped; steps++) {
      const ev = readTimFollinEvent(b, m, pc, noteLength !== 0);
      if (!ev.valid) { stopped = true; break; }
      run.spans.push([ev.start, ev.next]);
      pc = ev.next;
      if (ev.isNote) {
        const base = skipTranspose ? 0 : transpose;
        skipTranspose = false;
        let note = (base + ev.note) & 0xff;
        if (portamentoRate !== 0) note = curNote;
        curNote = note;
        const length = noteLength !== 0 ? noteLength : ev.args[0] ?? 0;
        run.notes.push({
          tick, offset: ev.start, length: ev.next - ev.start, noteByte: ev.note, base,
          shown: timFollinShownNote(note), instrument: instrument + 1,
        });
        tick += length === 0 ? NOTE_COUNTER_ZERO : length;
        started = true;
        break;
      }
      const a = ev.args;
      switch (ev.command) {
        case Cmd.Instrument: instrument = a[0]; break;
        case Cmd.Call:
          if (stack.length >= STACK_PER_VOICE) { stopped = true; break; }
          stack.push(pc); pc = ev.target; break;
        case Cmd.Return:
          if (stack.length === 0) { stopped = true; break; }
          pc = stack.pop() as number; break;
        case Cmd.LoopStart: loopCount = a[0]; loopStart = pc; break;
        case Cmd.LoopEnd: loopCount = (loopCount - 1) & 0xff; if (loopCount !== 0) pc = loopStart; break;
        case Cmd.Portamento: portamentoRate = a[0]; break;
        case Cmd.Transpose: transpose = a[0]; break;
        case Cmd.NoteLength: noteLength = a[0]; break;
        case Cmd.Stop: stopped = true; break;
        case Cmd.SkipTranspose: skipTranspose = true; break;
        case Cmd.Jump: pc = ev.target; break;
        default: break; // envelope, vibrato, pitch modulation, wave flags, sweep: sound shaping, not shown in the grid
      }
    }
    if (stopped || !started) { if (pass < 0) pass = tick; break; }
    const key = [pc, stack.join(','), loopCount, loopStart, noteLength, transpose, skipTranspose ? 1 : 0, portamentoRate, curNote, instrument].join('|');
    if (seen.has(key) && pass < 0) pass = tick;
    seen.add(key);
    if (tick >= MAX_ROWS) break;
  }
  run.pass = pass < 0 ? tick : pass;
  return run;
}

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

/** Each voice's note onset ticks inside the timeline, as the walk runs them (the reference the grid is checked against). */
export function timFollinOnsetTicks(b: Uint8Array, subsong = 0): number[][] | null {
  const m = locateTimFollin(b);
  if (!m || subsong < 0 || subsong >= m.subsongCount) return null;
  const songNumber = (subsong + 1) & (SONGS - 1);
  const song = timFollinSong(b, m, songNumber);
  const runs = song.streams.map((s, v) => runVoice(b, m, s, v < song.voices, songNumber === SILENT_SONG));
  const ticks = Math.min(MAX_ROWS, Math.max(1, ...runs.map((r) => r.pass)));
  return runs.map((r) => r.notes.filter((n) => n.tick < ticks).map((n) => n.tick));
}

/** Decode a subsong (0-based, as the replayer: song number (subsong + 1) & 15) into the display grid and its carriers. */
export function buildTimFollinGrid(b: Uint8Array, subsong = 0): TfolGrid | null {
  const m = locateTimFollin(b);
  if (!m || subsong < 0 || subsong >= m.subsongCount) return null;
  const songNumber = (subsong + 1) & (SONGS - 1);
  const song = timFollinSong(b, m, songNumber);
  const runs = song.streams.map((s, v) => runVoice(b, m, s, v < song.voices, songNumber === SILENT_SONG));
  if (runs.every((r) => r.notes.length === 0)) return null;
  const ticks = Math.min(MAX_ROWS, Math.max(1, ...runs.map((r) => r.pass)));
  // one row is one song step: the main step of the voices' note onsets, in the replayer's ticks
  const step = mainStepFromOnsets(runs.map((r) => r.notes.filter((n) => n.tick < ticks).map((n) => n.tick)));
  const clock = makeRowClock([{ tick: 0, speed: step }]);
  const rows = Math.max(1, clock.rowsForTicks(ticks));

  // regions: the executed event spans, merged where they touch or overlap
  const spans = runs.flatMap((r) => r.spans).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const regions: TfolRegion[] = [];
  for (const [s, e] of spans) {
    const last = regions[regions.length - 1];
    if (last && s <= last.offset + last.size) last.size = Math.max(last.size, e - last.offset);
    else regions.push({ offset: s, size: e - s });
  }
  const regionOf = (offset: number): number => regions.findIndex((r) => offset >= r.offset && offset < r.offset + r.size);
  const blockRows = regions.map((r) =>
    Array.from({ length: r.size }, (_, i) => ({ ...emptyCell(), cutoff: 1, period: b[r.offset + i] })));

  const grid: TrackerCell[][] = Array.from({ length: VOICES }, () => Array.from({ length: rows }, emptyCell));
  const sources: TfolRowSource[][] = Array.from({ length: VOICES }, () => new Array<TfolRowSource>(rows).fill(null));
  const sourcesExtra: TfolRowSource[][][] = [];
  const extraSources = (col: number): TfolRowSource[][] =>
    (sourcesExtra[col - 1] ??= Array.from({ length: VOICES }, () => new Array<TfolRowSource>(rows).fill(null)));
  const regionAtTick: number[][] = Array.from({ length: VOICES }, () => new Array<number>(rows).fill(-1));
  const noteCounts: number[] = [];
  const noteCols = new Array<number>(VOICES).fill(1);
  const place = makeOnsetPlacer(clock);
  let delayedNotes = 0;
  const unplacedNotes = 0; // the cell holds any number of note columns: no onset is left out (plan R5)
  runs.forEach((run, v) => {
    let count = 0;
    run.notes.forEach((n, i) => {
      if (n.tick >= ticks) return;
      const pl = place(v, n.tick);
      count++;
      const cell = grid[v][pl.row];
      const region = regionOf(n.offset);
      const src = { region, offset: n.offset, length: n.length, noteByte: n.noteByte, base: n.base };
      if (pl.col === 0) {
        cell.note = n.shown;
        cell.instrument = n.instrument;
        if (pl.offset > 0) { cell.effTyp = BD_FX.rowOffset; cell.eff = pl.offset; delayedNotes++; }
        sources[v][pl.row] = src;
      } else {
        setNoteColumn(cell, pl.col, n.shown, n.instrument, pl.offset);
        if (pl.offset > 0) delayedNotes++;
        extraSources(pl.col)[v][pl.row] = src;
      }
      const end = Math.min(rows, i + 1 < run.notes.length ? clock.tickToRow(run.notes[i + 1].tick).row : rows);
      for (let t = pl.row; t < end; t++) regionAtTick[v][t] = region;
    });
    noteCols[v] = place.columnsOf(v);
    noteCounts.push(count);
  });

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const rowSources: TfolRowSource[][][] = [];
  const rowSourcesExtra: TfolRowSource[][][][] = sourcesExtra.map(() => []);
  const regionAtStart: number[][] = [];
  for (let start = 0, p = 0; start < rows; start += ROWS_PER_PATTERN, p++) {
    const len = Math.min(ROWS_PER_PATTERN, rows - start);
    const chData: ChannelData[] = grid.map((cells, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: (ch === 0 || ch === 3) ? -50 : 50, instrumentId: null, color: null,
      rows: cells.slice(start, start + len),
      channelMeta: { importedFromMOD: false, effectCols: 2, noteCols: noteCols[ch], noteColDelay: true },
    }));
    patterns.push({ id: `pattern-${p}`, name: `Pattern ${p}`, length: len, channels: chData });
    songPositions.push(p);
    rowSources.push(sources.map((s) => s.slice(start, start + len)));
    sourcesExtra.forEach((src, i) => rowSourcesExtra[i].push(src.map((s) => s.slice(start, start + len))));
    regionAtStart.push(regionAtTick.map((s) => s[start]));
  }
  return { patterns, songPositions, rows, regions, blockRows, rowSources, rowSourcesExtra, step, clock, delayedNotes, unplacedNotes, noteCols, regionAtStart, noteCounts };
}
