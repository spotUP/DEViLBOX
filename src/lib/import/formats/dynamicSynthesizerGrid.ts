/**
 * Dynamic Synthesizer (.ptc / dns.*) - the time-aligned, read-only grid (phase A) and its byte-exact stream carriers.
 *
 * Decoder truth: third-party/nuade/players/dynamicsynthesizer/dns_module.c (the code scan that finds the tables) and
 * dns_replayer.c (run_track, load_position, run_sequencer). The module is a 68k game sound routine followed by its
 * tables; the replayer's addresses are found by matching instruction words, exactly as dns_module_locate does. The
 * link base is the period table's link address minus its file offset.
 *
 * Song (subsong 0): position, loop position, end position, speed (ticks per step) are words of the song table. At a
 * position each of the six tracks takes a pattern number (1-based, 0 = none) plus a note add and a sample add from its
 * three byte tables, and the pattern is played one word per step: 0 = nothing, 0x8000 = note off, otherwise the high
 * byte + note add + 1 indexes the 64 period table and the low nibble + sample add is the sample. A note holds until
 * the next word. A position lasts step_limit / 2 steps; the tick length is 50 Hz (100 Hz for the fixed patterns
 * replayer) and one grid row is one step, so initialSpeed is the song speed. The song is decoded up to its loop (the
 * first pass).
 *
 * Replayer builds: only the two table-driven sequencers (fixed patterns: 0x60 byte patterns; pattern pointer table)
 * are decoded. The rows sequencer (24 byte rows, patterns end with 0xffff) is reported as a gridUnmatchedReason.
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): the pattern words are the truth; `blockRows` holds one carrier
 * cell per stream byte (cutoff 2, period = the byte) for every distinct pattern, so the encoder rebuilds them; the
 * grid shows the decoded notes.
 */
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import { periodToNote } from '@/lib/amiga/periodNotes';

const TRACKS = 6;
const NOT_FOUND = -1;
const ANY = -2;
const MAX_POSITIONS = 4096;
const MAX_ROWS = 32768;
const PATTERN_SIZE = 0x60;
const PERIOD_COUNT = 64;
const SONG_FIELD_SIZE = 0x20;
const NOTE_OFF_WORD = 0x8000;
const NOTE_OFF = 97;

const OP = {
  BRA_W: 0x6000, RTS: 0x4e75, MOVE_L_A0_ABS: 0x23c8, CLR_W_ABS: 0x4279,
  ANDI_W_7E: 0x007e, LEA_A0: 0x41f9, LEA_A1: 0x43f9, LEA_A2: 0x45f9, LEA_A3: 0x47f9, LEA_A4: 0x49f9, LEA_A5: 0x4bf9,
  MULU_W_D0: 0xc0fc, SUBI_W_60_D2: 0x0442, ADDI_L_D2: 0x0682,
} as const;
const PERIOD_MARKER_0 = 0x06ae;
const PERIOD_MARKER_1 = 0x064e;

const u8 = (b: Uint8Array, o: number): number => (o >= 0 && o < b.length ? b[o] : 0);
const u16 = (b: Uint8Array, o: number): number => (u8(b, o) << 8) | u8(b, o + 1);
const u32 = (b: Uint8Array, o: number): number => (u16(b, o) * 65536 + u16(b, o + 2)) >>> 0;
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

function findWords(b: Uint8Array, from: number, to: number, pattern: readonly number[]): number {
  const end = Math.min(to, b.length);
  for (let at = from & ~1; at + pattern.length * 2 <= end; at += 2) {
    let i = 0;
    while (i < pattern.length && (pattern[i] === ANY || pattern[i] === u16(b, at + i * 2))) i++;
    if (i === pattern.length) return at;
  }
  return NOT_FOUND;
}

export type DnsSequencer = 'fixedPatterns' | 'patternTable' | 'rows';

interface DnsTables {
  sequencer: DnsSequencer;
  linkBase: number;
  periods: number;
  songs: number;
  songOffsetMask: number;
  patternTable: number;
  firstPattern: number;
  patternCount: number;
  tracks: Array<{ patterns: number; noteAdds: number; sampleAdds: number }>;
}

