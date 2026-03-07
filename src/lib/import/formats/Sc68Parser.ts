/**
 * Sc68Parser.ts — SC68 / SNDH (Atari ST) format detection and parser
 *
 * Detects SC68 container files, raw SNDH files, and ICE-packed SNDH files.
 * Extracts metadata (title, composer, year, subsong count) from SNDH tags
 * and SC68 container chunks. Returns a TrackerSong with the raw binary stored
 * in sc68FileData for the Sc68Engine WASM player.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, InstrumentConfig } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell() {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(numCh: number, rows: number): Pattern {
  return {
    id: 'p0', name: 'Pattern 1', length: rows,
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
  return { text, nextOff: i + 1 };
}

/** Check if bytes at offset match a given ASCII tag. */
function matchTag(buf: Uint8Array, off: number, tag: string): boolean {
  if (off + tag.length > buf.length) return false;
  for (let i = 0; i < tag.length; i++) {
    if (buf[off + i] !== tag.charCodeAt(i)) return false;
  }
  return true;
}

function readU16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function readU32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

// ── Metadata Structures ──────────────────────────────────────────────────────

interface Sc68Metadata {
  title: string;
  composer: string;
  year: string;
  numSubsongs: number;
  replayFreq: number;
  subFormat: string;   // 'SC68' | 'SNDH' | 'ICE'
}

// ── SNDH Tag Parser ──────────────────────────────────────────────────────────

function parseSNDHTags(buf: Uint8Array, startOff: number): Sc68Metadata {
  const meta: Sc68Metadata = {
    title: '', composer: '', year: '',
    numSubsongs: 1, replayFreq: 50, subFormat: 'SNDH',
  };

  const scanLimit = Math.min(buf.length, startOff + 2048);
  let off = startOff + 4; // skip "SNDH" magic

  while (off < scanLimit - 3) {
    if (matchTag(buf, off, 'HDNS')) break;

    if (matchTag(buf, off, 'TITL')) {
      const r = readStringAdvance(buf, off + 4);
      meta.title = r.text;
      off = r.nextOff;
      continue;
    }
    if (matchTag(buf, off, 'COMM')) {
      const r = readStringAdvance(buf, off + 4);
      meta.composer = r.text;
      off = r.nextOff;
      continue;
    }
    if (matchTag(buf, off, 'YEAR')) {
      const r = readStringAdvance(buf, off + 4);
      meta.year = r.text;
      off = r.nextOff;
      continue;
    }
    // ## — subsong count
    if (buf[off] === 0x23 && buf[off + 1] === 0x23) {
      const tens = buf[off + 2] - 0x30;
      const ones = buf[off + 3] - 0x30;
      if (tens >= 0 && tens <= 9 && ones >= 0 && ones <= 9) {
        meta.numSubsongs = tens * 10 + ones;
      }
      off += 4;
      continue;
    }
    // TC/TA — timer frequency
    if ((buf[off] === 0x54 && (buf[off + 1] === 0x43 || buf[off + 1] === 0x41)) && off + 3 < scanLimit) {
      meta.replayFreq = readU16BE(buf, off + 2);
      off += 4;
      continue;
    }
    off++;
  }
  return meta;
}

// ── SC68 Container Parser ────────────────────────────────────────────────────

function parseSC68Container(buf: Uint8Array): Sc68Metadata {
  const meta: Sc68Metadata = {
    title: '', composer: '', year: '',
    numSubsongs: 1, replayFreq: 50, subFormat: 'SC68',
  };

  // Skip text header line (ends with LF)
  let off = 4;
  while (off < buf.length && buf[off] !== 0x0A) off++;
  off++;

  // Walk SC68 chunks: 2-char ID + uint32 BE size + data
  while (off + 6 <= buf.length) {
    const id0 = String.fromCharCode(buf[off], buf[off + 1]);
    const size = readU32BE(buf, off + 2);
    const dataOff = off + 6;
    if (dataOff + size > buf.length) break;

    if (id0 === 'NM') meta.title = readNullTerminated(buf, dataOff, size);
    else if (id0 === 'AN') meta.composer = readNullTerminated(buf, dataOff, size);
    else if (id0 === 'FQ' && size >= 2) meta.replayFreq = readU16BE(buf, dataOff);

    off = dataOff + size;
  }
  return meta;
}

// ── Format Detection ─────────────────────────────────────────────────────────

export function isSc68Format(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data);
  if (bytes.length < 4) return false;

  // SC68 container: "SC68 Music-file" at offset 0
  if (bytes.length >= 15) {
    let match = true;
    const expected = 'SC68 Music-file';
    for (let i = 0; i < 15 && match; i++) {
      if (bytes[i] !== expected.charCodeAt(i)) match = false;
    }
    if (match) return true;
  }

  // SNDH: "SNDH" at offset 12
  if (bytes.length >= 16 && matchTag(bytes, 12, 'SNDH')) return true;

  // ICE packed: "ICE!" at offset 0
  if (matchTag(bytes, 0, 'ICE!')) return true;

  return false;
}

// ── Parser ────────────────────────────────────────────────────────────────────

function extractMetadata(data: ArrayBuffer): Sc68Metadata {
  const buf = new Uint8Array(data);

  // SC68 container
  if (buf.length >= 4 && matchTag(buf, 0, 'SC68')) {
    return parseSC68Container(buf);
  }

  // Standard SNDH (magic at offset 12)
  if (buf.length >= 16 && matchTag(buf, 12, 'SNDH')) {
    return parseSNDHTags(buf, 12);
  }

  // ICE packed — can't extract tags without 68k CPU decompression
  return {
    title: '', composer: '', year: '',
    numSubsongs: 1, replayFreq: 50, subFormat: 'ICE',
  };
}

export async function parseSc68File(fileName: string, data: ArrayBuffer): Promise<TrackerSong> {
  const meta = extractMetadata(data);
  const baseName = fileName.replace(/\.(sc68|sndh|snd)$/i, '');

  // Build display title
  let title = meta.title || baseName;
  if (meta.composer) title += ` — ${meta.composer}`;
  title += ` [${meta.subFormat}]`;

  // YM2149 has 3 tone channels: A, B, C
  const NUM_CHANNELS = 3;
  const pattern = emptyPattern(NUM_CHANNELS, 64);

  const ymInst: InstrumentConfig = {
    id: 1, name: 'YM2149 Channel', type: 'synth', synthType: 'Sc68Synth',
    effects: [], volume: 0, pan: 0,
  };

  return {
    name: title,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments: [ymInst],
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    sc68FileData: data.slice(0),
  };
}
