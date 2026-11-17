/**
 * Anders0landParser.ts — Anders 0land Amiga music format (hot.*) native parser
 *
 * Anders 0land (Anders Öland) is a 4-channel Amiga tracker format. Files are
 * identified by a multi-chunk binary structure with chunk type tags.
 *
 * Detection (from UADE "Anders 0land_v1.asm", DTP_Check2 routine):
 *   The file is a chain of variable-length chunks. Each chunk starts with:
 *     - 3-byte ASCII tag
 *     - 1 byte (padding / reserved)
 *     - uint32 BE: chunk size (D1)
 *   Validation:
 *     D2 = fileSize - u32BE(buf, 4)   ; must not go negative (chunk fits in file)
 *     buf[0..1] == 'mp' (0x6D70)
 *     buf[2]    == 'l'  (0x6C)
 *     D1 (chunk size) must be even (btst #0,D1)
 *   Then advance to next chunk (A0 += D1):
 *     new D1 = u32BE(A0+4)
 *     D2 -= D1 ; must not go negative
 *     buf[0..1] == 'md' (0x6D64)
 *     buf[2]    == 't'  (0x74)
 *     D1 must be even
 *   Then advance again:
 *     new D1 = u32BE(A0+4)
 *     D2 -= D1 ; must not go negative
 *     buf[0..1] == 'ms' (0x6D73)
 *     buf[2]    == 'm'  (0x6D)
 *
 *   Full 3-byte tags: "mpl", "mdt", "msm"
 *   Each stored with the tag at bytes 0-2 and the chunk size at offset 4.
 *
 * Prefix: hot
 * UADE eagleplayer.conf: Anders0land  prefixes=hot
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   third-party/uade-3.05/amigasrc/players/wanted_team/Anders0land/SRC_Anders0land/Anders 0land_v1.asm
 * Reference parsers: BenDaglishParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeAnders0landCell, decodeAnders0landCell } from '@/engine/uade/encoders/Anders0landEncoder';
import { periodToNote } from '@/lib/amiga/periodNotes';

// ── Constants ───────────────────────────────────────────────────────────────

// Minimum size: 3 chunks × minimum 8 bytes header each
const MIN_FILE_SIZE = 24;

const NUM_CHANNELS = 4;
/** Grid rows per pattern; the song is cut into slices of this many steps. */
const SLICE = 64;
const MAX_STEPS = 8192;
const INSTRUMENT_SIZE = 8;
const TRACK_LOOP = 0xff;
const TRACK_STOP = 0xfe;
const PATTERN_END = 0xff;
// Period table the replayer indexes with note + transposition (andersoland.c k_periods; entries 69.. are code words).
const PERIODS = [
  3424, 3232, 3048, 2880, 2712, 2560, 2416, 2280, 2152, 2032, 1920, 1812, 1712, 1616, 1524, 1440, 1356, 1280,
  1208, 1140, 1076, 1016, 960, 906, 856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190, 180, 170, 160,
  151, 143, 135, 127, 120, 114, 107, 101, 95, 85, 80, 80, 80, 80, 80,
];

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  if (off + 1 >= buf.length) return 0;
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

/** Signed 16-bit big-endian read. */
function i16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v < 0x8000 ? v : v - 0x10000;
}

function u32BE(buf: Uint8Array, off: number): number {
  if (off + 3 >= buf.length) return 0;
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the DTP_Check2 detection algorithm
 * from Anders 0land_v1.asm.
 *
 * When `filename` is supplied the basename is checked for the expected UADE
 * prefix (`hot.`). The binary scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isAnders0landFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('hot.')) return false;
  }

  if (buf.length < MIN_FILE_SIZE) return false;

  let off = 0;
  let d2 = buf.length;

  // ── Chunk 1: "mpl" ────────────────────────────────────────────────────────
  if (off + 8 > buf.length) return false;
  const d1a = u32BE(buf, off + 4);
  d2 -= d1a;
  if (d2 < 0) return false;

  // Tag at bytes 0-2 of chunk: 'mp' then 'l'
  if (buf[off + 0] !== 0x6d || buf[off + 1] !== 0x70) return false; // 'mp'
  if (buf[off + 2] !== 0x6c) return false;                            // 'l'

  // Chunk size must be even
  if (d1a & 1) return false;

  off += d1a;

  // ── Chunk 2: "mdt" ────────────────────────────────────────────────────────
  if (off + 8 > buf.length) return false;
  const d1b = u32BE(buf, off + 4);
  d2 -= d1b;
  if (d2 < 0) return false;

  // Tag: 'md' then 't'
  if (buf[off + 0] !== 0x6d || buf[off + 1] !== 0x64) return false; // 'md'
  if (buf[off + 2] !== 0x74) return false;                            // 't'

  // Chunk size must be even
  if (d1b & 1) return false;

  off += d1b;

  // ── Chunk 3: "msm" ────────────────────────────────────────────────────────
  if (off + 8 > buf.length) return false;
  const d1c = u32BE(buf, off + 4);
  d2 -= d1c;
  if (d2 < 0) return false;

  // Tag: 'ms' then 'm'
  if (buf[off + 0] !== 0x6d || buf[off + 1] !== 0x73) return false; // 'ms'
  if (buf[off + 2] !== 0x6d) return false;                            // 'm'

  return true;
}


