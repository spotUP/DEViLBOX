/**
 * DavidHanneyParser.ts — David Hanney Amiga music format native parser
 *
 * David Hanney composed music for Amiga games in the early 1990s. Files use
 * the "dh." prefix (e.g., "dh.tearaway"). The format uses a chunked layout
 * with a fixed 256-byte header followed by "INFO" and "BLK" chunks.
 *
 * Detection:
 *   bytes[0..7] == "DSNGSEQU" (0x44 0x53 0x4E 0x47 0x53 0x45 0x51 0x55)
 *   Minimum file size: 272 bytes (256-byte header + INFO chunk + size field)
 *
 * File structure (observed from test files and player disassembly):
 *   Offset  Size     Description
 *   ------  ----     -----------
 *   0x000   8        Magic: "DSNGSEQU"
 *   0x008   4        Version / flags (e.g. 0x00000100 = version 1.0)
 *   0x00C   4        Unknown header fields
 *   0x010   240      Reserved / zero-padded header
 *   0x100   varies   INFO chunk: 4-byte id "INFO" + 4-byte size + data
 *                      INFO data (10 bytes):
 *                        0x00 u16BE: unknown field
 *                        0x02 u16BE: unknown field
 *                        0x04 u16BE: num_channels (typically 4)
 *                        0x06 u16BE: unknown field
 *                        0x08 u16BE: unknown field
 *   0x???   varies   BLK chunks: 4-byte id "BLK\0" + 4-byte size + data
 *
 * UADE eagleplayer.conf: DavidHanney  prefixes=dh
 * Player credit: "(c) 1992 by David Hanney, adapted by Mr.Larmer/Wanted Team & DEFECT"
 *
 * Actual audio playback is delegated to UADE.
 *
 * References:
 *   third-party/uade-3.05/players/DavidHanney (player binary)
 *   third-party/uade-3.05/eagleplayer.conf (prefixes=dh)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ──────────────────────────────────────────────────────────────

/** Minimum file size for the full header + INFO chunk header. */
const MIN_FILE_SIZE = 272;

/** Offset of the first chunk area (after the fixed 256-byte header). */
const CHUNK_AREA_OFFSET = 0x100;

/** Default channel count if INFO chunk is absent or unreadable. */
const DEFAULT_CHANNELS = 4;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

function matchesId(buf: Uint8Array, off: number, id: string): boolean {
  if (off + id.length > buf.length) return false;
  for (let i = 0; i < id.length; i++) {
    if (buf[off + i] !== id.charCodeAt(i)) return false;
  }
  return true;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a David Hanney module.
 *
 * Detection: bytes[0..7] == "DSNGSEQU".
 * The 8-byte combined magic is unique to this format.
 */
export function isDavidHanneyFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  return (
    buf[0] === 0x44 && // D
    buf[1] === 0x53 && // S
    buf[2] === 0x4e && // N
    buf[3] === 0x47 && // G
    buf[4] === 0x53 && // S
    buf[5] === 0x45 && // E
    buf[6] === 0x51 && // Q
    buf[7] === 0x55    // U
  );
}

// ── Chunk reader ───────────────────────────────────────────────────────────

interface InfoChunk {
  numChannels: number;
}

/**
 * Parse the INFO chunk from the chunk area (starting at CHUNK_AREA_OFFSET).
 * Returns null if the INFO chunk is not found within the first 32 bytes
 * after the chunk area offset.
 */
function readInfoChunk(buf: Uint8Array): InfoChunk | null {
  // The INFO chunk may have a small variable-length gap before it.
  // Search up to 32 bytes into the chunk area for the "INFO" identifier.
  const searchLimit = Math.min(CHUNK_AREA_OFFSET + 32, buf.length - 8);
  for (let off = CHUNK_AREA_OFFSET; off <= searchLimit; off++) {
    if (!matchesId(buf, off, 'INFO')) continue;

    const sizeOff = off + 4;
    if (sizeOff + 4 > buf.length) break;

    const size = u32BE(buf, sizeOff);
    const dataOff = sizeOff + 4;

    if (dataOff + size > buf.length || size < 6) break;

    // Word at offset 4 in the INFO data = num_channels
    const numChannels = u16BE(buf, dataOff + 4);
    return {
      numChannels: numChannels > 0 && numChannels <= 32 ? numChannels : DEFAULT_CHANNELS,
    };
  }
  return null;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a David Hanney module file into a TrackerSong.
 *
 * Extracts channel count from the INFO chunk when available.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseDavidHanneyFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isDavidHanneyFormat(buf)) {
    throw new Error('Not a David Hanney module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^dh\./i, '') || baseName;

  // ── Metadata from INFO chunk ──────────────────────────────────────────────

  const info = readInfoChunk(buf);
  const numChannels = info?.numChannels ?? DEFAULT_CHANNELS;

  // ── Stereo panning (LRRL for 4-channel; extend symmetrically for more) ────

  const channelPans = Array.from({ length: numChannels }, (_, i) => {
    const pos = i % 4;
    return pos === 0 || pos === 3 ? -50 : 50;
  });

  // ── Stub pattern (UADE handles audio) ─────────────────────────────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
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
      pan: channelPans[ch],
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
      originalInstrumentCount: 0,
    },
  };

  const instruments: InstrumentConfig[] = [
    {
      id: 1,
      name: 'Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig,
  ];

  return {
    name: `${moduleName} [DavidHanney]`,
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
