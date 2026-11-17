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
// (0 = 256). Shortcuts: the order list's transpose and instrument-slot table are not applied (the grid shows the note byte
// through the period table, the slot number as the instrument), and period events (0x7E) are not editable.

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
export interface CoreDesignGrid {
  streams: CoreDesignStream[];
  patternBase: number;
  periodOf: (noteByte: number) => number;
  /** The note byte whose period shows as this grid note, or -1 (the table is not in ProTracker tuning, so match by shown note). */
  indexOfNote: (note: number) => number;
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
  return {
    streams,
    patternBase: base + patBase,
    periodOf: (noteByte) => periodAt(noteByte + noteOffset),
    indexOfNote: (n) => {
      for (let b = 0; b < 0x7e; b++) { const p = periodAt(b + noteOffset); if (p > 0 && periodToNote(p) === n) return b; }
      return -1;
    },
  };
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

  // ── Pattern streams: one grid pattern per stream, one row per tick, an event on the tick it starts ──

  const grid = codeStart > 0 ? readCoreDesignGrid(buf, codeStart) : null;
  const streams = grid?.streams ?? [];
  const rowsOf = (i: number): number => Math.max(streams[i]?.ticks ?? 1, 1);
  const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 } as TrackerCell);

  const patterns = Array.from({ length: Math.max(streams.length, 1) }, (_, p) => {
    const rows = Array.from({ length: rowsOf(p) }, emptyCell);
    for (const ev of streams[p]?.events ?? []) {
      if (ev.kind === 'period') continue;
      const period = ev.kind === 'note' && grid ? grid.periodOf(buf[ev.at]) : 0;
      rows[ev.tick] = {
        ...emptyCell(),
        note: periodToNote(period),
        instrument: ev.instrumentAt >= 0 ? buf[ev.instrumentAt] - 0x80 + 1 : 0,
        period: buf[ev.at],
      } as TrackerCell;
    }
    return {
      id: `pattern-${p}`, name: `Pattern ${p}`, length: rows.length,
      channels: [{
        id: 'channel-0', name: 'Pattern', muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null, rows,
      }],
      importMetadata: {
        sourceFormat: 'MOD' as const, sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 1, originalPatternCount: streams.length,
        originalInstrumentCount: instruments.length,
      },
    };
  });

  const eventAt = (pattern: number, row: number) => streams[pattern]?.events.find((e) => e.tick === row && e.kind !== 'period');

  const layout: UADEPatternLayout = {
    formatId: 'coreDesign',
    patternDataFileOffset: grid?.patternBase ?? 0,
    bytesPerCell: 1,
    rowsPerPattern: Math.max(1, ...streams.map((s) => s.ticks)),
    numChannels: 1,
    numPatterns: streams.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeCoreDesignCell,
    decodeCell: decodeCoreDesignCell,
    getCellFileOffset: (pattern, row) => eventAt(pattern, row)?.at ?? -1,
    // The note byte and the instrument-slot command in front of it; every other byte of the stream stays as it is.
    effectPatches: (pattern, row, _channel, cell) => {
      const ev = eventAt(pattern, row);
      if (!ev || !grid) return { patches: [], noteUnchanged: false };
      const patches: Array<[number, number]> = [];
      const note = cell.note ?? 0;
      if (ev.kind === 'note' && note !== periodToNote(grid.periodOf(buf[ev.at]))) {
        const idx = grid.indexOfNote(note);
        if (idx >= 0) patches.push([ev.at, idx]);
      }
      const inst = cell.instrument ?? 0;
      if (ev.instrumentAt >= 0 && inst >= 1 && inst <= INSTRUMENT_SLOTS && inst !== buf[ev.instrumentAt] - 0x80 + 1) {
        patches.push([ev.instrumentAt, 0x80 + inst - 1]);
      }
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
    numChannels: 1, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: layout,
  };
}
