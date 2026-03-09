/**
 * SNDHParser.ts — Atari ST SNDH/SC68 format parser
 *
 * Parses metadata from SNDH files (68000 machine code targeting the YM2149)
 * and SC68 container files. Since SNDH is raw 68000 code that cannot be
 * interpreted without CPU emulation, we extract header tags and produce
 * stub patterns with 3 AY/YM2149 channels.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';
import { DEFAULT_FURNACE } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(id: string, name: string, numCh: number, rows: number): Pattern {
  return {
    id, name, length: rows,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `YM ${String.fromCharCode(65 + i)}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

/** Read a null-terminated ASCII string from a byte buffer. */
function readNullTerminated(buf: Uint8Array, off: number, maxLen: number = 256): string {
  let text = '';
  let i = off;
  const end = Math.min(off + maxLen, buf.length);
  while (i < end && buf[i] !== 0) {
    text += String.fromCharCode(buf[i++]);
  }
  return text;
}

/** Read ASCII string at offset, returning text and offset past the null terminator. */
function readStringAdvance(buf: Uint8Array, off: number, maxLen: number = 256): { text: string; nextOff: number } {
  let text = '';
  let i = off;
  const end = Math.min(off + maxLen, buf.length);
  while (i < end && buf[i] !== 0) {
    text += String.fromCharCode(buf[i++]);
  }
  return { text, nextOff: i + 1 }; // skip past null terminator
}

/** Check if 4 bytes at offset match a given ASCII tag. */
function matchTag(buf: Uint8Array, off: number, tag: string): boolean {
  if (off + tag.length > buf.length) return false;
  for (let i = 0; i < tag.length; i++) {
    if (buf[off + i] !== tag.charCodeAt(i)) return false;
  }
  return true;
}

/** Read big-endian uint16. */
function readU16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

/** Read big-endian uint32. */
function readU32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

// ── SNDH Tag Metadata ─────────────────────────────────────────────────────────

interface SNDHMeta {
  title: string;
  composer: string;
  ripper: string;
  converter: string;
  year: string;
  numSubsongs: number;
  durations: number[];   // per-subsong duration in seconds
  replayFreq: number;    // Hz (50 = VBL default)
}

/** Scan SNDH header tags starting after the "SNDH" magic. */
function parseSNDHTags(buf: Uint8Array): SNDHMeta {
  const meta: SNDHMeta = {
    title: '', composer: '', ripper: '', converter: '', year: '',
    numSubsongs: 1, durations: [], replayFreq: 50,
  };

  // Scan from offset 4 (past "SNDH" magic) up to a reasonable limit
  const scanLimit = Math.min(buf.length, 2048);
  let off = 4;

  while (off < scanLimit - 3) {
    // End of header marker
    if (matchTag(buf, off, 'HDNS')) break;

    // TITL — song title
    if (matchTag(buf, off, 'TITL')) {
      const r = readStringAdvance(buf, off + 4);
      meta.title = r.text;
      off = r.nextOff;
      continue;
    }

    // COMM — composer
    if (matchTag(buf, off, 'COMM')) {
      const r = readStringAdvance(buf, off + 4);
      meta.composer = r.text;
      off = r.nextOff;
      continue;
    }

    // RIPP — ripper
    if (matchTag(buf, off, 'RIPP')) {
      const r = readStringAdvance(buf, off + 4);
      meta.ripper = r.text;
      off = r.nextOff;
      continue;
    }

    // CONV — converter info
    if (matchTag(buf, off, 'CONV')) {
      const r = readStringAdvance(buf, off + 4);
      meta.converter = r.text;
      off = r.nextOff;
      continue;
    }

    // YEAR — year string
    if (matchTag(buf, off, 'YEAR')) {
      const r = readStringAdvance(buf, off + 4);
      meta.year = r.text;
      off = r.nextOff;
      continue;
    }

    // ## — subsong count (2-digit ASCII number follows)
    if (buf[off] === 0x23 && buf[off + 1] === 0x23) { // "##"
      const tens = buf[off + 2] - 0x30;
      const ones = buf[off + 3] - 0x30;
      if (tens >= 0 && tens <= 9 && ones >= 0 && ones <= 9) {
        meta.numSubsongs = tens * 10 + ones;
      }
      off += 4;
      continue;
    }

    // TIME — per-subsong durations (2 bytes each, big-endian seconds)
    if (matchTag(buf, off, 'TIME')) {
      off += 4;
      for (let s = 0; s < meta.numSubsongs && off + 1 < scanLimit; s++) {
        meta.durations.push(readU16BE(buf, off));
        off += 2;
      }
      continue;
    }

    // TC — Timer C frequency (uint16 BE)
    if (buf[off] === 0x54 && buf[off + 1] === 0x43 && off + 3 < scanLimit) { // "TC"
      meta.replayFreq = readU16BE(buf, off + 2);
      off += 4;
      continue;
    }

    // TA — Timer A frequency (uint16 BE)
    if (buf[off] === 0x54 && buf[off + 1] === 0x41 && off + 3 < scanLimit) { // "TA"
      meta.replayFreq = readU16BE(buf, off + 2);
      off += 4;
      continue;
    }

    // Skip unrecognised bytes one at a time
    off++;
  }

  return meta;
}

