/**
 * FredGrayParser.ts — Fred Gray format detection and stub parser
 *
 * Detection (from eagleplayer.conf: FredGray  prefixes=gray):
 *   Magic: "FREDGRAY" (8 bytes) at byte offset 0x24 (36 decimal).
 *   Files are prefixed: gray.songname
 *
 * Minimum file size: 0x24 + 8 = 44 bytes.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MAGIC_OFFSET = 0x24; // 36
const MAGIC = 'FREDGRAY';
const MIN_FILE_SIZE = MAGIC_OFFSET + MAGIC.length; // 44

/**
 * Detect Fred Gray format.
 * Primary check: 8 bytes at offset 0x24 == "FREDGRAY".
 * Secondary check: prefix gray.* for files without the magic.
 */
export function isFredGrayFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (buf.length >= MIN_FILE_SIZE) {
    let match = true;
    for (let i = 0; i < MAGIC.length; i++) {
      if (buf[MAGIC_OFFSET + i] !== MAGIC.charCodeAt(i)) { match = false; break; }
    }
    if (match) return true;
  }

  // Prefix fallback
  if (!filename) return false;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
  return base.startsWith('gray.');
}

export function parseFredGrayFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isFredGrayFormat(buf, filename)) throw new Error('Not a Fred Gray module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^gray\./i, '') || baseName;

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
    name: `${moduleName} [Fred Gray]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
