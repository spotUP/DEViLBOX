/**
 * KrisHatlelidParser.ts — Kris Hatlelid Amiga music format
 *
 * UADE prefix: KH.*
 *
 * Detection based on Kris Hatlelid_v1.asm (line 51):
 * - Multiple fixed-offset big-endian word/longword checks
 * - Supports single-file and two-file variants distinguished at offset 44
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 68;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

export function isKrisHatlelidFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Fixed-offset longword checks
  if (u32BE(buf, 0) !== 0x000003F3) return false;
  if (u32BE(buf, 4) !== 0x00000000) return false;
  if (u32BE(buf, 8) !== 0x00000003) return false;
  if (u32BE(buf, 12) !== 0x00000000) return false;
  if (u32BE(buf, 16) !== 0x00000002) return false;

  // Read D1, clear bit 30 (bclr #30,D1)
  const d1 = u32BE(buf, 20) & ~0x40000000;

  // Single byte check at offset 24
  if (buf[24] !== 0x40) return false;

  if (u32BE(buf, 28) !== 0x00000001) return false;
  if (u32BE(buf, 32) !== 0x000003E9) return false;

  // D1 cross-check at offset 36
  if (u32BE(buf, 36) !== d1) return false;

  if (u32BE(buf, 40) !== 0x60000016) return false;

  // Two-file variant check at offset 44
  if (u32BE(buf, 44) === 0x0000ABCD) {
    // Two-file variant: check offset 60
    return u32BE(buf, 60) === 0xB07C0000;
  } else {
    // Single-file variant: check offsets 60 and 64
    return u32BE(buf, 60) === 0x41F90000 && u32BE(buf, 64) === 0x00004E75;
  }
}

export function parseKrisHatlelidFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isKrisHatlelidFormat(buf)) throw new Error('Not a Kris Hatlelid module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^KH\./i, '') || baseName;

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
    name: `${moduleName} [Kris Hatlelid]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments,
    songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
