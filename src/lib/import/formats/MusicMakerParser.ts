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
import type { InstrumentConfig, Pattern, TrackerCell, ChannelData } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { tempoForRowMs, bpmForRowMs } from '../rowTempo';

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
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
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

// ══════════════════════════════════════════════════════════════════════════════
// Native MusicMaker V8 song model (split `.sdata` + `.ip`/`.i`, or SDAT + PINS/INST)
//
// The spec is Thomas Winischhofer's own player source, MusicMaker4.asm (STD,
// 4 voices) and MusicMaker8.asm (EXT, 8 software-mixed voices) in
// third-party/uade-3.05/amigasrc/players/music_maker. Format notes and line
// references: thoughts/shared/research/2026-10-05_musicmaker-native-replayer.md.
//
// Everything a voice does in time is fixed by the song data, so the melody
// walk (macros, pauses, ties, the 999 loop) is compiled here once into
// tick-stamped events. The grid and the worklet (public/musicmaker/
// MusicMaker.worklet.js) both read those events; the worklet only does the
// per-tick voice work (slides, envelopes, fades) and the mixing.
// ══════════════════════════════════════════════════════════════════════════════

/** 'SE' at the start of a song with a name. */
const SONG_ID = 0x5345;
/** Melody list terminator: loop to the loop position. */
const MELODY_END = 999;
/** Size of the EXT player's mixer period table (ignored natively). */
const EXT_HIGHTABLE = 226;
/** Instrument slots; instrument 36 on EXT means "continue the cut voice". */
export const MM_INSTNUM = 36;
/** The note table both players use (mm4 notetable): 64 periods, part quarter-tones. */
export const MM_NOTE_PERIODS: readonly number[] = [
  856, 832, 808, 784, 760, 740, 720, 700, 680, 660, 640, 622,
  604, 588, 572, 556, 540, 524, 508, 494, 480, 466, 452, 440,
  428, 416, 404, 392, 380, 370, 360, 350, 340, 330, 320, 311,
  302, 294, 286, 278, 270, 262, 254, 247, 240, 233, 226, 220,
  214, 208, 202, 196, 190, 185, 180, 175, 170, 160, 151, 143,
  135, 127, 120, 113,
];
/** strtvolus: volume index (low nibble of a note's first byte) to Paula volume. */
export const MM_VOLUMES: readonly number[] = [0, 1, 2, 3, 5, 7, 11, 16, 22, 28, 34, 40, 46, 52, 58, 64];
/** CIA-B clock (PAL); one tick is speed * 23 of these. */
export const MM_CIA_HZ = 709379;

export type MusicMakerKind = 'std' | 'ext';

export interface MusicMakerSongData {
  kind: MusicMakerKind;
  name: string;
  /** Voices the player runs: 4 (STD) or 8 (EXT). */
  voices: number;
  /** Bit n set = voice n has a melody (EXT); 0x0f for STD. */
  channelsEnabled: number;
  /** Rows of a pause entry (a pause lasts pattlen * 2 ticks). */
  pattlen: number;
  speed: number;
  /** Per voice: macro indices, start and loop positions. */
  melodies: { list: number[]; start: number; loop: number }[];
  /** sdata offset of each macro index 0..998 (empty and unused = the first macro). */
  macroVecs: Int32Array;
  sdata: Uint8Array;
}

/** Read `count` 999-terminated word lists from `at`; null when a list runs off the end. */
function readMelodyLists(b: Uint8Array, at: number, count: number): { lists: number[][]; end: number } | null {
  const lists: number[][] = [];
  let p = at;
  for (let v = 0; v < count; v++) {
    const list: number[] = [];
    for (;;) {
      if (p + 2 > b.length) return null;
      const w = u16be(b, p); p += 2;
      if (w === MELODY_END) break;
      list.push(w);
    }
    lists.push(list);
  }
  return { lists, end: p };
}

/** Index the macro area (ptrsinit lookontostart); null unless it ends on $FE near the end of the file. */
function readMacroArea(b: Uint8Array, at: number): { vecs: Int32Array; count: number; end: number } | null {
  const vecs = new Int32Array(MELODY_END).fill(at);
  let n = 0, p = at;
  while (p < b.length) {
    if (b[p] === 0xfe) break;
    if (b[p] === 0xff) { if (n < MELODY_END) vecs[n] = at; n++; p++; continue; }
    if (n < MELODY_END) vecs[n] = p;
    n++;
    p += 3;
    while (p < b.length && b[p] !== 0xff) p += 3;
    p++;
  }
  // The editor saves the song up to the terminator (an even pad at most).
  if (p >= b.length || b.length - p > 2) return null;
  return { vecs, count: n, end: p };
}

