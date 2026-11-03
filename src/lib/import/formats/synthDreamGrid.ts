/**
 * synthDreamGrid.ts - the SynthDream tracker grid, decoded from the module's command streams.
 *
 * A SynthDream song is, per subsong and voice, a track of 12-byte entries (commands offset, transpose, repeat,
 * instrument substitute, volume cut) ended by 0xFE (play again from the first entry) or 0xFF. Each entry points at
 * a stream of big-endian 16-bit words: one command word, the parameters its form names, then modifier words,
 * until a word whose first byte is 0xFF. The wire grammar below is third-party/nuade/players/synthdream/synthdream.c
 * (run_commands, run_note_command, run_modifier, read_glide): it is the single place this file reads it.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): the stream bytes (truth), `blockRows` (one carrier cell per
 * word: cutoff = 2, period = the word), and the display grid on a shared tick timeline (row === replayer tick).
 * Each command's source span (stream, byte offset, byte length) is recorded per row in `rowSources`.
 * This file only reads; synthDreamEdits.ts writes grid edits back into those bytes (phase B).
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';

const ROWS_PER_PATTERN = 64;
const MAX_ROWS = 32768;
const VOICES = 4;
const SUBSONG_TABLE = 0x0c;
const SUBSONG_ENTRY_SIZE = 16;
const ENTRY_BYTES = 12;
const FIRST_MODIFIER = 0x24;
const OPCODE_LIMIT = 0x30;
const TRACK_LOOP = 0xfe;
const NOTE_C1 = 60;
/** Tracker note of the table index shown as C-1 (the app numbers C-0 as 1). */
const TRACKER_C1 = 13;
const NOTE_OFF = 97;
const MAX_PASS_COMMANDS = 65536;

interface Form { duration?: boolean; note?: boolean; noteCut?: boolean; glide?: boolean; instrument?: boolean; rest?: boolean }

/** synthdream.c command_forms, indexed by command word / 2. */
const FORMS: Form[] = [
  {}, { duration: true }, { note: true }, { noteCut: true }, { instrument: true },
  { duration: true, note: true }, { duration: true, noteCut: true }, { duration: true, instrument: true },
  { note: true, noteCut: true }, { note: true, instrument: true },
  { duration: true, note: true, noteCut: true }, { duration: true, note: true, instrument: true },
  { duration: true, note: true, glide: true }, { note: true, noteCut: true, instrument: true },
  { duration: true, note: true, noteCut: true, instrument: true }, { duration: true, rest: true },
  { duration: true, note: true, glide: true, instrument: true }, { duration: true, note: true, glide: true, instrument: true },
];

/** Parameter words after a modifier word (run_modifier). */
function modifierParams(word: number): number {
  return word === 0x24 || word === 0x2a || word === 0x2c || word === 0x2e ? 2 : 0;
}

const isCommandWord = (w: number): boolean => w % 2 === 0 && w < OPCODE_LIMIT;
const isModifierWord = (w: number): boolean => w >= FIRST_MODIFIER && w - FIRST_MODIFIER < 0x8000;

const u16 = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u32 = (b: Uint8Array, o: number): number => (u16(b, o) * 65536 + u16(b, o + 2)) >>> 0;

/** One command of a stream: the word span it reads and the values the replayer takes from it. */
export interface SdrCommand {
  /** Byte offset of the command's first word, and its length in bytes (command word, parameters, modifiers). */
  offset: number;
  length: number;
  /** The first word (0xFFxx for the stream end). */
  word: number;
  end: boolean;
  duration?: number;
  note?: number;
  instrument?: number;
  /** Byte offsets of the note and instrument words inside the command (where an edit is written). */
  noteAt?: number;
  instrumentAt?: number;
  rest: boolean;
}

export interface SdrStream {
  /** Byte offset of the stream in the module. */
  offset: number;
  /** Bytes from `offset` to the end of the last decoded word (the stream-end word included). */
  size: number;
  commands: SdrCommand[];
  /** True when the stream ends in a word the replayer cannot run instead of the 0xFF word. */
  broken: boolean;
}

