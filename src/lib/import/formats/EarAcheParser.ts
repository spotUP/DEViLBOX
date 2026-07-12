/**
 * EarAcheParser — parser for EarAche format (.ea)
 *
 * eagleplayer.conf: EarAche  prefixes=ea  Magic: "EASO"
 * Stub — UADE classic handles audio.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';
import type { Pattern, InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeEarAcheCell } from '@/engine/uade/encoders/EarAcheEncoder';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Locate the score command-stream region. The EASO header is a 6-entry u32 section
 * offset table (relative to byte 4, i.e. post-magic); section[0] is the score, the
 * remaining five are instrument / envelope / sample tables. The score spans
 * [section[0], nextLowestSection). Returns [start, end) or [0, 0] if malformed.
 */
function findScoreRegion(buf: Uint8Array): [number, number] {
  if (buf.length < 28) return [0, 0];
  const offs: number[] = [];
  for (let i = 0; i < 6; i++) offs.push(4 + u32BE(buf, 4 + i * 4));
  const start = offs[0];
  if (start < 28 || start >= buf.length) return [0, 0];
  let end = buf.length;
  for (let i = 1; i < offs.length; i++) {
    if (offs[i] > start && offs[i] < end) end = offs[i];
  }
  if (end <= start || end > buf.length) return [0, 0];
  return [start, end];
}

/** Carrier decode: stash the exact source byte in the invisible `period` field. */
function decodeEACell(raw: Uint8Array): TrackerCell {
  const b = raw[0] ?? 0;
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, period: b };
}

export function isEarAcheFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 4) return false;
  return data[0] === 0x45 && data[1] === 0x41 && data[2] === 0x53 && data[3] === 0x4F;
}

export function parseEarAcheFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  const name = filename.replace(/\.[^.]+$/, '').replace(/^[^.]+\./, '');

  const [scoreStart, scoreEnd] = findScoreRegion(buf);
  const hasScore = scoreEnd > scoreStart;
  const scoreLen = hasScore ? scoreEnd - scoreStart : 64;

  // Display grid: one 'Score' channel over the opcode-stream bytes. Built WITHOUT the
  // `period` carrier so edited rows fall back to canonical (rest) on write-back.
  const pattern: Pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: scoreLen,
    channels: [{
      id: 'channel-0',
      name: 'Score',
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: scoreLen }, () => emptyCell()),
    }],
  };
  const instruments: InstrumentConfig[] = Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    name: `EarAche ${i + 1}`,
    type: 'sample' as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig));

  // Byte-exact codec: point the layout at the real located score command-stream and
  // carry each source byte verbatim (1 byte/cell, single channel).
  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'earAche',
    patternDataFileOffset: hasScore ? scoreStart : 0,
    bytesPerCell: 1,
    rowsPerPattern: scoreLen,
    numChannels: 1,
    numPatterns: 1,
    moduleSize: buffer.byteLength,
    encodeCell: encodeEarAcheCell,
    decodeCell: decodeEACell,
  };

  return {
    name,
    format: 'MOD' as any,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 1,
    initialSpeed: 6,
    initialBPM: 125,
    uadePatternLayout,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