/**
 * The players' own limits: MusicMaker4's Chk wants a pattern length of 16..64
 * ("checks macrolength"), and both clamp the speed to 300..2800. (A melody
 * entry past the last macro is legal: its vector is the first macro.)
 */
const SPEED_MIN = 300, SPEED_MAX = 2800;
const plausibleSpeed = (speed: number): boolean => speed >= SPEED_MIN && speed <= SPEED_MAX;

function popcount8(x: number): number { let n = 0; for (let i = 0; i < 8; i++) n += (x >> i) & 1; return n; }

function songName(b: Uint8Array): string { return readStr(b, 2, 20); }

function parseStd(b: Uint8Array): MusicMakerSongData | null {
  if (b.length < 32) return null;
  const format = b[22], pattlen = b[23], speed = u16be(b, 24);
  const start = u16be(b, 26), loop = u16be(b, 28);
  const ext = format === 0xfe ? u16be(b, 30) : 0;
  const mel = readMelodyLists(b, 30 + ext, 4);
  if (!mel || pattlen < 16 || pattlen > 64) return null;
  const macros = readMacroArea(b, mel.end);
  if (!macros || !plausibleSpeed(speed)) return null;
  return {
    kind: 'std', name: songName(b), voices: 4, channelsEnabled: 0x0f, pattlen, speed,
    melodies: mel.lists.map((list) => ({ list, start, loop })), macroVecs: macros.vecs, sdata: b,
  };
}

function parseExt(b: Uint8Array): MusicMakerSongData | null {
  if (b.length < 30) return null;
  const enabled = b[23];
  const base = 26 + (b[26] === 0xfe ? u16be(b, 28) : 0) + 4 + EXT_HIGHTABLE;
  if (enabled === 0 || base + 8 > b.length) return null;
  const pattlen = u16be(b, base), speed = u16be(b, base + 2);
  const start = u16be(b, base + 4), loop = u16be(b, base + 6);
  const mel = readMelodyLists(b, base + 8, popcount8(enabled));
  if (!mel || pattlen === 0 || pattlen > 256) return null;
  const macros = readMacroArea(b, mel.end);
  if (!macros || !plausibleSpeed(speed)) return null;
  // Lists are stored for the enabled voices in voice order; a disabled voice
  // plays mychanneloffmelody (0, 999) from position 0.
  let next = 0;
  const melodies = Array.from({ length: 8 }, (_, v) => (enabled >> v) & 1
    ? { list: mel.lists[next++], start, loop }
    : { list: [0], start: 0, loop: 0 });
  return {
    kind: 'ext', name: songName(b), voices: 8, channelsEnabled: enabled, pattlen, speed,
    melodies, macroVecs: macros.vecs, sdata: b,
  };
}

/** True for MusicMaker song data ('SE' + a name, STD or EXT layout). */
export function isMusicMakerSongData(buffer: ArrayBuffer | Uint8Array): boolean {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return b.length >= 30 && u16be(b, 0) === SONG_ID && (parseStd(b) !== null || parseExt(b) !== null);
}

/**
 * Decode an sdata block. The players tell STD from EXT by byte 22 == $FF
 * (`_isstdsong`), which misreads both corpus songs (moveback: an STD song
 * with $00; best of guitars: an EXT song with $FF). The layout that parses
 * through the macro terminator decides; byte 22 only breaks a tie.
 */
export function decodeMusicMakerSong(buffer: ArrayBuffer | Uint8Array): MusicMakerSongData {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (b.length < 30 || u16be(b, 0) !== SONG_ID) throw new Error("MusicMaker song data must start with 'SE'");
  const std = parseStd(b), ext = parseExt(b);
  const song = std && ext ? (b[22] === 0xff ? std : ext) : (std ?? ext);
  if (!song) throw new Error('MusicMaker song data does not parse as a 4- or 8-voice song');
  return song;
}

// ── Instruments ───────────────────────────────────────────────────────────────

