/**
 * MusicMakerParser.ts — Music Maker 4V / 8V format parser
 *
 * Detection:
 *   IFF FORM container:  bytes[0..3] == "FORM", bytes[8..11] == "MMV4" or "MMV8"
 *   Legacy prefix-based: mm4.* / sdata.* (4V), mm8.* (8V)
 *
 * IFF chunk layout (starting at offset 12):
 *   SDAT — song data: 4 bytes (internal size) + MMV8_SONGID (0x5345) + name (20 bytes)
 *   INST — instrument data:
 *     Optional SEI1 header: 'SEI1' (4) + 'XX' (2) + inst_count (uint16)
 *     N × 8-byte instrument entries:
 *       [0..1] sample_length_bytes  uint16  total sample size in bytes (0 = empty)
 *       [2..3] repeat_length_bytes  uint16  0 = one-shot, >0 = looping
 *       [4..5] loop_start_bytes     uint16  offset from sample start to loop point
 *       [6..7] loop_length_words    uint16  loop size in Amiga 16-bit words
 *     4 bytes: defsnd block (skip)
 *     Concatenated signed 8-bit PCM (one block per non-empty instrument)
 *   INAM — instrument names (library paths):
 *     4-byte header: entry_size (uint16) + name_off (uint16)
 *     Typically: entry_size=60, name_off=36 → 24-byte name field per entry
 *     First instCount entries map 1:1 to PINS/INST instrument slots
 *     Names are Amiga library paths, e.g. "System:Instruments/egit2" (24-char max)
 *
 * References:
 *   UADE MusicMaker4.asm / MusicMaker8.asm (Thomas Winischhofer, BSD)
 *   uade-3.05/amigasrc/players/music_maker/
 *
 * eagleplayer.conf prefixes:
 *   MusicMaker_4V  prefixes=mm4,sdata
 *   MusicMaker_8V  prefixes=mm8
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

const MIN_IFF_SIZE = 12;

/** 2-byte song header magic ('SE' = 0x5345) found at SDAT+4 */
const MMV8_SONGID = 0x5345;

/** Default instrument count when no SEI1 extended header is present */
const DEFAULT_INSTNUM = 26;
/** Safety cap to prevent runaway loops on malformed files (SEI1-specified counts are trusted up to this) */
const MAX_INSTNUM = 64;

/** Amiga standard sample rate: C-3 at period 214 (PAL) */
const AMIGA_SAMPLE_RATE = 8363;

const TEXT_DECODER = new TextDecoder('iso-8859-1');

// ── Binary helpers ─────────────────────────────────────────────────────────────

function readTag4(buf: Uint8Array, offset: number): string {
  if (buf.length < offset + 4) return '';
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

function readTag2(buf: Uint8Array, offset: number): string {
  if (buf.length < offset + 2) return '';
  return String.fromCharCode(buf[offset], buf[offset + 1]);
}

function u16be(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) & 0xffff;
}

