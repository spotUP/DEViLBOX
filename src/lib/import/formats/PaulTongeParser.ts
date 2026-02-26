/**
 * PaulTongeParser.ts — Paul Tonge format detection and stub parser
 *
 * Detection (from "Paul Tonge_v1.asm", DTP_Check2):
 *
 *   move.l  A0,A1               → save base pointer
 *   cmp.w   #$000C,(A0)+        → word[0] must be $000C (12)
 *   bne.b   fail
 *   moveq   #2,D2               → loop 3 times (D2 = 2 downto 0)
 * next:
 *   move.w  (A0)+,D1            → read next word
 *   bmi.b   fail                → fail if negative
 *   beq.b   skip                → if zero, skip (allowed)
 *   btst    #0,D1               → fail if odd
 *   bne.b   fail
 *   move.w  (A1,D1.W),D1       → indirect: read word at base + D1
 *   ble.b   fail                → fail if <= 0
 *   cmp.b   #$80,-1(A1,D1.W)   → byte at base + D1 - 1 must be $80 or $8F
 *   beq.b   skip
 *   cmp.b   #$8F,-1(A1,D1.W)
 *   bne.b   fail
 * skip:
 *   dbf     D2,next
 *
 * Layout: word[0] = $000C = 12, then 3 offset words follow.
 * Each offset (if non-zero) must be:
 *   - positive, even
 *   - points to a word in the file that is > 0
 *   - byte at (offset - 1) must be $80 or $8F
 *
 * Minimum file size: 2 (header word) + 3×2 (offsets) = 8 bytes.
 * Practically at least one offset must be non-zero and valid, requiring
 * enough bytes for the pointed-to data. We use 8 as the absolute minimum.
 *
 * Prefix: 'PAT.'
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 8;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function s16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

/**
 * Detect Paul Tonge format.
 *
 * Mirrors Check2 in "Paul Tonge_v1.asm".
 */
export function isPaulTongeFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  let off = 0;

  // word[0] must be $000C = 12
  if (u16BE(buf, off) !== 0x000C) return false;
  off += 2;

  // Loop 3 times
  let foundOne = false;
  for (let i = 0; i < 3; i++) {
    if (off + 2 > buf.length) return false;
    const d1raw = u16BE(buf, off); off += 2;

    // bmi → fail if negative (sign bit set in 16-bit)
    if (d1raw & 0x8000) return false;

    // zero is allowed (skip)
    if (d1raw === 0) continue;

    // btst #0 → fail if odd
    if (d1raw & 1) return false;

    // indirect: read word at base + d1
    const indOff = d1raw;
    if (indOff + 2 > buf.length) return false;
    const indWord = s16BE(buf, indOff);

    // ble → fail if <= 0
    if (indWord <= 0) return false;

    // byte at base + d1 - 1 must be $80 or $8F
    const byteOff = d1raw - 1;
    if (byteOff >= buf.length) return false;
    const b = buf[byteOff];
    if (b !== 0x80 && b !== 0x8F) return false;

    foundOne = true;
  }

  // At least one non-zero, valid offset must have been found
  return foundOne;
}

export function parsePaulTongeFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isPaulTongeFormat(buf)) throw new Error('Not a Paul Tonge module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^pat\./i, '') || baseName;

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
    name: `${moduleName} [Paul Tonge]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