export interface MusicMakerInstruments {
  /** The file was the packed (`.ip`) codec. */
  packed: boolean;
  count: number;
  /** Per instrument: [length, first-play length, loop start, loop length (words)]. */
  lens: Uint16Array;
  samples: Int8Array[];
  /** HULL (LFO) tables 1..15: data and each table's offset into it (-1 = none). */
  lfoData: Uint8Array;
  lfoOffsets: Int32Array;
}

function instHeader(b: Uint8Array): { count: number; at: number } {
  if (readTag4(b, 0) === 'SEI1' && readTag2(b, 4) === 'XX') return { count: u16be(b, 6), at: 8 };
  return { count: 26, at: 0 };
}

function readLfo(b: Uint8Array, at: number): { lfoData: Uint8Array; lfoOffsets: Int32Array; end: number } {
  const lfoOffsets = new Int32Array(16).fill(-1);
  let total = 0;
  for (let n = 0; n < 15; n++) {
    lfoOffsets[n + 1] = total;
    total += at + n * 2 + 2 <= b.length ? u16be(b, at + n * 2) : 0;
  }
  const from = Math.min(b.length, at + 30);
  return { lfoData: b.slice(from, Math.min(b.length, from + total)), lfoOffsets, end: at + 30 + total };
}

/** `.i` layout (ptrsinit): entries, 4 bytes defsnd, samples, even pad, LFO block. */
function decodeUnpacked(b: Uint8Array): MusicMakerInstruments & { end: number } {
  const { count, at } = instHeader(b);
  const lens = new Uint16Array(count * 4);
  for (let i = 0; i < count * 4; i++) lens[i] = u16be(b, at + i * 2);
  let p = at + count * 8 + 4;
  const samples: Int8Array[] = [];
  for (let i = 0; i < count; i++) {
    const n = lens[i * 4];
    samples.push(new Int8Array(b.buffer, b.byteOffset + Math.min(p, b.length), Math.max(0, Math.min(n, b.length - p))).slice());
    p += n;
  }
  if (p & 1) p++;
  const lfo = readLfo(b, p);
  return { packed: false, count, lens, samples, ...lfo };
}

/** `.ip` layout (_decrunchinstrs + decompress): delta table codes, fibbits bits per sample. */
function decodePacked(b: Uint8Array): MusicMakerInstruments & { end: number } {
  const { count, at } = instHeader(b);
  const lens = new Uint16Array(count * 4);
  for (let i = 0; i < count * 4; i++) lens[i] = u16be(b, at + i * 2);
  let p = at + count * 8;
  const fibbits = u16be(b, p); p += 2;
  if (fibbits < 1 || fibbits > 8) throw new Error(`MusicMaker packed instruments: ${fibbits} bits per code`);
  const table = b.subarray(p, p + (1 << fibbits)); p += 1 << fibbits;
  const samples: Int8Array[] = [];
  for (let i = 0; i < count; i++) {
    const n = lens[i * 4];
    const out = new Int8Array(n);
    if (n > 0) {
      let acc = 0, byte = 0, left = 0;
      for (let s = 0; s < n; s++) {
        let code = 0;
        for (let k = 0; k < fibbits; k++) {
          if (--left < 0) { byte = p < b.length ? b[p] : 0; p++; left = 7; }
          code = (code << 1) | ((byte >> 7) & 1);
          byte = (byte << 1) & 0xff;
        }
        acc = (acc + table[code]) & 0xff;
        out[s] = acc << 24 >> 24;
      }
      // decompress steps one more byte when the sample ended on a byte boundary.
      if (--left < 0) p++;
    }
    samples.push(out);
  }
  const lfo = readLfo(b, p);
  return { packed: true, count, lens, samples, ...lfo };
}

/**
 * Decode an instrument file. The player picks the codec by file name (`.i`
 * unpacked, `.ip` packed), but the app may hand `.ip` bytes under the `.i`
 * name (companionResolver's alias for UADE), so the layout that accounts for
 * the file's length decides.
 */
export function decodeMusicMakerInstruments(buffer: ArrayBuffer | Uint8Array, packedHint?: boolean): MusicMakerInstruments {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const fits = (r: { end: number }) => Math.abs(r.end - b.length) <= 2;
  let packed: (MusicMakerInstruments & { end: number }) | null = null;
  try { packed = decodePacked(b); } catch { packed = null; }
  const unpacked = decodeUnpacked(b);
  if (packed && fits(packed) && (!fits(unpacked) || packedHint !== false)) return packed;
  if (fits(unpacked)) return unpacked;
  if (packed && packedHint) return packed;
  throw new Error(`MusicMaker instruments: ${b.length} bytes fit neither the packed nor the unpacked layout`);
}

