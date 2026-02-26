/**
 * ADPCMmonoParser.ts — ADPCM Mono format detection and stub parser
 *
 * Detection (from ADPCM_mono.asm, EP_Check3):
 *
 * This format uses EP_Check3 which is a filename-based check (not magic bytes).
 * The check works backwards through the filename:
 *   1. Skip ADPCM2 / ADPCM3 files: if first 4 bytes of data == 'ADPC', fail
 *   2. Walk to end of filename string (null terminator)
 *   3. Step back through last 6 characters, checking case-insensitively:
 *      ...(end) m/M c/C p/P d/D a/A . (literal dot before "adpcm")
 *      i.e. filename ends with ".adpcm" (case-insensitive)
 *
 * For content-based detection we use the prefix string declared:
 *   Prefix dc.b '.ADPCM',0
 * and exclude files whose first 4 bytes are 'ADPC' (ADPCM2/ADPCM3).
 *
 * Minimum file size: the player uses a 1024-byte buffer, so files must be
 * at least 1024 bytes (the buffer size declared in the player source).
 * We use 4 bytes minimum for the magic-exclusion check; extension check handles
 * the rest at the call-site (filename must end with .adpcm).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 4;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/** 'ADPC' as a 32-bit big-endian value */
const MAGIC_ADPC = (0x41 << 24 | 0x44 << 16 | 0x50 << 8 | 0x43) >>> 0;

/**
 * Detect ADPCM Mono format.
 *
 * Mirrors Check3 in ADPCM_mono.asm:
 *   - Rejects if first 4 bytes == 'ADPC' (ADPCM2/ADPCM3 files)
 *   - Accepts if filename ends with '.adpcm' (case-insensitive)
 *
 * The filename parameter is required for proper detection; without it
 * this function returns false (format is purely extension-based).
 */
export function isADPCMmonoFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Exclude ADPCM2 / ADPCM3 files
  if (u32BE(buf, 0) === MAGIC_ADPC) return false;

  // Extension check: filename must end with '.adpcm' (case-insensitive)
  if (!filename) return false;
  return /\.adpcm$/i.test(filename);
}

export function parseADPCMmonoFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isADPCMmonoFormat(buf, filename)) throw new Error('Not an ADPCM Mono module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^adpcm\./i, '') || baseName;

  const instruments: InstrumentConfig[] = [{
    id: 1, name: 'Sample 1', type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig];

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [ADPCM Mono]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
