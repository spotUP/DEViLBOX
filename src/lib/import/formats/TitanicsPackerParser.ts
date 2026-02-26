/**
 * TitanicsPackerParser.ts — Titanics Packer Amiga music format
 *
 * UADE prefix: TITS.*
 *
 * Detection based on Titanics Packer_v1.asm:
 * - File size >= 437 bytes (180 header + 256 word table + at least 1 byte)
 * - 128-word table at offset 180: each word must be non-zero and even,
 *   or 0xFFFF (end-of-list marker) which causes early success.
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 437;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

export function isTitanicsPackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Scan 128 words at offset 180 (180 + 128*2 = 436 bytes required, file must be > 436)
  for (let i = 0; i < 128; i++) {
    const off = 180 + i * 2;
    const word = u16BE(buf, off);

    if (word === 0) return false;
    if (word === 0xFFFF) return true; // end-of-list marker: success
    if ((word & 1) !== 0) return false; // odd word (and not 0xFFFF): fail
    // even non-zero word: continue scan
  }

  // All 128 words were valid even non-zero values with no 0xFFFF found
  return true;
}

export function parseTitanicsPackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isTitanicsPackerFormat(buf)) throw new Error('Not a Titanics Packer module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^TITS\./i, '') || baseName;

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
    name: `${moduleName} [Titanics Packer]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