// ── Single-file container (MMV8 3.0 IFF) ──────────────────────────────────────

/** FORM/MMV8 with SDAT (4-byte length + sdata) and PINS (packed) or INST (unpacked). */
export function buildMusicMakerIff(sdata: Uint8Array, instruments: Uint8Array, packed: boolean): ArrayBuffer {
  const chunk = (id: string, body: Uint8Array) => {
    const pad = body.length & 1;
    const c = new Uint8Array(8 + body.length + pad);
    for (let i = 0; i < 4; i++) c[i] = id.charCodeAt(i);
    new DataView(c.buffer).setUint32(4, body.length);
    c.set(body, 8);
    return c;
  };
  const sdat = new Uint8Array(4 + sdata.length);
  new DataView(sdat.buffer).setUint32(0, sdata.length);
  sdat.set(sdata, 4);
  const parts = [chunk('SDAT', sdat), chunk(packed ? 'PINS' : 'INST', instruments)];
  const size = 4 + parts.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(8 + size);
  out.set([0x46, 0x4f, 0x52, 0x4d], 0);
  new DataView(out.buffer).setUint32(4, size);
  out.set([0x4d, 0x4d, 0x56, 0x38], 8);
  let p = 12;
  for (const c of parts) { out.set(c, p); p += c.length; }
  return out.buffer;
}

/** Song + instruments from an MMV8 IFF (the engine's file data, or a .mm4/.mm8 file). */
export function readMusicMakerIff(buffer: ArrayBuffer | Uint8Array): { song: MusicMakerSongData; instruments: MusicMakerInstruments } {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (readTag4(b, 0) !== 'FORM' || readTag4(b, 8) !== 'MMV8') throw new Error('Not a MusicMaker FORM/MMV8 file');
  const chunks = readChunks(b);
  const sdat = chunks.get('SDAT');
  if (!sdat || sdat.size < 4) throw new Error('MusicMaker file has no SDAT chunk');
  const song = decodeMusicMakerSong(b.slice(sdat.offset + 4, sdat.offset + sdat.size));
  const pins = chunks.get('PINS'), inst = chunks.get('INST');
  const c = pins ?? inst;
  if (!c) throw new Error('MusicMaker file has no INST or PINS chunk');
  const instruments = decodeMusicMakerInstruments(b.subarray(c.offset, c.offset + c.size), !!pins);
  return { song, instruments };
}

// ── Voice timelines ───────────────────────────────────────────────────────────

export const MM_OP = {
  NOTE: 1, OFF: 2, LOUDNESS: 3, FADE: 4, FADE_STATE: 5, PER_SLIDE: 6, VOL_SLIDE: 7,
  TREMOLO: 8, VIBRATO: 9, HULL: 10, SPEED: 11, NOP: 12,
} as const;

/**
 * One triple as handle_channel acts on it, at tick `t` of its voice.
 * NOTE: inst (bank included), note (0..63), vol (index 0..15), loop (b1 bit 7),
 * legato (b2 bit 7: change pitch and volume without retriggering), slide =
 * [period, volume] from a following $F2/$FB triple, or null.
 */
export interface MusicMakerEvent {
  t: number;
  op: number;
  /** The voice was reset first (first event after the 999 loop). */
  reset?: boolean;
  inst?: number; note?: number; vol?: number; loop?: boolean; legato?: boolean;
  slide?: [number, number] | null;
  /** LOUDNESS on, FADE speed (<0 in, >0 out, 0 off), FADE_STATE, slides, HULL table, SPEED f1/f2. */
  value?: number; value2?: number;
}

export interface MusicMakerVoiceTimeline {
  /** Events from the start until the first loop. */
  intro: MusicMakerEvent[];
  /** Events of one loop cycle, ticks relative to the cycle start. */
  cycle: MusicMakerEvent[];
  introTicks: number;
  cycleTicks: number;
  /** Tick at which each melody position of the first pass starts. */
  positionTicks: number[];
}

const s4 = (n: number) => (n & 0x8) ? (n & 0xf) - 16 : (n & 0xf);
const s8 = (n: number) => n << 24 >> 24;

