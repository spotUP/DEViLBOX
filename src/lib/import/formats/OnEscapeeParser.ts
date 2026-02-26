/**
 * OnEscapeeParser.ts — onEscapee format detection and stub parser
 *
 * Detection (from "onEscapee.asm", EP_Check3):
 *
 * The check reads 24 consecutive longwords (moveq #23,D1 → dbf counts 0..23 = 24 iterations).
 * Two valid patterns exist:
 *
 * Pattern A ($AA55FF00 repeated):
 *   For i in 0..23: long[i] must == $AA55FF00
 *   → success
 *
 * Pattern B ($55AA00FF repeated, for mzeperx song):
 *   If pattern A fails at position 0 (first long != $AA55FF00),
 *   then at the SAME starting position we check if long == $55AA00FF.
 *   For i in 0..23: long[i] must == $55AA00FF
 *   → success
 *
 * Note: the assembly has two separate loops that are NOT mutually exclusive
 * in a straightforward way — if the first long != $AA55FF00, it tries $55AA00FF
 * starting from (A0 + 4) because A0 was already incremented once in NextLong
 * before branching to Next. So:
 *   - NextLong: reads A0+0, A0+4, ..., A0+92 for 24 longs of $AA55FF00
 *   - Next:     reads A0+4, A0+8, ..., A0+96 for 24 longs of $55AA00FF
 *     (the first A0+4 came from the failed NextLong iteration incrementing A0)
 *
 * For simplicity and correctness, we detect both:
 *   - 24 consecutive $AA55FF00 starting at offset 0
 *   - 24 consecutive $55AA00FF starting at offset 4
 *
 * Minimum file size: 24 * 4 + 4 = 100 bytes (for the $55AA00FF variant starting at 4).
 *
 * Prefix: 'ONE.'
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 100;
const LONG_COUNT = 24;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

const MAGIC_A = 0xAA55FF00 >>> 0;
const MAGIC_B = 0x55AA00FF >>> 0;

/**
 * Detect onEscapee format.
 *
 * Mirrors Check3 in "onEscapee.asm":
 *   24 repeated $AA55FF00 starting at offset 0, OR
 *   24 repeated $55AA00FF starting at offset 4.
 */
export function isOnEscapeeFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Pattern A: 24 × $AA55FF00 at offset 0
  if (buf.length >= LONG_COUNT * 4) {
    let match = true;
    for (let i = 0; i < LONG_COUNT; i++) {
      if (u32BE(buf, i * 4) !== MAGIC_A) { match = false; break; }
    }
    if (match) return true;
  }

  // Pattern B: 24 × $55AA00FF at offset 4
  const startB = 4;
  if (buf.length >= startB + LONG_COUNT * 4) {
    let match = true;
    for (let i = 0; i < LONG_COUNT; i++) {
      if (u32BE(buf, startB + i * 4) !== MAGIC_B) { match = false; break; }
    }
    if (match) return true;
  }

  return false;
}

export function parseOnEscapeeFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isOnEscapeeFormat(buf)) throw new Error('Not an onEscapee module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^one\./i, '') || baseName;

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
    name: `${moduleName} [onEscapee]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
