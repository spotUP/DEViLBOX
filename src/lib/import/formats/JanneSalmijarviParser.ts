/**
 * JanneSalmijarviParser.ts — Janne Salmijarvi Optimizer format detection and stub parser
 *
 * Detection (from "Janne Salmijarvi Optimizer.asm", DTP_Check2):
 *
 *   move.l  dtg_ChkSize(A5),D1
 *   cmp.l   #1084+1024+4,D1   ; file must be > 2112 bytes
 *   ble.b   Fault
 *
 *   cmp.l   #'JS92',1080(A0)  ; 4-byte magic at offset 1080 must be 'JS92'
 *   bne.b   Fault
 *
 * The format is a ProTracker MOD variant (1080-byte header) with a
 * 4-byte Janne Salmijarvi marker at offset 1080. File size must be
 * strictly greater than 1084+1024+4 = 2112 bytes (ble = branch if ≤).
 *
 * Prefix: 'JS.'
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 1084 + 1024 + 4 + 1; // 2113 bytes (strictly greater than 2112)
const MAGIC_OFFSET = 1080;
const MAGIC_JS92 = (0x4A << 24 | 0x53 << 16 | 0x39 << 8 | 0x32) >>> 0; // 'JS92'

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Detect Janne Salmijarvi Optimizer format.
 *
 * Mirrors Check2 in "Janne Salmijarvi Optimizer.asm":
 *   - File size must be > 2112 bytes
 *   - Bytes at offset 1080..1083 must be 'JS92'
 */
export function isJanneSalmijarviFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  return u32BE(buf, MAGIC_OFFSET) === MAGIC_JS92;
}

export function parseJanneSalmijarviFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isJanneSalmijarviFormat(buf)) throw new Error('Not a Janne Salmijarvi Optimizer module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^js\./i, '') || baseName;

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
    name: `${moduleName} [Janne Salmijarvi]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