/** Walk one voice's melody the way handle_channel / getnewmacro do. */
function walkVoice(song: MusicMakerSongData, v: number, fromLoop: boolean): { events: MusicMakerEvent[]; ticks: number; positionTicks: number[] } {
  const b = song.sdata;
  const { list, start, loop } = song.melodies[v];
  const at = (i: number) => i < list.length ? list[i] : MELODY_END;
  let pos = fromLoop ? loop : start;
  let mp = song.macroVecs[Math.min(at(pos), MELODY_END - 1)] ?? 0;
  const events: MusicMakerEvent[] = [];
  const positionTicks: number[] = [0];
  let t = 0;
  let reset = fromLoop;
  const byte = (o: number) => o < b.length ? b[o] : 0xfe;
  // Bounded: a song longer than this is not one the editor could save.
  for (let guard = 0; guard < 200000; guard++) {
    // One countatzero: decode the triple at mp.
    let b0 = byte(mp), b1 = byte(mp + 1);
    const next0 = byte(mp + 3);
    const durByte = (next0 === 0xf2 || next0 === 0xfb || b0 === 0xf8) ? byte(mp + 5) : byte(mp + 2);
    const dur = ((durByte & 0x3f) + 1) * 2;
    let bank = 0;
    const ev: MusicMakerEvent = { t, op: MM_OP.NOP };
    if (reset) { ev.reset = true; reset = false; }
    if (b0 > 0xf1 && b0 === 0xf4) { ev.op = MM_OP.LOUDNESS; ev.value = b1 ? 1 : 0; }
    else if (b0 > 0xf1 && (b0 === 0xfd || b0 === 0xf5)) { ev.op = MM_OP.NOP; }
    else if (b0 > 0xf1 && b0 === 0xf6) { ev.op = MM_OP.FADE; ev.value = s8(b1); }
    else if (b0 > 0xf1 && b0 === 0xf7) { ev.op = MM_OP.FADE_STATE; ev.value = b1 ? 256 : 8192; }
    else {
      if (b0 === 0xf8) { bank = b1; mp += 3; b0 = byte(mp); b1 = byte(mp + 1); }
      const b2 = byte(mp + 2);
      if (b0 > 0xf1 && b0 === 0xf9) {
        const d = s8(b1);
        if (!(b2 & 0x80)) { ev.op = MM_OP.PER_SLIDE; ev.value = d; }
        else if (!(b2 & 0x40)) { ev.op = MM_OP.VOL_SLIDE; ev.value = d; }
        else if (d < 0) { ev.op = MM_OP.TREMOLO; ev.value = -d; }
        else { ev.op = MM_OP.VIBRATO; ev.value = d; }
      } else if (b0 > 0xf1 && b0 === 0xfa) {
        ev.op = MM_OP.HULL; ev.value = ((b1 >> 4) & 0xf) + bank; ev.value2 = b1 & 0xf;
      } else if (b0 > 0xf1 && b0 === 0xfc) {
        ev.op = MM_OP.SPEED; ev.value = (b1 >> 4) & 0xf; ev.value2 = b1 & 0xf;
      } else {
        // nocontrolbyte: a note, or a note off ($F1 / volume index 0).
        const vol = b0 & 0xf;
        if (b0 === 0xf1 || vol === 0) { ev.op = MM_OP.OFF; }
        else {
          ev.op = MM_OP.NOTE; ev.inst = ((b0 >> 4) & 0xf) + bank; ev.note = b1 & 0x3f; ev.vol = vol;
          ev.loop = !!(b1 & 0x80); ev.legato = !!(b2 & 0x80); ev.slide = null;
          if (ev.legato) {
            const n0 = byte(mp + 3);
            if (n0 === 0xf2 || n0 === 0xfb) {
              const sb = byte(mp + 4);
              ev.slide = [s4(sb) << (n0 === 0xfb ? 1 : 0), s4(sb >> 4)];
              mp += 3;
            }
          }
        }
      }
    }
    events.push(ev);
    t += dur;
    // addcounthandle: next triple; skip an $F3 pair; at $FF fetch the next macro.
    let wrapped = false;
    for (;;) {
      mp += 3;
      if (byte(mp) === 0xf3) mp += 6;
      if (byte(mp) !== 0xff) break;
      // getnewmacro: a 0 entry is a pause of pattlen * 2 ticks, 999 loops.
      let tie = true;
      for (;;) {
        pos++;
        if (at(pos) === MELODY_END) { pos = loop; tie = false; wrapped = true; break; }
        positionTicks.push(t);
        if (at(pos) !== 0) break;
        t += song.pattlen * 2;
      }
      mp = song.macroVecs[Math.min(at(pos), MELODY_END - 1)];
      if (!tie || byte(mp) !== 0xf0) break;
      t += ((byte(mp + 2) & 0x3f) + 1) * 2;
    }
    if (wrapped) return { events, ticks: t, positionTicks };
  }
  throw new Error(`MusicMaker voice ${v + 1}: melody does not reach its end`);
}

