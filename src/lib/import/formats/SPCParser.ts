/**
 * SPCParser.ts — Super Nintendo SPC700 sound format parser
 *
 * Parses SPC files containing 64KB SPC700 RAM dumps plus DSP register state.
 * Extracts ID666 text tags and xid6 extended tags for metadata (title, game,
 * artist, dumper, comments). Creates 8 SNES DSP voice channels with Furnace
 * SNES instruments and reads BRR sample source info from DSP registers.
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
      id: `ch${i}`, name: `CH ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

function readNullTermString(buf: Uint8Array, off: number, maxLen: number): string {
  let end = off;
  const limit = Math.min(off + maxLen, buf.length);
  while (end < limit && buf[end] !== 0) end++;
  const decoder = new TextDecoder('latin1');
  return decoder.decode(buf.subarray(off, end)).trim();
}

function readAsciiInt(buf: Uint8Array, off: number, len: number): number {
  const s = readNullTermString(buf, off, len);
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

// ── ID666 Tag Parsing ─────────────────────────────────────────────────────────

interface SPCTags {
  title: string;
  game: string;
  dumper: string;
  comments: string;
  dateDumped: string;
  songLengthSec: number;
  fadeLengthMs: number;
  artist: string;
}

function parseID666(buf: Uint8Array): SPCTags {
  // Check if ID666 tag is present (byte 35 = 0x1A means yes)
  const hasTag = buf[0x23] === 0x1A;
  if (!hasTag) {
    return { title: '', game: '', dumper: '', comments: '', dateDumped: '',
             songLengthSec: 0, fadeLengthMs: 0, artist: '' };
  }

  const title        = readNullTermString(buf, 0x2E, 32);
  const game         = readNullTermString(buf, 0x4E, 16);
  const dumper       = readNullTermString(buf, 0x5E, 16);
  const comments     = readNullTermString(buf, 0x6E, 32);
  const dateDumped   = readNullTermString(buf, 0x8E, 11);
  const songLengthSec = readAsciiInt(buf, 0x99, 3);
  const fadeLengthMs  = readAsciiInt(buf, 0x9C, 5);
  const artist       = readNullTermString(buf, 0xA1, 32);

  return { title, game, dumper, comments, dateDumped, songLengthSec, fadeLengthMs, artist };
}

// ── xid6 Extended Tag Parsing ─────────────────────────────────────────────────

/** Known xid6 chunk IDs */
const XID6_TITLE  = 0x01;
const XID6_GAME   = 0x02;
const XID6_ARTIST = 0x03;
const XID6_DUMPER = 0x04;

function parseXid6(buf: Uint8Array, tags: SPCTags): SPCTags {
  const off = 0x10200;
  if (buf.length < off + 8) return tags;

  // Check "xid6" magic
  if (buf[off] !== 0x78 || buf[off + 1] !== 0x69 ||
      buf[off + 2] !== 0x64 || buf[off + 3] !== 0x36) return tags;

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const chunkDataSize = dv.getUint32(off + 4, true);
  const endOff = Math.min(off + 8 + chunkDataSize, buf.length);

  let pos = off + 8;
  while (pos + 4 <= endOff) {
    const id   = buf[pos];
    const type = buf[pos + 1];
    const data = dv.getUint16(pos + 2, true);
    pos += 4;

    if (type === 0) {
      // Data stored in the 2-byte data field itself
      continue;
    }

    // type != 0: data field is the length of a following payload
    const payloadLen = data;
    if (pos + payloadLen > endOff) break;

    if (type === 1) {
      // String payload
      const str = readNullTermString(buf, pos, payloadLen);
      if (id === XID6_TITLE  && str) tags = { ...tags, title: str };
      if (id === XID6_GAME   && str) tags = { ...tags, game: str };
      if (id === XID6_ARTIST && str) tags = { ...tags, artist: str };
      if (id === XID6_DUMPER && str) tags = { ...tags, dumper: str };
    }

    // Advance past payload, aligned to 4 bytes
    pos += (payloadLen + 3) & ~3;
  }

  return tags;
}

// ── DSP Register Reading ──────────────────────────────────────────────────────

interface VoiceInfo {
  srcn: number;       // Source number (BRR sample index)
  volL: number;       // Left volume
  volR: number;       // Right volume
  pitchL: number;     // Pitch low byte
  pitchH: number;     // Pitch high byte
  adsr1: number;      // ADSR1 register
  adsr2: number;      // ADSR2 register
  gain: number;       // GAIN register
}

function readDSPVoices(buf: Uint8Array): VoiceInfo[] {
  const dspBase = 0x10100;
  if (buf.length < dspBase + 128) return [];

  const voices: VoiceInfo[] = [];
  for (let v = 0; v < 8; v++) {
    const base = dspBase + v * 0x10;
    voices.push({
      volL:   buf[base + 0],
      volR:   buf[base + 1],
      pitchL: buf[base + 2],
      pitchH: buf[base + 3],
      srcn:   buf[base + 4],
      adsr1:  buf[base + 5],
      adsr2:  buf[base + 6],
      gain:   buf[base + 7],
    });
  }
  return voices;
}

// ── Instrument Builder ────────────────────────────────────────────────────────

function buildInstruments(_voices: VoiceInfo[]): InstrumentConfig[] {
  const insts: InstrumentConfig[] = [];
  for (let v = 0; v < 8; v++) {
    insts.push({
      id: v + 1,
      name: `Voice ${v + 1}`,
      type: 'synth',
      synthType: 'FurnaceSNES',
      furnace: { ...DEFAULT_FURNACE, chipType: 41 } as FurnaceConfig,
      effects: [],
      volume: 0,
      pan: 0,
    });
  }
  return insts;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isSPCFormat(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 256) return false;
  const b = new Uint8Array(buffer);
  // Check "SNES-SPC700" magic at start
  const magic = 'SNES-SPC700 Sound File Data';
  for (let i = 0; i < magic.length; i++) {
    if (b[i] !== magic.charCodeAt(i)) return false;
  }
  return true;
}

export function parseSPCFile(buffer: ArrayBuffer): TrackerSong {
  if (!isSPCFormat(buffer)) throw new Error('Not a valid SPC file');

  const buf = new Uint8Array(buffer);

  // Parse ID666 text tags
  let tags = parseID666(buf);

  // Check for xid6 extended tags (may override text tags)
  tags = parseXid6(buf, tags);

  // Read DSP voice registers
  const voices = readDSPVoices(buf);

  // Build 8 SNES instruments
  const instruments = buildInstruments(voices);

  // Create a single 64-row empty pattern with 8 channels
  const numCh = 8;
  const numRows = 64;
  const pattern = emptyPattern('p0', 'Pattern 1', numCh, numRows);

  // Build title from available metadata
  const title = tags.title || tags.game || 'SPC';
  const name = title
    + (tags.artist ? ` — ${tags.artist}` : '')
    + (tags.game && tags.title ? ` (${tags.game})` : '');

  return {
    name,
    format: 'SPC' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
