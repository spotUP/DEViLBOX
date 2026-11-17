/**
 * CoreDesignParser.ts — Core Design Amiga music format native parser
 *
 * Core Design is a proprietary 4-channel Amiga music format used in games
 * developed by Core Design (e.g. Chuck Rock, Jaguar XJ220, Heimdall). The
 * module is a compiled 68k executable combining player code and music data
 * into a single self-contained file.
 *
 * Detection (from UADE Core Design.asm Check3 routine, big-endian reads):
 *   u32BE(buf, 0)  === 0x000003F3   (68k HUNK_HEADER magic)
 *   buf[20] !== 0                   (non-zero byte at offset 20)
 *   u32BE(buf, 32) === 0x70FF4E75   (68k MOVEQ #-1,D0 + RTS opcodes)
 *   u32BE(buf, 36) === 0x532E5048   (ASCII 'S.PH')
 *   u32BE(buf, 40) === 0x49505053   (ASCII 'IPPS')
 *   u32BE(buf, 44) !== 0            (Interrupt pointer)
 *   u32BE(buf, 48) !== 0            (Audio Interrupt pointer)
 *   u32BE(buf, 52) !== 0            (InitSong pointer)
 *   u32BE(buf, 56) !== 0            (EndSong pointer)
 *   u32BE(buf, 60) !== 0            (Subsongs pointer)
 *
 * Sample extraction (from Core Design.asm SampleInit + InitPlayer):
 *   The code body in the HUNK starts at file offset 32 (standard single-hunk).
 *   At code[32] (file offset 64): SampleInfoPtr (section-relative before relocation)
 *   At code[36] (file offset 68): EndSampleInfoPtr
 *   Count = (EndSampleInfoPtr - SampleInfoPtr) / 14
 *   Each 14-byte entry: u32 at +6 = section-relative address of sample data area.
 *   At sample data area: u16 length in words, then PCM data follows.
 *   Sample length in bytes = u16 * 2.
 *
 * File prefix: "CORE." (e.g. "CORE.songname")
 * Single-file format: music data binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/CoreDesign/...
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeCoreDesignCell, decodeCoreDesignCell } from '@/engine/uade/encoders/CoreDesignEncoder';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { createSamplerInstrument } from './AmigaUtils';

const MIN_FILE_SIZE = 64;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isCoreDesignFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // 68k HUNK_HEADER magic
  if (u32BE(buf, 0) !== 0x000003F3) return false;

  // Byte at offset 20 must be non-zero
  if (buf[20] === 0) return false;

  // 68k MOVEQ #-1,D0 + RTS opcode pair
  if (u32BE(buf, 32) !== 0x70FF4E75) return false;

  // ASCII 'S.PH'
  if (u32BE(buf, 36) !== 0x532E5048) return false;

  // ASCII 'IPPS'
  if (u32BE(buf, 40) !== 0x49505053) return false;

  // Interrupt pointer
  if (u32BE(buf, 44) === 0) return false;

  // Audio Interrupt pointer
  if (u32BE(buf, 48) === 0) return false;

  // InitSong pointer
  if (u32BE(buf, 52) === 0) return false;

  // EndSong pointer
  if (u32BE(buf, 56) === 0) return false;

  // Subsongs pointer
  if (u32BE(buf, 60) === 0) return false;

  return true;
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

/**
 * Read a null-terminated ASCII string from buf starting at off, up to maxLen bytes.
 */
function readCString(buf: Uint8Array, off: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen && off + i < buf.length; i++) {
    const ch = buf[off + i];
    if (ch === 0) break;
    if (ch >= 0x20 && ch < 0x7f) s += String.fromCharCode(ch);
  }
  return s;
}