/** Decode one command stream from its offset, exactly as run_commands reads it. */
export function decodeSdrStream(buf: Uint8Array, offset: number): SdrStream {
  const commands: SdrCommand[] = [];
  let pos = offset;
  let broken = false;
  while (pos + 1 < buf.length && commands.length < MAX_PASS_COMMANDS) {
    const start = pos;
    const first = u16(buf, pos);
    if (buf[pos] === 0xff) {
      commands.push({ offset: start, length: 2, word: first, end: true, rest: false });
      pos += 2;
      break;
    }
    if (!isCommandWord(first)) { broken = true; break; }
    pos += 2;
    const cmd: SdrCommand = { offset: start, length: 0, word: first, end: false, rest: false };
    const next = (): number => { const w = u16(buf, pos); pos += 2; return w; };
    if (first < FIRST_MODIFIER) {
      const f = FORMS[first / 2];
      cmd.rest = !!f.rest;
      if (f.duration) cmd.duration = next();
      if (f.note) { cmd.noteAt = pos; cmd.note = next(); }
      if (f.glide) { next(); next(); next(); }
      if (f.noteCut) next();
      if (f.instrument) { cmd.instrumentAt = pos; cmd.instrument = next(); }
    } else {
      pos += 2; // a modifier first in an entry has its word read as the command word and skips one more
      pos += 2 * modifierParams(first);
    }
    for (let w = u16(buf, pos); isModifierWord(w); w = u16(buf, pos)) {
      if (!isCommandWord(w)) { broken = true; break; }
      pos += 2 + 2 * modifierParams(w);
    }
    if (broken) break;
    cmd.length = pos - start;
    commands.push(cmd);
  }
  return { offset, size: pos - offset, commands, broken };
}

/** One 12-byte track entry (sdr_read_track_entry). */
export interface SdrTrackEntry { commands: number; transpose: number; repeat: number; substituteOf: number; substituteBy: number; volumeCut: number }

export function sdrSubsongCount(buf: Uint8Array): number {
  const volumeSwitches = u32(buf, 4);
  if (volumeSwitches < 0x1c || volumeSwitches > buf.length) return 0;
  return Math.floor((volumeSwitches - SUBSONG_TABLE) / SUBSONG_ENTRY_SIZE);
}

/** The track entries of one voice, up to the 0xFE / 0xFF that ends the list; `loops` says which. */
export function readSdrTrack(buf: Uint8Array, subsong: number, voice: number): { entries: SdrTrackEntry[]; loops: boolean } {
  let at = u32(buf, SUBSONG_TABLE + SUBSONG_ENTRY_SIZE * subsong + 4 * voice);
  const entries: SdrTrackEntry[] = [];
  while (at + ENTRY_BYTES <= buf.length && buf[at] < TRACK_LOOP && entries.length < MAX_PASS_COMMANDS) {
    entries.push({
      commands: u32(buf, at), transpose: buf[at + 4], repeat: buf[at + 5],
      substituteOf: buf[at + 6], substituteBy: buf[at + 7], volumeCut: buf[at + 9],
    });
    at += ENTRY_BYTES;
  }
  return { entries, loops: buf[at] === TRACK_LOOP };
}

/** The tracker note a note word shows under the entry's transposition (96 at most, C-1 = 13 at least). */
export function sdrShownNote(note: number, transpose: number, fixedPitch: boolean): number {
  const base = fixedPitch ? note : (note & 0xff00) | ((note + transpose) & 0xff);
  return Math.min(96, Math.max(0, (base & 0xff) - NOTE_C1) + TRACKER_C1);
}

/** The instrument number a command's instrument word selects under the entry's substitution (sdr_read_track_entry). */
export function sdrSubstitutedInstrument(word: number, substituteOf: number, substituteBy: number): number {
  return (word & 0xff) === substituteOf ? substituteBy : word & 0xff;
}

/** The first byte of the instrument record's fixed-pitch flag (sdr_read_instrument): transposition is not applied to such notes. */
function isFixedPitch(buf: Uint8Array, number: number): boolean {
  const table = u32(buf, 0);
  const at = (table + (((number << 5) << 16) >> 16)) >>> 0;
  return (buf[at + 1] ?? 0) !== 0;
}

/**
 * The command starting on a row, the stream bytes it was read from, and the state its cell was shown under: the
 * bytes of the note and instrument words that set the note and instrument in force (they can sit in an earlier
 * command or stream), the entry's transposition and instrument substitution, and whether the instrument is fixed-pitch.
 */
export type SdrRowSource = {
  stream: number; offset: number; length: number;
  noteAt: number; instrumentAt: number;
  transpose: number; fixedPitch: boolean; substituteOf: number; substituteBy: number;
} | null;

export interface SdrGrid {
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  /** Distinct streams the voices play, by order of first use. */
  streams: SdrStream[];
  /** One carrier cell per word of each stream (cutoff = 2, period = the word), parallel to `streams`. */
  blockRows: TrackerCell[][];
  /** Per pattern, voice and row: the command starting there and the stream bytes it was read from. */
  rowSources: SdrRowSource[][][];
  /** For each pattern and voice, the stream playing on the pattern's first row (-1: none). */
  streamAtStart: number[][];
}

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

interface Placed {
  tick: number; stream: number; cmd: SdrCommand; note: number; instrument: number;
  noteAt: number; instrumentAt: number; transpose: number; fixedPitch: boolean; substituteOf: number; substituteBy: number;
}