// ── The song as played ───────────────────────────────────────────────────────

/** One event of a voice as played: it starts at `step` and holds its row for `length` steps. */
export interface A0Event {
  step: number;
  length: number;
  /** File offset of the note byte, or -1 when the event has none. */
  noteAt: number;
  /** File offset of the instrument byte, or -1 when the event sets none. */
  instrumentAt: number;
  transpose: number;
}

export interface A0Grid {
  /** Played events of each voice in step order (one pass of its track list, up to its loop or stop). */
  voices: A0Event[][];
  steps: number;
  speed: number;
  instrumentCount: number;
}

const periodOf = (noteByte: number, transpose: number): number => PERIODS[((noteByte & 0x7f) + transpose) & 0xff] ?? 0;

/** The note byte (without the legato bit) whose period shows as this grid note under this transpose, or -1. */
export function a0IndexOfNote(note: number, transpose: number): number {
  for (let b = 0; b < 0x80; b++) { const p = periodOf(b, transpose); if (p > 0 && periodToNote(p) === note) return b; }
  return -1;
}

/**
 * Walk the first subsong the way andersoland.c does: per voice the track list from its start to its loop or stop entry,
 * each pattern's events with their durations, under the transposition the track list set last. One grid row is one
 * sequencer step (`speed` ticks). Returns null when the header does not read.
 */
export function readAnders0landGrid(buf: Uint8Array): A0Grid | null {
  const mdt = u32BE(buf, 4) + 8;
  if (mdt + 24 > buf.length) return null;
  const table = (i: number): number => mdt + i16BE(buf, mdt + 2 * i);
  const trackLists = table(0), params = table(2), patterns = table(5), instruments = table(6), envelopes = table(7);
  if (params + 4 > buf.length || patterns + 4 > buf.length || trackLists + 16 > buf.length) return null;
  const enabled = buf[params];
  const speed = Math.max(buf[params + 3], 1);
  const voices: A0Event[][] = [];
  let steps = 0;
  for (let v = 0; v < NUM_CHANNELS; v++) {
    const events: A0Event[] = [];
    voices.push(events);
    if (((enabled >> v) & 1) === 0) continue;
    const track = trackLists + u32BE(buf, trackLists + 4 * v);
    let pos = 0, transpose = 0, step = 0;
    // The track list is walked from its start to its first loop or stop entry: one pass.
    for (let guard = 0; track + pos < buf.length && guard < 1024 && step < MAX_STEPS; guard++) {
      let entry = buf[track + pos];
      if (entry === TRACK_LOOP || entry === TRACK_STOP) break;
      if (entry & 0x80) { transpose = entry & 0x7f; entry = buf[track + pos + 1]; pos++; }
      pos++;
      let at = patterns + u32BE(buf, patterns + 4 * entry);
      for (let n = 0; n < 256 && at < buf.length && buf[at] !== PATTERN_END && step < MAX_STEPS; n++) {
        const flags = buf[at];
        let len: number, noteAt = -1;
        if (flags & 0xc0) {
          const second = buf[at + 1];
          len = (second & 0x80) === 0 ? 3 : 2;
          if (len === 3) noteAt = at + 2;
        } else {
          len = (flags & 0x20) === 0 ? 2 : 1;
          if (len === 2) noteAt = at + 1;
        }
        const length = (flags & 0x1f) + 1;
        events.push({ step, length, noteAt, instrumentAt: (flags & 0x80) ? at + 1 : -1, transpose });
        step += length;
        at += len;
      }
    }
    steps = Math.max(steps, step);
  }
  const instrumentCount = Math.max((envelopes - instruments) / INSTRUMENT_SIZE | 0, 1);
  return { voices, steps, speed, instrumentCount };
}

// ── Parser ───────────────────────────────────────────────────────────────────