// ── SC68 Container Parser ─────────────────────────────────────────────────────

interface SC68Meta {
  title: string;
  author: string;
  replayFreq: number;
}

/** Parse an SC68 container, walking chunks for metadata. */
function parseSC68(buf: Uint8Array): SC68Meta {
  const meta: SC68Meta = { title: '', author: '', replayFreq: 50 };

  // SC68 header: "SC68 Music-file / (c) ..." followed by LF, then chunks
  // Find the first LF to skip the text header line
  let off = 4;
  while (off < buf.length && buf[off] !== 0x0A) off++;
  off++; // skip LF

  // Walk chunks: 2-char ID + uint32 BE size + data
  while (off + 6 <= buf.length) {
    const id0 = String.fromCharCode(buf[off], buf[off + 1]);
    const size = readU32BE(buf, off + 2);
    const dataOff = off + 6;

    if (dataOff + size > buf.length) break;

    if (id0 === 'NM') {
      meta.title = readNullTerminated(buf, dataOff, size);
    } else if (id0 === 'AN') {
      meta.author = readNullTerminated(buf, dataOff, size);
    } else if (id0 === 'FQ' && size >= 2) {
      meta.replayFreq = readU16BE(buf, dataOff);
    }

    off = dataOff + size;
  }

  return meta;
}

// ── Instrument Builder ────────────────────────────────────────────────────────

function buildAYInstruments(): InstrumentConfig[] {
  const names = ['YM A', 'YM B', 'YM C'];
  return names.map((name, i): InstrumentConfig => ({
    id: i + 1, name, type: 'synth', synthType: 'FurnaceAY',
    furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 } as FurnaceConfig,
    effects: [], volume: 0, pan: 0,
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isSNDHFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const b = new Uint8Array(buffer, 0, 4);
  const magic = String.fromCharCode(b[0], b[1], b[2], b[3]);
  return magic === 'SNDH' || magic === 'ICE!' || magic === 'Ice!' || magic === 'SC68';
}

export function parseSNDHFile(buffer: ArrayBuffer): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (buf.length < 4) throw new Error('File too small to be SNDH/SC68');

  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);

  // ICE-packed SNDH — can't unpack without 68000 emulation, return minimal stub
  if (magic === 'ICE!' || magic === 'Ice!') {
    const instruments = buildAYInstruments();
    const pattern = emptyPattern('p0', 'Pattern 1', 3, 64);
    return {
      name: 'ICE-packed SNDH',
      format: 'SNDH' as TrackerFormat,
      patterns: [pattern],
      instruments,
      songPositions: [0],
      songLength: 1,
      restartPosition: 0,
      numChannels: 3,
      initialSpeed: 6,
      initialBPM: 125,
      sc68FileData: buffer.slice(0),
    };
  }

  // SC68 container format
  if (magic === 'SC68') {
    const sc68 = parseSC68(buf);
    const instruments = buildAYInstruments();
    const pattern = emptyPattern('p0', 'Pattern 1', 3, 64);
    const title = sc68.title || 'SC68 File';
    return {
      name: title + (sc68.author ? ` — ${sc68.author}` : ''),
      format: 'SNDH' as TrackerFormat,
      patterns: [pattern],
      instruments,
      songPositions: [0],
      songLength: 1,
      restartPosition: 0,
      numChannels: 3,
      initialSpeed: 6,
      initialBPM: 125,
      sc68FileData: buffer.slice(0),
    };
  }

  // Standard SNDH
  if (magic !== 'SNDH') throw new Error('Not a valid SNDH/SC68 file');

  const meta = parseSNDHTags(buf);
  const instruments = buildAYInstruments();
  const pattern = emptyPattern('p0', 'Pattern 1', 3, 64);
  const title = meta.title || 'SNDH File';

  return {
    name: title + (meta.composer ? ` — ${meta.composer}` : ''),
    format: 'SNDH' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 6,
    initialBPM: 125,
    sc68FileData: buffer.slice(0),
  };
}