/** dns_module_locate, up to the tables the grid needs; a string is the reason the module is not decoded. */
function locate(b: Uint8Array): DnsTables | string {
  if (b.length < 0x40) return 'the module is too small';
  // check_entry_points: five bra.w with even positive displacements, the last leads to `move.l a0,abs; rts`
  for (let i = 0; i < 5; i++) {
    const d = (u16(b, i * 4 + 2) << 16) >> 16;
    if (u16(b, i * 4) !== OP.BRA_W || d < 0 || (d & 1) !== 0) return 'the five entry branches are missing';
  }
  const last = 5 * 4 - 2;
  const target = last + ((u16(b, last) << 16) >> 16);
  if (u16(b, target) !== OP.MOVE_L_A0_ABS || u16(b, target + 6) !== OP.RTS) return 'the entry points do not set the sample base';
  // find_addresses
  const lea = findWords(b, 0, b.length, [OP.ANDI_W_7E, OP.LEA_A1]);
  const periods = lea !== NOT_FOUND ? findWords(b, lea + 4, b.length, [PERIOD_MARKER_0, PERIOD_MARKER_1]) : NOT_FOUND;
  if (lea === NOT_FOUND || periods === NOT_FOUND) return 'the period table was not found';
  const address = u32(b, lea + 4);
  if (address < periods) return 'the period table address is below its offset';
  const linkBase = address - periods;
  const operand = (at: number): number => { const a = u32(b, at); return a >= linkBase ? a - linkBase : NOT_FOUND; };
  const start = 6 + ((u16(b, 6) << 16) >> 16);
  if (u16(b, start) !== OP.CLR_W_ABS || u16(b, start + 6) !== OP.CLR_W_ABS) return 'the hardware init routine was not found';
  const firstVariable = operand(start + 2);
  const codeEnd = operand(start + 8);
  if (firstVariable === NOT_FOUND || codeEnd === NOT_FOUND || codeEnd > b.length) return 'the code end was not found';
  let at = 0;
  for (;; at += 2) {
    if (at + 6 > codeEnd) return 'the song table was not found';
    const shift = u16(b, at);
    if ((shift === 0xe340 || shift === 0xe380) && u16(b, at + 2) === OP.LEA_A0) break;
  }
  const songs = operand(at + 4);
  if (songs === NOT_FOUND || u16(b, at + 8) !== 0x0280) return 'the song table was not found';
  const songOffsetMask = u32(b, at + 10) & 0xffff;
  // find_sequencer
  let patternTable = NOT_FOUND;
  let firstPattern = NOT_FOUND;
  let patternCount = 0;
  if (firstVariable >= 6 && u16(b, firstVariable - 6) === OP.RTS) {
    patternTable = operand(firstVariable - 4);
    if (patternTable !== NOT_FOUND) {
      firstPattern = operand(patternTable);
      if (firstPattern === NOT_FOUND || firstPattern <= patternTable) patternTable = NOT_FOUND;
      else patternCount = (firstPattern - patternTable) >> 2;
    }
    if (patternCount > 256) patternTable = NOT_FOUND;
  }
  const tables: DnsTables = { sequencer: 'patternTable', linkBase, periods, songs, songOffsetMask, patternTable, firstPattern, patternCount, tracks: [] };
  if (patternTable === NOT_FOUND) {
    tables.sequencer = 'fixedPatterns';
    const fixed = findWords(b, 0, codeEnd, [OP.SUBI_W_60_D2, PATTERN_SIZE, OP.ADDI_L_D2]);
    if (fixed === NOT_FOUND) return 'neither a pattern table nor fixed patterns were found';
    tables.firstPattern = operand(fixed + 6);
    if (tables.firstPattern === NOT_FOUND) return 'the first pattern is below the link base';
  } else if (findWords(b, 0, codeEnd, [OP.MULU_W_D0, 24]) !== NOT_FOUND) {
    tables.sequencer = 'rows';
    return 'the rows sequencer (24 byte rows) is not decoded';
  }
  const seq = [OP.LEA_A0, ANY, ANY, OP.LEA_A1, ANY, ANY, OP.LEA_A2, ANY, ANY, OP.LEA_A3, ANY, ANY, OP.LEA_A4, ANY, ANY, OP.LEA_A5];
  let p = 0;
  for (let t = 0; t < TRACKS; t++) {
    p = findWords(b, p, codeEnd, seq);
    if (p === NOT_FOUND) return 'the track tables were not found';
    const tr = { patterns: operand(p + 2), noteAdds: operand(p + 14), sampleAdds: operand(p + 26) };
    if (tr.patterns === NOT_FOUND || tr.noteAdds === NOT_FOUND || tr.sampleAdds === NOT_FOUND) return 'a track table is below the link base';
    tables.tracks.push(tr);
    p += seq.length * 2;
  }
  return tables;
}

export interface DnsStream { offset: number; size: number }

export interface DnsGrid {
  patterns: Pattern[];
  songPositions: number[];
  rows: number;
  streams: DnsStream[];
  blockRows: TrackerCell[][];
  /** trackMap[pattern][channel] = stream index, -1 where the track has no pattern */
  streamAtStart: number[][];
  speed: number;
  bpm: number;
  sequencer: DnsSequencer;
}

