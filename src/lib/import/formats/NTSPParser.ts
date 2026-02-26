/**
 * NTSPParser.ts — NTSP-system Amiga format detector
 *
 * NTSP-system is an Amiga music format whose files use the prefix "TWO."
 * (eagleplayer.conf: NTSP-system prefixes=two). Detection is performed by
 * reading the 4-byte magic word at offset 0.
 *
 * Detection (from NTSP-system.asm line 45):
 *   bytes[0..3] = 0x53504E54 ('SPNT' in little-endian storage, 'SPNT' big-endian)
 *   bytes[4..7] != 0          (non-zero secondary check word)
 *
 * File prefix: TWO.*
 *
 * Playback is delegated to UADE (NTSP-system eagleplayer).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 8;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isNTSPFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  if (u32BE(buf, 0) !== 0x53504E54) return false;
  if (u32BE(buf, 4) === 0) return false;
  return true;
}

export function parseNTSPFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isNTSPFormat(buf)) throw new Error('Not a NTSP-system module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^two\./i, '') || baseName;

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
      id: `channel-${ch}`, name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1, originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [NTSP System]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