/**
 * Parse the Amiga HUNK header to find where the code body starts in the file.
 *
 * Standard single-hunk layout:
 *   offset  0: 0x000003F3 (HUNK_HEADER)
 *   offset  4: 0x00000000 (no string table)
 *   offset  8: num_hunks
 *   offset 12: first_hunk
 *   offset 16: last_hunk
 *   offset 20: hunk_sizes[0..n-1]  (n = last - first + 1)
 *   offset 20+n*4: 0x000003E9 (HUNK_CODE)
 *   offset 24+n*4: code_longwords
 *   offset 28+n*4: code body starts
 *
 * Returns the file offset of the first byte of code, or -1 on failure.
 */
function findHunkCodeBodyStart(buf: Uint8Array): number {
  if (buf.length < 32) return -1;
  if (u32BE(buf, 0) !== 0x000003F3) return -1;

  // Skip string table (offset 4: number of resident library name entries, usually 0)
  const stringTableCount = u32BE(buf, 4);
  let off = 8;
  for (let i = 0; i < stringTableCount; i++) {
    if (off + 4 > buf.length) return -1;
    const strLongs = u32BE(buf, off);
    off += 4 + strLongs * 4;
  }

  if (off + 12 > buf.length) return -1;
  const numHunks = u32BE(buf, off);
  off += 12; // skip numHunks, firstHunk, lastHunk

  // Skip hunk size entries
  off += numHunks * 4;

  // Expect HUNK_CODE (0x3E9), mask off memory type flags in high bits
  if (off + 8 > buf.length) return -1;
  const hunkType = u32BE(buf, off) & 0x3FFFFFFF;
  if (hunkType !== 0x3E9) return -1;
  off += 8; // skip HUNK_CODE + code_longwords

  return off;
}

/**
 * Extract sample PCM data from a Core Design module using HUNK structure.
 *
 * From the ASM (InitPlayer + SampleInit):
 *   - After codeBase + 12 (skip 0x70FF4E75 + 'S.PHIPPS'): 7 longword reads
 *   - code[32] = SampleInfoPtr, code[36] = EndSampleInfoPtr (section-relative)
 *   - Count = (EndSampleInfoPtr - SampleInfoPtr) / 14
 *   - Each 14-byte entry: u32 at +6 = section-relative address of sample data
 *   - At sample data: u16 length in words, then PCM follows
 */
