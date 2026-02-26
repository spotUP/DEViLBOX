/**
 * SynthPackParser.ts — SynthPack format detection and stub parser
 *
 * Detection (from eagleplayer.conf: SynthPack  prefixes=osp):
 *   Magic: "OBISYNTHPACK" (12 bytes) at offset 0.
 *   Files are prefixed: osp.songname
 *
 * Minimum file size: 12 bytes (magic string length).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MAGIC = 'OBISYNTHPACK';
const MIN_FILE_SIZE = MAGIC.length;

/**
 * Detect SynthPack format.
 * Primary check: first 12 bytes == "OBISYNTHPACK".
 * Secondary check: prefix osp.* (case-insensitive) for files without the magic.
 */
export function isSynthPackFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Magic check
  let match = true;
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC.charCodeAt(i)) { match = false; break; }
  }
  if (match) return true;

  // Prefix fallback
  if (!filename) return false;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
  return base.startsWith('osp.');
}

export function parseSynthPackFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSynthPackFormat(buf, filename)) throw new Error('Not a SynthPack module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^osp\./i, '') || baseName;

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
    name: `${moduleName} [SynthPack]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
