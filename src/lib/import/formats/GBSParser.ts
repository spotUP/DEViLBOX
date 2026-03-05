/**
 * GBSParser.ts — Game Boy Sound System format parser
 *
 * Parses the 112-byte GBS header for metadata (title, author, copyright,
 * song count) and creates a 4-channel Game Boy template pattern.
 * Since GBS contains Z80 code that can't be executed without a full
 * emulator, we extract metadata and build a stub TrackerSong.
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
      id: `ch${i}`, name: GB_CHANNEL_NAMES[i] ?? `GB ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

function readFixedString(buf: Uint8Array, off: number, len: number): string {
  let text = '';
  for (let i = 0; i < len; i++) {
    const b = buf[off + i];
    if (b === 0) break;
    text += String.fromCharCode(b);
  }
  return text;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GBS_HEADER_SIZE = 112;
const GB_NUM_CHANNELS = 4;
const GB_CHANNEL_NAMES = ['Pulse 1', 'Pulse 2', 'Wave', 'Noise'];
const DEFAULT_PATTERN_ROWS = 64;

// ── Header ────────────────────────────────────────────────────────────────────

interface GBSHeader {
  version: number;
  numSongs: number;
  firstSong: number;
  loadAddr: number;
  initAddr: number;
  playAddr: number;
  stackPointer: number;
  timerModulo: number;
  timerControl: number;
  title: string;
  author: string;
  copyright: string;
}

function parseGBSHeader(buf: Uint8Array): GBSHeader {
  if (buf.length < GBS_HEADER_SIZE) throw new Error('File too small for GBS header');

  if (buf[0] !== 0x47 || buf[1] !== 0x42 || buf[2] !== 0x53) {
    throw new Error('Not a valid GBS file (bad magic)');
  }

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return {
    version:      buf[3],
    numSongs:     buf[4],
    firstSong:    buf[5],
    loadAddr:     dv.getUint16(6, true),
    initAddr:     dv.getUint16(8, true),
    playAddr:     dv.getUint16(10, true),
    stackPointer: dv.getUint16(12, true),
    timerModulo:  buf[14],
    timerControl: buf[15],
    title:        readFixedString(buf, 16, 32),
    author:       readFixedString(buf, 48, 32),
    copyright:    readFixedString(buf, 80, 32),
  };
}

// ── Instrument Builder ────────────────────────────────────────────────────────

function buildGBInstruments(): InstrumentConfig[] {
  return GB_CHANNEL_NAMES.map((name, i): InstrumentConfig => ({
    id: i + 1, name, type: 'synth', synthType: 'FurnaceGB',
    furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 } as FurnaceConfig,
    effects: [], volume: 0, pan: 0,
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isGBSFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= GBS_HEADER_SIZE && b[0] === 0x47 && b[1] === 0x42 && b[2] === 0x53;
}

export function parseGBSFile(buffer: ArrayBuffer): TrackerSong {
  const buf = new Uint8Array(buffer);
  const hdr = parseGBSHeader(buf);

  const pattern = emptyPattern('p0', 'Pattern 1', GB_NUM_CHANNELS, DEFAULT_PATTERN_ROWS);
  const instruments = buildGBInstruments();
  const name = hdr.title || 'Untitled GBS';

  return {
    name: name + (hdr.author ? ` — ${hdr.author}` : ''),
    format: 'GBS' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: GB_NUM_CHANNELS,
    initialSpeed: 1,
    initialBPM: 60,
  };
}