function extractCoreDesignSamples(buf: Uint8Array, codeStart: number): InstrumentConfig[] {
  const instruments: InstrumentConfig[] = [];
  const ENTRY_SIZE = 14;

  // SampleInfoPtr at code[32], EndSampleInfoPtr at code[36]
  const sampleInfoPtrOff = codeStart + 32;
  const endSampleInfoPtrOff = codeStart + 36;

  if (endSampleInfoPtrOff + 4 > buf.length) return instruments;

  const sampleInfoRelative = u32BE(buf, sampleInfoPtrOff);
  const endSampleInfoRelative = u32BE(buf, endSampleInfoPtrOff);

  if (sampleInfoRelative === 0 || endSampleInfoRelative === 0) return instruments;
  if (endSampleInfoRelative <= sampleInfoRelative) return instruments;

  const sampleInfoFileOff = sampleInfoRelative + codeStart;
  const endSampleInfoFileOff = endSampleInfoRelative + codeStart;

  if (sampleInfoFileOff >= buf.length || endSampleInfoFileOff > buf.length) return instruments;

  const tableBytes = endSampleInfoFileOff - sampleInfoFileOff;
  if (tableBytes % ENTRY_SIZE !== 0) return instruments;
  const count = tableBytes / ENTRY_SIZE;
  if (count === 0 || count > 128) return instruments;

  for (let i = 0; i < count; i++) {
    const entryOff = sampleInfoFileOff + i * ENTRY_SIZE;
    if (entryOff + ENTRY_SIZE > buf.length) break;

    // u32 at entry+6 = section-relative address of sample data area
    const sampleAreaRelative = u32BE(buf, entryOff + 6);
    if (sampleAreaRelative === 0) {
      instruments.push({
        id: i + 1, name: '', type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
      continue;
    }

    const sampleAreaFileOff = sampleAreaRelative + codeStart;
    if (sampleAreaFileOff + 2 > buf.length) {
      instruments.push({
        id: i + 1, name: '', type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
      continue;
    }

    // First u16 at sample area = length in words
    const lengthWords = u16BE(buf, sampleAreaFileOff);
    const lengthBytes = lengthWords * 2;
    const pcmStart = sampleAreaFileOff + 2;

    if (lengthBytes > 0 && lengthBytes < 0x100000 && pcmStart + lengthBytes <= buf.length) {
      const pcm = buf.slice(pcmStart, pcmStart + lengthBytes);
      instruments.push(createSamplerInstrument(
        i + 1, '', pcm, 64, 8287, 0, 0,
      ));
    } else {
      instruments.push({
        id: i + 1, name: '', type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  return instruments;
}


// ── Pattern streams (third-party/nuade/players/coredesign: cd_module.c locate, cd_driver.c pattern_step) ──
//
// The driver finds its tables by scanning its own code; so does this. A pattern is a byte stream: commands from 0x80 on
// (0x80-0x88 instrument slot, 0x89-0xBF vibrato, 0xC2 none, any other 0xC0-0xFE skips three bytes, 0xFF ends the pattern),
// then an event: 0x7F rest + ticks, 0x7E period (lo, hi) + length, or a note byte + length. An event lasts `length` ticks
// (0 = 256). The grid is the song as played (cd_driver.c track_advance): the first non-effect subsong's three order lists
// (voices 1-3; voice 0 only plays sound effects) expanded in play order with each entry's repeat count and transpose, one grid
// channel per track, one row per tick. Shortcuts: the instrument-slot table (order entries 0xC0-0xFD) is not applied (the grid
// shows the slot number as the instrument), period events (0x7E) are not editable, and only one subsong is shown.

const INSTRUMENT_SLOTS = 9;
const MAX_TICKS = 8192;

export interface CoreDesignEvent {
  tick: number;
  /** File offset of the event byte. */
  at: number;
  kind: 'note' | 'rest' | 'period';
  /** File offset of the instrument-slot command in front of the event, or -1. */
  instrumentAt: number;
}
export interface CoreDesignStream { events: CoreDesignEvent[]; ticks: number }
/** One event as played: a stream event at a tick of the song, under the order list's transpose of that moment. */
export interface CoreDesignPlayed extends CoreDesignEvent { transpose: number }
export interface CoreDesignGrid {
  streams: CoreDesignStream[];
  /** The played events of each track (voices 1-3) in tick order; empty when the order lists cannot be read. */
  tracks: CoreDesignPlayed[][];
  songTicks: number;
  patternBase: number;
  periodOf: (noteByte: number, transpose?: number) => number;
  /** The note byte whose period shows as this grid note under this transpose, or -1 (the table is not in ProTracker tuning, so match by shown note). */
  indexOfNote: (note: number, transpose?: number) => number;
}

function findWords(m: Uint8Array, from: number, to: number, pat: string): number {
  const w = pat.split(' ').map((x) => (x === 'xxxx' ? -1 : parseInt(x, 16)));
  for (let a = from & ~1; a + 2 * w.length <= m.length && a < to; a += 2) {
    let i = 0;
    while (i < w.length && (w[i] < 0 || u16BE(m, a + 2 * i) === w[i])) i++;
    if (i === w.length) return a;
  }
  return -1;
}

function s16BE(m: Uint8Array, o: number): number { return (u16BE(m, o) << 16) >> 16; }

export function readCoreDesignGrid(buf: Uint8Array, base: number): CoreDesignGrid | null {
  const m = buf.subarray(base);
  if (m.length < 64 || u32BE(m, 0) !== 0x70ff4e75 || u32BE(m, 4) !== 0x532e5048) return null;
  const stop = u32BE(m, 24);
  const end = Math.min(m.length, stop + 0x1000);
  const pat = findWords(m, stop, end, '41fa xxxx 4880 d040 3030 0000 41fa xxxx d0c0');
  const per = findWords(m, stop, end, '43fa xxxx 3e31 0000');
  const note = findWords(m, stop, end, 'd02c 0013 0600 xxxx 1940 0017');
  if (pat < 0 || per < 0 || note < 0) return null;
  const offsets = pat + 2 + s16BE(m, pat + 2);
  const patBase = pat + 14 + s16BE(m, pat + 14);
  const periods = per + 2 + s16BE(m, per + 2);
  const noteOffset = m[note + 7];
  if (offsets >= m.length || patBase >= offsets) return null;

  const periodAt = (i: number) => (periods + 2 * i + 2 <= m.length ? u16BE(m, periods + 2 * i) : 0);
  const streams: CoreDesignStream[] = [];
  // The offset table has no stored length; its entries are valid while they point into the pattern area before it.
  for (let i = 0; i < 256 && offsets + 2 * i + 2 <= m.length; i++) {
    const off = s16BE(m, offsets + 2 * i);
    if (off < 0 || patBase + off >= offsets) break;
    const events: CoreDesignEvent[] = [];
    let pos = patBase + off, tick = 0, instrumentAt = -1, ended = false;
    while (pos < m.length && tick <= MAX_TICKS) {
      const b = m[pos];
      if (b >= 0x80) {
        if (b === 0xff) { ended = true; break; }
        if (b <= 0x88) instrumentAt = base + pos;
        pos += b >= 0xc0 && b !== 0xc2 ? 4 : 1;
        continue;
      }
      const kind = b === 0x7f ? 'rest' : b === 0x7e ? 'period' : 'note';
      const length = m[pos + (kind === 'period' ? 3 : 1)] || 256;
      events.push({ tick, at: base + pos, kind, instrumentAt });
      instrumentAt = -1;
      tick += length;
      pos += kind === 'period' ? 4 : 2;
    }
    if (!ended || tick > MAX_TICKS) break;
    streams.push({ events, ticks: tick });
  }
  if (streams.length === 0) return null;
  const { tracks, songTicks } = readPlayedTracks(m, streams);
  // cd_read_period: the note index is a signed byte (event + transpose + note_offset).
  const periodOf = (noteByte: number, transpose = 0) => periodAt(((noteByte + transpose + noteOffset) << 24) >> 24);
  return {
    streams, tracks, songTicks,
    patternBase: base + patBase,
    periodOf,
    indexOfNote: (n, transpose = 0) => {
      for (let b = 0; b < 0x7e; b++) { const p = periodOf(b, transpose); if (p > 0 && periodToNote(p) === n) return b; }
      return -1;
    },
  };
}

const TRACKS = 3;

/** The first subsong that is not a sound effect: its song number (cd_module.c locate, cd_read_subsong), or -1. */
function readPlayedTracks(m: Uint8Array, streams: CoreDesignStream[]) {
  const none = { tracks: [] as CoreDesignPlayed[][], songTicks: 0 };
  const start = u32BE(m, 20), count = u32BE(m, 28);
  const sub = findWords(m, start, start + 0x180, '41f9 xxxx xxxx d1c2');
  const call = findWords(m, start, start + 0x180, '3028 0002 6100 xxxx');
  if (sub < 0 || call < 0) return none;
  const subsongs = u32BE(m, sub + 2);
  const startSong = call + 6 + s16BE(m, call + 6);
  const songAt = findWords(m, startSong, startSong + 0x180, '41fa xxxx 49f0 0000');
  if (songAt < 0) return none;
  const songs = songAt + 2 + s16BE(m, songAt + 2);
  let song = -1;
  for (let i = 0; i < Math.min(count, 256) && subsongs + 8 * i + 8 <= m.length; i++) {
    if (u16BE(m, subsongs + 8 * i) !== 1) { song = u16BE(m, subsongs + 8 * i + 2); break; }
  }
  if (song < 0 || songs + song * 6 + 6 > m.length) return none;
  const tracks: CoreDesignPlayed[][] = [];
  let songTicks = 0;
  for (let t = 0; t < TRACKS; t++) {
    const played: CoreDesignPlayed[] = [];
    let pos = songs + s16BE(m, songs + song * 6 + 2 * t), repeats = 1, transpose = 0, tick = 0;
    // track_advance: entries below 0x80 are pattern numbers, 0x80-0xBF set the repeat count of the next pattern,
    // 0xC0-0xFD set an instrument slot (one byte follows), 0xFE the transpose (one byte follows), 0xFF ends.
    for (let step = 0; step < 4096 && pos < m.length && tick < MAX_TICKS; step++) {
      const e = m[pos++];
      if (e >= 0xff) break;
      if (e === 0xfe) { transpose = (m[pos++] << 24) >> 24; continue; }
      if (e >= 0xc0) { pos++; continue; }
      if (e >= 0x80) { repeats = (e & 0x1f) || 1; continue; }
      const stream = streams[e];
      if (stream && stream.ticks > 0) {
        for (let r = 0; r < repeats && tick < MAX_TICKS; r++) {
          for (const ev of stream.events) played.push({ ...ev, tick: tick + ev.tick, transpose });
          tick += stream.ticks;
        }
      }
      repeats = 1;
    }
    tracks.push(played);
    songTicks = Math.max(songTicks, tick);
  }
  return { tracks, songTicks };
}
export function parseCoreDesignFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isCoreDesignFormat(buf)) throw new Error('Not a Core Design module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^core\./i, '') || baseName;

  // ── Extract samples from HUNK code body ────────────────────────────────

  const instruments: InstrumentConfig[] = [];
  let songName = '';
  let authorName = '';

  const codeStart = findHunkCodeBodyStart(buf);

  if (codeStart > 0) {
    // Structural extraction using HUNK pointers
    const extracted = extractCoreDesignSamples(buf, codeStart);
    instruments.push(...extracted);

    // Extract song/author names from header pointers
    // After the 7 longword reads (code[12..39]), InitPlayer reads:
    //   code[40] = SongName, code[44] = AuthorName (section-relative pointers)
    const songNamePtrOff = codeStart + 40;
    const authorNamePtrOff = codeStart + 44;
    if (songNamePtrOff + 4 <= buf.length) {
      const songNameRelative = u32BE(buf, songNamePtrOff);
      if (songNameRelative > 0) {
        const nameFileOff = songNameRelative + codeStart;
        if (nameFileOff < buf.length) {
          songName = readCString(buf, nameFileOff, 64);
        }
      }
    }
    if (authorNamePtrOff + 4 <= buf.length) {
      const authorNameRelative = u32BE(buf, authorNamePtrOff);
      if (authorNameRelative > 0) {
        const nameFileOff = authorNameRelative + codeStart;
        if (nameFileOff < buf.length) {
          authorName = readCString(buf, nameFileOff, 64);
        }
      }
    }
  }

  // Fallback: single placeholder instrument
  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: '', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  // ── The song as played: 3 channels (voices 1-3), one row per tick, 64-tick grid patterns; no readable order list: the streams, one per pattern ──

  const grid = codeStart > 0 ? readCoreDesignGrid(buf, codeStart) : null;
  const played = grid && grid.songTicks > 0;
  const SLICE = 64;
  const channelCount = played ? TRACKS : 1;
  const numPatterns = played ? Math.ceil(grid.songTicks / SLICE) : Math.max(grid?.streams.length ?? 0, 1);
  // Per channel: the event that starts at each tick (period events have no cell).
  const byTick = Array.from({ length: channelCount }, (_, c) => {
    const m = new Map<number, CoreDesignPlayed>();
    if (played) for (const e of grid.tracks[c]) if (e.kind !== 'period' && !m.has(e.tick)) m.set(e.tick, e);
    return m;
  });
  // Fallback (order lists unreadable): every stream as its own grid pattern, untransposed.
  const eventAt = (pattern: number, row: number, channel: number): CoreDesignPlayed | undefined => {
    if (played) return byTick[channel]?.get(pattern * SLICE + row);
    const e = grid?.streams[pattern]?.events.find((x) => x.tick === row && x.kind !== 'period');
    return e && { ...e, transpose: 0 };
  };
  const rowsIn = (p: number) => played ? SLICE : Math.max(grid?.streams[p]?.ticks ?? 1, 1);
  const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } as TrackerCell);
  const cellOf = (ev: CoreDesignPlayed): TrackerCell => {
    const period = ev.kind === 'note' && grid ? grid.periodOf(buf[ev.at], ev.transpose) : 0;
    return {
      ...emptyCell(),
      note: periodToNote(period),
      instrument: ev.instrumentAt >= 0 ? buf[ev.instrumentAt] - 0x80 + 1 : 0,
      period: buf[ev.at],
    } as TrackerCell;
  };

  const patterns = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: rowsIn(p),
    channels: Array.from({ length: channelCount }, (__, c) => ({
      id: `channel-${c}`, name: played ? `Voice ${c + 2}` : 'Pattern', muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rowsIn(p) }, (___, r) => { const ev = eventAt(p, r, c); return ev ? cellOf(ev) : emptyCell(); }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: channelCount, originalPatternCount: numPatterns,
      originalInstrumentCount: instruments.length,
    },
  }));

  const layout: UADEPatternLayout = {
    formatId: 'coreDesign',
    patternDataFileOffset: grid?.patternBase ?? 0,
    bytesPerCell: 1,
    rowsPerPattern: played ? SLICE : Math.max(1, ...(grid?.streams ?? []).map((s) => s.ticks)),
    numChannels: channelCount,
    numPatterns,
    moduleSize: buffer.byteLength,
    encodeCell: encodeCoreDesignCell,
    decodeCell: decodeCoreDesignCell,
    // Only a note event holds a note: a rest has no byte to type into, so a note typed there is reported unplaced.
    getCellFileOffset: (pattern, row, channel) => { const ev = eventAt(pattern, row, channel); return ev?.kind === 'note' ? ev.at : -1; },
    // A pattern replayed by the order list is one stored cell: an edit carries to every copy, each under its own transpose.
    propagateSharedCells: true,
    noteOffset: (pattern, row, channel) => eventAt(pattern, row, channel)?.transpose ?? 0,
    // The note byte and the instrument-slot command in front of it; every other byte of the stream stays as it is.
    effectPatches: (pattern, row, channel, cell) => {
      const ev = eventAt(pattern, row, channel);
      if (!ev || !grid) return { patches: [], noteUnchanged: false };
      const patches: Array<[number, number]> = [];
      const inst = cell.instrument ?? 0;
      if (ev.instrumentAt >= 0 && inst >= 1 && inst <= INSTRUMENT_SLOTS && inst !== buf[ev.instrumentAt] - 0x80 + 1) {
        patches.push([ev.instrumentAt, 0x80 + inst - 1]);
      }
      // A note that the cell shows already is not written. A new one goes through the note path (note offset = transpose),
      // which reports it unplaced when this event is a rest or the module's period table has no such note.
      const shown = ev.kind === 'note' ? periodToNote(grid.periodOf(buf[ev.at], ev.transpose)) : 0;
      if ((cell.note ?? 0) === shown) return { patches, noteUnchanged: true };
      const idx = ev.kind === 'note' ? grid.indexOfNote(cell.note ?? 0, ev.transpose) : -1;
      if (idx < 0) return { patches, noteUnchanged: false };
      patches.push([ev.at, idx]);
      return { patches, noteUnchanged: true };
    },
  };

  // ── Display name ─────────────────────────────────────────────────────

  let displayName = songName || moduleName;
  if (authorName) displayName += ` by ${authorName}`;
  displayName += ' [Core Design]';

  return {
    name: displayName,
    format: 'MOD' as TrackerFormat,
    patterns, instruments,
    songPositions: patterns.map((_, i) => i), songLength: patterns.length, restartPosition: 0,
    numChannels: channelCount, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: layout,
  };
}