export function buildDnsGrid(buf: Uint8Array): DnsGrid | string {
  const t = locate(buf);
  if (typeof t === 'string') return t;
  const fixed = t.sequencer === 'fixedPatterns';
  // dns_read_song, subsong 0
  const entry = t.songs;
  const first = u16(buf, entry);
  const loop = u16(buf, entry + SONG_FIELD_SIZE);
  const endPosition = u16(buf, entry + 2 * SONG_FIELD_SIZE);
  const speed = u16(buf, entry + 3 * SONG_FIELD_SIZE);
  const muteMask = u16(buf, entry + 4 * SONG_FIELD_SIZE);
  const stepLimit = fixed ? u16(buf, entry + 7 * SONG_FIELD_SIZE) : u16(buf, entry + 6 * SONG_FIELD_SIZE) * 2;
  void loop;
  const stepsPerPosition = ((stepLimit << 16) >> 16) + 1 >> 1;
  if (speed === 0 || stepsPerPosition <= 0 || stepLimit > 0x7fff) return 'the song has no steps or no speed';
  const patternOffset = (n: number): number => {
    if (n === 0) return 0;
    if (fixed) return t.firstPattern + (n - 1) * PATTERN_SIZE;
    if (n > t.patternCount) return 0;
    const a = u32(buf, t.patternTable + (n - 1) * 4);
    return a >= t.linkBase ? a - t.linkBase : 0;
  };

  const noteAdd = new Array<number>(TRACKS).fill(0);
  const sampleAdd = new Array<number>(TRACKS).fill(0);
  const streamIndex = new Map<number, number>();
  const streams: DnsStream[] = [];
  const positions: Array<{ cells: TrackerCell[][]; streams: number[] }> = [];
  let rows = 0;
  for (let position = first, n = 0; n < MAX_POSITIONS && rows < MAX_ROWS; n++) {
    const cells: TrackerCell[][] = [];
    const used: number[] = [];
    for (let tr = 0; tr < TRACKS; tr++) {
      const index = (position << 16) >> 16;
      const tab = t.tracks[tr];
      const num = u8(buf, tab.patterns + index);
      const pat = patternOffset(num);
      if (num !== 0) { noteAdd[tr] = u8(buf, tab.noteAdds + index); sampleAdd[tr] = u8(buf, tab.sampleAdds + index); }
      const col = Array.from({ length: stepsPerPosition }, emptyCell);
      let stream = -1;
      if (pat > 0 && pat + stepsPerPosition * 2 <= buf.length) {
        stream = streamIndex.get(pat) ?? -1;
        if (stream < 0) { stream = streams.length; streams.push({ offset: pat, size: stepsPerPosition * 2 }); streamIndex.set(pat, stream); }
        for (let s = 0; s < stepsPerPosition; s++) {
          const word = u16(buf, pat + s * 2);
          if (word === 0) continue;
          if (word === NOTE_OFF_WORD) { col[s].note = NOTE_OFF; continue; }
          const note = ((word >> 8) + noteAdd[tr] + 1) & 0xff;
          col[s].note = periodToNote(u16(buf, t.periods + 2 * (note % PERIOD_COUNT)));
          col[s].instrument = ((word & 0xf) + sampleAdd[tr]) & 0xff;
        }
      }
      cells.push(col);
      used.push(stream);
    }
    positions.push({ cells, streams: used });
    rows += stepsPerPosition;
    position = (position + 1) & 0xffff;
    const atEnd = fixed ? endPosition === position : ((endPosition << 16) >> 16) < ((position << 16) >> 16);
    if (atEnd) break;
  }
  if (positions.length === 0 || streams.length === 0) return 'the song has no patterns';

  const blockRows = streams.map((s) => {
    const out: TrackerCell[] = [];
    for (let o = s.offset; o < s.offset + s.size; o++) out.push({ ...emptyCell(), cutoff: 2, period: u8(buf, o) });
    return out;
  });
  const patterns: Pattern[] = positions.map((pos, p) => {
    const channels: ChannelData[] = pos.cells.map((rowsOf, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: ((muteMask >> ch) & 1) !== 0, solo: false, collapsed: false,
      volume: 100, pan: (ch & 1) === 0 ? -50 : 50, instrumentId: null, color: null,
      rows: rowsOf,
    }));
    return { id: `pattern-${p}`, name: `Position ${first + p}`, length: stepsPerPosition, channels };
  });
  // tick length: 50 Hz (100 Hz for the fixed patterns replayer); at BPM 125 a tracker tick is 20 ms
  const bpm = fixed ? 250 : 125;
  return {
    patterns, songPositions: patterns.map((_, i) => i), rows, streams, blockRows,
    streamAtStart: positions.map((p) => p.streams), speed, bpm, sequencer: t.sequencer,
  };
}
