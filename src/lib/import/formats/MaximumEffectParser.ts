/**
 * MaximumEffectParser.ts — Maximum Effect format detection and stub parser
 *
 * Detection (from "Maximum Effect_v1.asm", DTP_Check2):
 *
 *   movea.l dtg_ChkData(A5),A0
 *   move.l  A0,A1
 *   move.l  (A1)+,D1    → D1 = long[0]; A1 points to offset 4
 *   beq.b   error       → fail if D1 == 0
 *   moveq   #15,D2
 *   cmp.l   D1,D2       → D2(15) >= D1? → bhi = branch if D2 > D1
 *   bhi.b   error       → fail if long[0] > 15 (i.e. D1 must be <= 15, > 0)
 *   move.l  dtg_ChkSize(A5),D3
 *   move.l  (A1)+,D1    → D1 = long[4]; A1 points to offset 8
 *   beq.b   Zero1       → allow zero
 *   bmi.b   error       → fail if negative
 *   btst    #0,D1       → fail if odd
 *   bne.b   error
 *   cmp.l   D3,D1       → fail if D1 > file size
 *   bgt.b   error
 *   subq.l  #2,D1       → D1 -= 2
 *   beq.b   error       → fail if D1 was exactly 2 (length - 2 == 0)
 *   divu.w  #18,D1      → divide by 18
 *   swap    D1
 *   tst.w   D1          → fail if remainder != 0 (must be divisible by 18)
 *   bne.b   error
 *
 * Zero1: (D1 == 0 is OK here)
 *   Loop 3 times (D2 = 2 down to 0):
 *     D0 = long[A1]
 *     fail if negative
 *     if D0 == 0 → skip (allowed)
 *     fail if odd
 *     fail if D0 > file size
 *     fail if long at (A0 + D0 - 6) != 0  ← tst.l -6(A0,D0.L) — checks that the
 *       6 bytes before end-of-data are zero (sanity check)
 *     set D1 = 1 (at least one non-zero pointer found)
 *   After loop: fail if D1 == 0 (no valid pointer found)
 *
 * Constraints on long[0]: 1..15 (number of sub-songs)
 * long[4]: 0, or even, positive, <= fileSize, (val-2) divisible by 18
 * Minimum file size: 8 bytes for the two longs checked initially,
 * but realistically the loop reads longs at offsets 8, 12, 16 → need 20 bytes.
 *
 * Prefix: 'MAX.'
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 20;

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Detect Maximum Effect format.
 *
 * Mirrors Check2 in "Maximum Effect_v1.asm".
 */
export function isMaximumEffectFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  const fileSize = buf.length;
  const d1_0 = u32BE(buf, 0);

  // long[0] must be 1..15 (sub-song count)
  if (d1_0 === 0) return false;
  if (d1_0 > 15) return false;

  // long[4]: pattern list pointer
  const d1_4 = u32BE(buf, 4);
  if (d1_4 !== 0) {
    if (d1_4 & 0x80000000) return false; // negative
    if (d1_4 & 1) return false;          // odd
    if (d1_4 > fileSize) return false;
    const adjusted = d1_4 - 2;
    if (adjusted === 0) return false;
    // must be divisible by 18
    if (adjusted % 18 !== 0) return false;
  }

  // Loop over longs at offsets 8, 12, 16
  let foundOne = false;
  for (let i = 0; i < 3; i++) {
    const off = 8 + i * 4;
    if (off + 4 > buf.length) return false;
    const d0 = u32BE(buf, off);
    if (d0 & 0x80000000) return false; // negative
    if (d0 === 0) continue;            // zero is allowed
    if (d0 & 1) return false;          // odd
    if (d0 > fileSize) return false;
    // tst.l -6(A0,D0.L): check that long at (buf[0 + D0 - 6]) == 0
    const testOff = d0 - 6;
    if (testOff + 4 > buf.length) return false;
    if (u32BE(buf, testOff) !== 0) return false;
    foundOne = true;
  }

  return foundOne;
}

export function parseMaximumEffectFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isMaximumEffectFormat(buf)) throw new Error('Not a Maximum Effect module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^max\./i, '') || baseName;

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
    name: `${moduleName} [Maximum Effect]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