/** Compile a voice into its intro (start to first loop) and its repeating cycle. */
export function compileMusicMakerVoice(song: MusicMakerSongData, v: number): MusicMakerVoiceTimeline {
  const intro = walkVoice(song, v, false);
  const cycle = walkVoice(song, v, true);
  return { intro: intro.events, cycle: cycle.events, introTicks: intro.ticks, cycleTicks: cycle.ticks, positionTicks: intro.positionTicks };
}

/** Seconds per tick at a speed value (both players: speed * 23 CIA-B ticks). */
export function musicMakerTickSeconds(speed: number): number {
  return speed * 23 / MM_CIA_HZ;
}

/** What MusicMakerEngine posts to the worklet. */
export interface MusicMakerWorkletModule {
  kind: MusicMakerKind;
  voices: number;
  speed: number;
  timelines: MusicMakerVoiceTimeline[];
  instruments: MusicMakerInstruments;
}

/** Decode the engine's file data (an MMV8 IFF) into the worklet's module message. */
export function musicMakerWorkletModule(fileData: ArrayBuffer | Uint8Array): MusicMakerWorkletModule {
  const { song, instruments } = readMusicMakerIff(fileData);
  return {
    kind: song.kind, voices: song.voices, speed: song.speed,
    timelines: Array.from({ length: song.voices }, (_, v) => compileMusicMakerVoice(song, v)),
    instruments,
  };
}

// ── Grid ──────────────────────────────────────────────────────────────────────

const baseName = (n: string) => (n.split('/').pop() ?? n).split('\\').pop() ?? n;

/** The song's stem for its side files: `<tune>.sdata` or prefix form `sdata.<tune>`. */
function songStem(filename: string): string {
  const b = baseName(filename);
  const suffix = /^(.*)\.sdata$/i.exec(b);
  if (suffix) return suffix[1];
  const prefix = /^sdata\.(.*)$/i.exec(b);
  return prefix ? prefix[1] : b;
}

/** A companion by its name: `<stem>.<ext>` or prefix form `<ext>.<stem>`. */
function companion(companions: Map<string, ArrayBuffer> | undefined, stem: string, ext: string): ArrayBuffer | undefined {
  const want = [`${stem}.${ext}`.toLowerCase(), `${ext}.${stem}`.toLowerCase()];
  for (const [k, v] of companions ?? []) if (want.includes(baseName(k).toLowerCase())) return v;
  return undefined;
}