function u32be(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function readStr(buf: Uint8Array, off: number, len: number): string {
  let end = off;
  while (end < off + len && buf[end] !== 0) end++;
  return TEXT_DECODER.decode(buf.subarray(off, end)).trim();
}

// ── IFF chunk walker ───────────────────────────────────────────────────────────

interface IFFChunk { offset: number; size: number; }

/**
 * Walk FORM+MMV4/MMV8 IFF chunks. Returns a Map from chunk ID to
 * { offset, size } where offset points to the first byte of chunk data.
 */
function readChunks(buf: Uint8Array): Map<string, IFFChunk> {
  const chunks = new Map<string, IFFChunk>();
  let pos = 12; // skip FORM(4) + file_content_size(4) + format_tag(4)
  const fileEnd = buf.length;
  while (pos + 8 <= fileEnd) {
    const id = readTag4(buf, pos);
    const size = u32be(buf, pos + 4);
    const dataStart = pos + 8;
    if (dataStart + size > fileEnd) break; // truncated chunk
    if (!chunks.has(id)) chunks.set(id, { offset: dataStart, size }); // keep first
    pos = dataStart + size;
    if (pos & 1) pos++; // IFF pads odd-size chunks to word boundary
  }
  return chunks;
}

// ── INAM name reader ───────────────────────────────────────────────────────────

/**
 * Parse INAM chunk into a map of slot index → instrument name.
 *
 * INAM header (4 bytes): entry_size (u16) + name_off (u16)
 * Typically entry_size=60, name_off=36, giving a 24-byte name field.
 * Names are null-terminated Amiga library paths: "System:Instruments/egit2".
 * We strip the path prefix and return just the basename ("egit2").
 */
function readInamNames(buf: Uint8Array, chunk: IFFChunk): Map<number, string> {
  const names = new Map<number, string>();
  if (chunk.size < 4) return names;

  const entry_size = u16be(buf, chunk.offset);
  const name_off   = u16be(buf, chunk.offset + 2);
  if (entry_size === 0 || name_off >= entry_size) return names;

  const nameFieldLen = entry_size - name_off;
  const dataStart = chunk.offset + 4;
  const numEntries = Math.floor((chunk.size - 4) / entry_size);

  for (let i = 0; i < numEntries && i < MAX_INSTNUM; i++) {
    const eoff = dataStart + i * entry_size;
    if (eoff + entry_size > chunk.offset + chunk.size) break;

    const nameStart = eoff + name_off;
    const raw = readStr(buf, nameStart, nameFieldLen);
    if (!raw) continue;

    // Strip Amiga volume/path prefix: "System:Instruments/egit2" → "egit2".
    // If the path was truncated mid-component (e.g. "System:A1000Backup/dh0/I")
    // the last slash gives a single char — skip those, the fallback name is better.
    const slash = raw.lastIndexOf('/');
    const name = slash >= 0 ? raw.slice(slash + 1) : raw;
    if (name.length >= 2) names.set(i, name);
  }

  return names;
}

// ── Core parser ────────────────────────────────────────────────────────────────

function parseMusicMakerFile(
  buffer: ArrayBuffer,
  filename: string,
  numChannels: 4 | 8,
  label: string,
): TrackerSong {
  const buf = new Uint8Array(buffer);

  const baseName = filename.split('/').pop() ?? filename;
  let moduleName = baseName.replace(/^(mm4|mm8|sdata)\./i, '') || baseName;

  // Chunks are only present in IFF files; prefix-based legacy files have no IFF container.
  const isIFF = buf.length >= MIN_IFF_SIZE && readTag4(buf, 0) === 'FORM';
  const chunks = isIFF ? readChunks(buf) : new Map<string, IFFChunk>();

  // ── Song name from SDAT ──────────────────────────────────────────────────────
  // SDAT layout: [4 bytes: internal size][MMV8_SONGID (2 bytes)][name (20 bytes)]
  const sdat = chunks.get('SDAT');
  if (sdat && sdat.size >= 26) {
    const base = sdat.offset;
    if (u16be(buf, base + 4) === MMV8_SONGID) {
      const songName = readStr(buf, base + 6, 20);
      if (songName.length > 0) moduleName = songName;
    }
  }

  // ── Instrument names from INAM ───────────────────────────────────────────────
  const inam = chunks.get('INAM');
  const inamNames = inam ? readInamNames(buf, inam) : new Map<number, string>();

  // ── Instruments from INST ────────────────────────────────────────────────────
  // INST layout:
  //   Optional SEI1 header (8 bytes): 'SEI1' + 'XX' + inst_count
  //   N × 8-byte instrument entries
  //   4 bytes defsnd block
  //   Concatenated PCM data (signed 8-bit)
  const instruments: InstrumentConfig[] = [];
  // Real files use either 'PINS' or 'INST' for the PCM/instrument chunk.
  // Try PINS first (most common in practice), fall back to INST.
  const inst = chunks.get('PINS') ?? chunks.get('INST');

  if (inst && inst.size >= 8) {
    const chunkEnd = inst.offset + inst.size;
    let hdrPos = inst.offset;
    let instCount = DEFAULT_INSTNUM;

    // Check for SEI1 extended header
    if (
      hdrPos + 8 <= chunkEnd &&
      readTag4(buf, hdrPos) === 'SEI1' &&
      readTag2(buf, hdrPos + 4) === 'XX'
    ) {
      instCount = u16be(buf, hdrPos + 6);
      hdrPos += 8;
    }

    // Clamp to prevent runaway loops on malformed files.
    // When SEI1 is present it specifies the real count; allow up to MAX_INSTNUM.
    // When absent, instCount is already DEFAULT_INSTNUM (26).
    instCount = Math.min(instCount, MAX_INSTNUM);

    // Sample PCM data starts after: N × 8-byte headers + 4-byte defsnd
    const sampleDataStart = hdrPos + instCount * 8 + 4;

    if (sampleDataStart <= chunkEnd) {
      let sampleOff = sampleDataStart;

      for (let i = 0; i < instCount; i++) {
        const entryOff = hdrPos + i * 8;
        if (entryOff + 8 > chunkEnd) break;

        const sampleLenBytes = u16be(buf, entryOff + 0); // total sample size
        const repeatLenBytes = u16be(buf, entryOff + 2); // 0 = one-shot
        const loopStartBytes = u16be(buf, entryOff + 4); // loop start offset
        const loopLenWords   = u16be(buf, entryOff + 6); // loop length in words

        if (sampleLenBytes === 0) continue; // empty slot — no PCM to advance past

        const sampleEnd = sampleOff + sampleLenBytes;
        if (sampleEnd > chunkEnd) break; // truncated

        const pcm = buf.slice(sampleOff, sampleEnd);
        sampleOff = sampleEnd;

        // loopLenWords > 0 and repeatLenBytes > 0 → has loop
        const hasLoop = repeatLenBytes > 0 && loopLenWords > 0;
        const loopStartSamples = hasLoop ? loopStartBytes : 0;
        // loopLenWords is in Amiga 16-bit words (2 bytes each = 2 samples for 8-bit mono)
        const loopEndSamples = hasLoop
          ? loopStartBytes + loopLenWords * 2
          : pcm.length;

        instruments.push(createSamplerInstrument(
          i + 1,
          inamNames.get(i) ?? `Sample ${i + 1}`,
          pcm,
          64,               // default volume (max)
          AMIGA_SAMPLE_RATE,
          loopStartSamples,
          loopEndSamples,
        ));
      }
    }
  }

  // ── Empty pattern skeleton ───────────────────────────────────────────────────
  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: numChannels === 4
        ? (ch === 0 || ch === 3 ? -50 : 50)
        : Math.round(((ch / (numChannels - 1)) * 2 - 1) * 50),
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: numChannels,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length,
    },
  };

  return {
    name: `${moduleName} [${label}]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}

// ── Filename helpers ───────────────────────────────────────────────────────────

/** Return the bare filename (no directory), lowercased. */
function baseLower(filename: string): string {
  return ((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename).toLowerCase();
}

// ── Music Maker 4V ─────────────────────────────────────────────────────────────

/**
 * Detect Music Maker 4V format.
 *
 * Important: real IFF files (.mm4 extension) use FORM+MMV8 as the format tag,
 * NOT FORM+MMV4 — both 4V and 8V IFF files share the MMV8 tag and are
 * differentiated by filename extension only (matching UADE's eagleplayer logic).
 *
 * Detection order:
 *   1. IFF: FORM + MMV4 tag (theoretical; not seen in the wild)
 *   2. IFF: FORM + MMV8 tag + .mm4 extension
 *   3. Legacy prefix: mm4.* or sdata.*
 */
export function isMusicMaker4VFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const base = filename ? baseLower(filename) : '';

  if (buf.length >= MIN_IFF_SIZE && readTag4(buf, 0) === 'FORM') {
    const tag = readTag4(buf, 8);
    if (tag === 'MMV4') return true;
    // MMV8 tag is used for both 4V and 8V IFF — use extension to distinguish
    if (tag === 'MMV8' && base.endsWith('.mm4')) return true;
  }

  if (!filename) return false;
  // Legacy split-file format: songname stored as mm4.name or sdata.name
  return base.startsWith('mm4.') || base.startsWith('sdata.');
}

export function parseMusicMaker4VFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isMusicMaker4VFormat(buffer, filename)) throw new Error('Not a Music Maker 4V module');
  return parseMusicMakerFile(buffer, filename, 4, 'Music Maker 4V');
}

// ── Music Maker 8V ─────────────────────────────────────────────────────────────

/**
 * Detect Music Maker 8V format.
 *
 * IFF files use FORM+MMV8 tag. When a filename is available, .mm8 extension
 * confirms 8V. Without a filename (buffer-only check), any FORM+MMV8 that
 * didn't match 4V is treated as 8V.
 *
 * Detection order:
 *   1. IFF: FORM + MMV8 tag + .mm8 extension (or no contrary extension)
 *   2. Legacy prefix: mm8.*
 */
export function isMusicMaker8VFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const base = filename ? baseLower(filename) : '';

  if (buf.length >= MIN_IFF_SIZE && readTag4(buf, 0) === 'FORM') {
    if (readTag4(buf, 8) === 'MMV8') {
      // Exclude .mm4 files — those are 4V files that share the MMV8 tag
      if (base.endsWith('.mm4')) return false;
      return true;
    }
  }

  if (!filename) return false;
  return base.startsWith('mm8.');
}

export function parseMusicMaker8VFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  if (!isMusicMaker8VFormat(buffer, filename)) throw new Error('Not a Music Maker 8V module');
  return parseMusicMakerFile(buffer, filename, 8, 'Music Maker 8V');
}
