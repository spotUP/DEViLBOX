/**
 * AYParser.ts — ZX Spectrum AY/YM format parser (Vortex Tracker / AY-emul)
 *
 * Parses the ZXAYEMUL header for song count, author, and misc info.
 * Creates FurnaceAY instrument stubs for all 3 AY channels.
 * Full pattern extraction requires Z80 CPU emulation — not in scope.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { DEFAULT_FURNACE } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(numCh: number): Pattern {
  return {
    id: 'p0', name: 'Pattern 1', length: 16,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `AY ${String.fromCharCode(65 + i)}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: 16 }, emptyCell),
    })),
  };
}

/**
 * Read a null-terminated string via a signed big-endian offset pointer at `ptrOff`.
 * The pointer is relative to its own position in the file.
 */
function readRelStr(buf: Uint8Array, ptrOff: number): string {
  if (ptrOff + 2 > buf.length) return '';
  const dv  = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rel = dv.getInt16(ptrOff, false); // big-endian signed
  if (rel === 0) return '';
  const abs = ptrOff + rel;
  if (abs < 0 || abs >= buf.length) return '';
  let s = '', i = abs;
  while (i < buf.length && buf[i] !== 0) s += String.fromCharCode(buf[i++]);
  return s.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isAYFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  if (b.length < 8) return false;
  return String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]) === 'ZXAYEMUL';
}

export async function parseAYFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  if (!isAYFormat(buffer)) throw new Error('Not a valid AY file');
  const buf = new Uint8Array(buffer);

  // buf[8]: type (0=AY, 1=YM)
  const isYM    = buf[8] === 1;
  // buf[18]: number of songs minus 1
  const numSongs = (buf[18] ?? 0) + 1;

  // Offset 14: signed BE pointer to author string
  // Offset 16: signed BE pointer to misc string (title / comment)
  const author = readRelStr(buf, 14);
  const misc   = readRelStr(buf, 16);

  const chipLabel = isYM ? 'YM' : 'AY';
  const instruments: InstrumentConfig[] = Array.from({ length: 3 }, (_, i) => ({
    id: i + 1,
    name: `${chipLabel} ${String.fromCharCode(65 + i)}`,
    type: 'synth' as const,
    synthType: 'FurnaceAY' as const,
    furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 },
  }));

  const name = misc || filename.replace(/\.ay$/i, '');

  return {
    name: name + (author ? ` — ${author}` : ''),
    format: 'AY' as TrackerFormat,
    patterns: [emptyPattern(3)],
    instruments,
    songPositions: [0],
    songLength: numSongs > 1 ? numSongs : 1,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