/** `.ip.n` / `.i.n`: 16-byte instrument names. */
function sideNames(bytes: ArrayBuffer | undefined): string[] {
  if (!bytes) return [];
  const b = new Uint8Array(bytes);
  return Array.from({ length: Math.floor(b.length / 16) }, (_, i) => readStr(b, i * 16, 16).replace(/\s+/g, ' ').trim());
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/**
 * A MusicMaker V8 song (`<tune>.sdata` + `<tune>.ip`/`.i`) for MusicMakerEngine.
 * The grid is one pattern per melody position of the longest voice, a row per
 * two ticks (every duration is a multiple of two ticks), the notes and rests
 * the voices play. The song travels as one MMV8 IFF (`musicMakerFileData`).
 */
export function parseMusicMakerSongFile(
  buffer: ArrayBuffer | Uint8Array,
  filename: string,
  companions?: Map<string, ArrayBuffer>,
): TrackerSong {
  const sdata = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const song = decodeMusicMakerSong(sdata);
  const stem = songStem(filename);
  const instFile = companion(companions, stem, 'ip') ?? companion(companions, stem, 'i');
  if (!instFile) throw new Error(`${baseName(filename)}: a MusicMaker song plays from its instruments - add ${stem}.ip (or ${stem}.i) beside it`);
  const instBytes = new Uint8Array(instFile);
  const instruments = decodeMusicMakerInstruments(instBytes, !!companion(companions, stem, 'ip'));
  const names = sideNames(companion(companions, stem, 'ip.n') ?? companion(companions, stem, 'i.n'));

  const timelines = Array.from({ length: song.voices }, (_, v) => compileMusicMakerVoice(song, v));
  // Pattern boundaries: the positions of the enabled voice that runs longest.
  let ref = -1;
  for (let v = 0; v < song.voices; v++) {
    if (!((song.channelsEnabled >> v) & 1)) continue;
    if (ref < 0 || timelines[v].introTicks > timelines[ref].introTicks) ref = v;
  }
  const bounds = [...timelines[ref].positionTicks, timelines[ref].introTicks];
  const patternCount = Math.max(1, bounds.length - 1);

  const ext = song.kind === 'ext';
  const pan = (v: number) => ([-50, 50, 50, -50][ext ? v >> 1 : v]);
  const patterns: Pattern[] = Array.from({ length: patternCount }, (_, p) => {
    const length = Math.max(1, Math.round((bounds[p + 1] - bounds[p]) / 2));
    return {
      id: `p${p}`, name: `Position ${p}`, length,
      channels: Array.from({ length: song.voices }, (_, v): ChannelData => ({
        id: `ch${v}`, name: `Voice ${v + 1}`, muted: false, solo: false, collapsed: false, volume: 100, pan: pan(v),
        instrumentId: null, color: null, rows: Array.from({ length }, emptyCell),
      })),
    };
  });

  const rowMs = 2 * musicMakerTickSeconds(song.speed) * 1000;
  const { speed: gridSpeed, bpm } = tempoForRowMs(rowMs);
  const cellAt = (v: number, t: number): TrackerCell | null => {
    if (t >= bounds[bounds.length - 1]) return null;
    let p = 0;
    while (p + 1 < bounds.length - 1 && bounds[p + 1] <= t) p++;
    const row = Math.floor((t - bounds[p]) / 2);
    return patterns[p].channels[v].rows[row] ?? null;
  };
  for (let v = 0; v < song.voices; v++) {
    const tl = timelines[v];
    // The grid covers the reference voice's first pass; a shorter voice loops.
    const end = bounds[bounds.length - 1];
    let base = 0, list = tl.intro, len = tl.introTicks;
    for (let guard = 0; base < end && guard < 10000; guard++) {
      for (const e of list) {
        const cell = cellAt(v, base + e.t);
        if (!cell) continue;
        if (e.op === MM_OP.NOTE) {
          cell.note = periodToNote(MM_NOTE_PERIODS[e.note ?? 0]);
          cell.instrument = e.legato ? 0 : (e.inst ?? 0) + 1;
          cell.volume = 0x10 + MM_VOLUMES[e.vol ?? 0];
        } else if (e.op === MM_OP.OFF) {
          cell.note = 97;
        } else if (e.op === MM_OP.SPEED && e.value2) {
          const cs = ext
            ? Math.min(song.speed, Math.max(600, Math.floor(song.speed * (e.value ?? 0) / e.value2)))
            : Math.min(2800, Math.max(300, Math.floor(song.speed * (e.value ?? 0) / e.value2)));
          cell.effTyp = 0x0f;
          cell.eff = bpmForRowMs(2 * musicMakerTickSeconds(cs) * 1000, gridSpeed);
        }
      }
      if (!tl.cycle.length || tl.cycleTicks <= 0) break;
      base += len;
      list = tl.cycle; len = tl.cycleTicks;
    }
  }

  const instrumentConfigs: InstrumentConfig[] = [];
  for (let i = 0; i < instruments.count; i++) {
    if (!instruments.lens[i * 4] && !names[i]) continue;
    instrumentConfigs.push({
      id: i + 1, name: names[i] || `Instrument ${i + 1}`, type: 'synth' as const,
      synthType: 'MusicMakerSynth' as const, effects: [] as [], volume: 0, pan: 0,
    });
  }

  const loopPos = song.melodies[ref].loop;
  return {
    name: song.name || stem,
    format: 'MusicMaker' as TrackerFormat,
    patterns,
    instruments: instrumentConfigs,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: Math.min(patterns.length - 1, Math.max(0, loopPos - song.melodies[ref].start)),
    numChannels: song.voices,
    initialSpeed: gridSpeed,
    initialBPM: bpm,
    musicMakerFileData: buildMusicMakerIff(sdata, instBytes, instruments.packed),
  };
}