export async function parseAnders0landFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  // Structure only: the loader already routed by the hot. prefix, and a saved copy may be named *.hot.
  if (!isAnders0landFormat(buffer)) {
    throw new Error('Not an Anders 0land module');
  }
  const buf = new Uint8Array(buffer);
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^hot\.|\.hot$/gi, '') || baseName;

  const grid = readAnders0landGrid(buf);
  const played = grid !== null && grid.steps > 0;
  let usedInstruments = 0;
  if (played) for (const ev of grid.voices.flat()) if (ev.instrumentAt >= 0) usedInstruments = Math.max(usedInstruments, (buf[ev.instrumentAt] & 0x7f) + 1);
  const numInstruments = Math.max(played ? grid.instrumentCount : 1, usedInstruments);
  const instruments: InstrumentConfig[] = Array.from({ length: numInstruments }, (_, i) => ({
    id: i + 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  // Per voice: the event that starts at each step (the rows an event holds after its first stay empty).
  const byStep = Array.from({ length: NUM_CHANNELS }, (_, c) => {
    const m = new Map<number, A0Event>();
    if (played) for (const e of grid.voices[c]) m.set(e.step, e);
    return m;
  });
  const numPatterns = played ? Math.ceil(grid.steps / SLICE) : 1;
  const eventAt = (pattern: number, row: number, channel: number): A0Event | undefined => byStep[channel]?.get(pattern * SLICE + row);
  const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } as TrackerCell);
  const cellOf = (ev: A0Event): TrackerCell => ({
    ...emptyCell(),
    note: ev.noteAt >= 0 ? periodToNote(periodOf(buf[ev.noteAt], ev.transpose)) : 0,
    instrument: ev.instrumentAt >= 0 ? (buf[ev.instrumentAt] & 0x7f) + 1 : 0,
    // The raw note byte (with its legato bit) rides in the carrier so an unedited cell encodes byte-exact.
    period: ev.noteAt >= 0 ? buf[ev.noteAt] : 0,
  } as TrackerCell);

  const patterns = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: SLICE,
    channels: Array.from({ length: NUM_CHANNELS }, (__, c) => ({
      id: `channel-${c}`, name: `Voice ${c + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: c === 0 || c === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: SLICE }, (___, r) => { const ev = eventAt(p, r, c); return ev ? cellOf(ev) : emptyCell(); }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename, importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CHANNELS, originalPatternCount: numPatterns, originalInstrumentCount: numInstruments,
    },
  }));

  const layout: UADEPatternLayout = {
    formatId: 'anders0land',
    patternDataFileOffset: 0,
    bytesPerCell: 1,
    rowsPerPattern: SLICE,
    numChannels: NUM_CHANNELS,
    numPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: encodeAnders0landCell,
    decodeCell: decodeAnders0landCell,
    // Only an event with a note byte holds a note: a held row or a note-less event has no byte, so a note typed there is reported unplaced.
    getCellFileOffset: (pattern, row, channel) => eventAt(pattern, row, channel)?.noteAt ?? -1,
    // A pattern replayed by the track list is one stored cell: an edit carries to every copy, each under its own transpose.
    propagateSharedCells: true,
    noteOffset: (pattern, row, channel) => eventAt(pattern, row, channel)?.transpose ?? 0,
    // The note byte (its legato bit kept) and the instrument byte (its top bit kept); every other byte stays as it is.
    effectPatches: (pattern, row, channel, cell) => {
      const ev = eventAt(pattern, row, channel);
      if (!ev) return { patches: [], noteUnchanged: false };
      const patches: Array<[number, number]> = [];
      const inst = cell.instrument ?? 0;
      if (ev.instrumentAt >= 0 && inst >= 1 && inst <= 0x80 && inst !== (buf[ev.instrumentAt] & 0x7f) + 1) {
        patches.push([ev.instrumentAt, (buf[ev.instrumentAt] & 0x80) | (inst - 1)]);
      }
      const shown = ev.noteAt >= 0 ? periodToNote(periodOf(buf[ev.noteAt], ev.transpose)) : 0;
      if ((cell.note ?? 0) === shown) return { patches, noteUnchanged: true };
      const idx = ev.noteAt >= 0 ? a0IndexOfNote(cell.note ?? 0, ev.transpose) : -1;
      if (idx < 0) return { patches, noteUnchanged: false };
      patches.push([ev.noteAt, (buf[ev.noteAt] & 0x80) | idx]);
      return { patches, noteUnchanged: true };
    },
  };

  return {
    name: `${moduleName} [Anders 0land]`,
    format: 'MOD' as TrackerFormat,
    patterns, instruments,
    songPositions: patterns.map((_, i) => i), songLength: patterns.length, restartPosition: 0,
    numChannels: NUM_CHANNELS, initialSpeed: played ? grid.speed : 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: layout,
  };
}