/** Decode the module's subsong into per-voice command lists on the tick timeline. */
export function buildSdrGrid(buf: Uint8Array, subsong = 0): SdrGrid | null {
  if (subsong < 0 || subsong >= sdrSubsongCount(buf)) return null;
  const streams: SdrStream[] = [];
  const streamAt = new Map<number, number>();
  const streamOf = (offset: number): number => {
    let i = streamAt.get(offset);
    if (i === undefined) { i = streams.length; streams.push(decodeSdrStream(buf, offset)); streamAt.set(offset, i); }
    return i;
  };

  // One voice's commands, in play order, each with the tick it starts on; `limit` rows at most.
  const voices: Placed[][] = [];
  const firstPass: number[] = [];
  for (let v = 0; v < VOICES; v++) {
    const track = readSdrTrack(buf, subsong, v);
    const placed: Placed[] = [];
    let tick = 0;
    let duration = 0;
    let note = 0;
    let instrumentNumber = -1;
    let fixedPitch = false;
    let noteAt = -1;
    let instrumentAt = -1;
    let passTicks = -1;
    // the voice's state persists across the loop, as the replayer's does
    for (let pass = 0; pass < (track.loops ? MAX_ROWS : 1) && tick < MAX_ROWS && track.entries.length > 0; pass++) {
      const before = tick;
      for (const entry of track.entries) {
        for (let rep = 0; rep <= entry.repeat && tick < MAX_ROWS; rep++) {
          const si = streamOf(entry.commands);
          for (const cmd of streams[si].commands) {
            if (cmd.end || tick >= MAX_ROWS) break;
            if (cmd.word < FIRST_MODIFIER) {
              if (cmd.duration !== undefined) duration = cmd.duration;
              if (cmd.note !== undefined) { note = cmd.note; noteAt = cmd.noteAt ?? -1; }
              if (cmd.instrument !== undefined) {
                let n = cmd.instrument;
                if ((n & 0xff) === entry.substituteOf) n = (n & 0xff00) | entry.substituteBy;
                instrumentNumber = n & 0xff;
                instrumentAt = cmd.instrumentAt ?? -1;
                fixedPitch = isFixedPitch(buf, n);
              }
            }
            let shown = 0;
            if (!cmd.rest && cmd.word < FIRST_MODIFIER) {
              shown = sdrShownNote(note, entry.transpose, fixedPitch);
            }
            placed.push({
              tick, stream: si, cmd, note: cmd.rest ? NOTE_OFF : shown, instrument: instrumentNumber + 1,
              noteAt, instrumentAt, transpose: entry.transpose, fixedPitch, substituteOf: entry.substituteOf, substituteBy: entry.substituteBy,
            });
            tick += duration === 0 ? 0x10000 : duration;
          }
        }
      }
      if (passTicks < 0) passTicks = tick - before;
      if (tick === before) break; // a pass with no time cannot fill the timeline
    }
    voices.push(placed);
    firstPass.push(Math.max(0, passTicks));
  }

  const rows = Math.min(MAX_ROWS, Math.max(1, ...firstPass));
  if (voices.every((p) => p.length === 0)) return null;

  const grid: TrackerCell[][] = Array.from({ length: VOICES }, () => Array.from({ length: rows }, emptyCell));
  const sources: SdrRowSource[][] = Array.from({ length: VOICES }, () => new Array<SdrRowSource>(rows).fill(null));
  const streamAtTick: number[][] = Array.from({ length: VOICES }, () => new Array<number>(rows).fill(-1));
  voices.forEach((placed, v) => {
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      if (p.tick >= rows) break;
      const cell = grid[v][p.tick];
      cell.note = p.note;
      if (p.note > 0 && p.note < NOTE_OFF) cell.instrument = p.instrument;
      sources[v][p.tick] = {
        stream: p.stream, offset: p.cmd.offset, length: p.cmd.length, noteAt: p.noteAt, instrumentAt: p.instrumentAt,
        transpose: p.transpose, fixedPitch: p.fixedPitch, substituteOf: p.substituteOf, substituteBy: p.substituteBy,
      };
      const endTick = Math.min(rows, i + 1 < placed.length ? placed[i + 1].tick : rows);
      for (let t = p.tick; t < endTick; t++) streamAtTick[v][t] = p.stream;
    }
  });

  const blockRows = streams.map((s) => {
    const out: TrackerCell[] = [];
    for (let o = s.offset; o + 1 < s.offset + s.size + 1 && o < s.offset + s.size; o += 2) {
      out.push({ ...emptyCell(), cutoff: 2, period: u16(buf, o) });
    }
    return out;
  });

  const patterns: Pattern[] = [];
  const songPositions: number[] = [];
  const rowSources: SdrRowSource[][][] = [];
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
    streamAtStart.push(streamAtTick.map((s) => s[start]));
  }
  return { patterns, songPositions, rows, streams, blockRows, rowSources, streamAtStart };
}
