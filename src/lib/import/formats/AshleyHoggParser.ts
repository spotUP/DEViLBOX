/**
 * AshleyHoggParser.ts — Ashley Hogg format detection and stub parser
 *
 * Detection (from Ashley Hogg_v1.asm, DTP_Check2):
 *
 * Two sub-formats are detected:
 *
 * New format (Format = $FF):
 *   Checks words at offsets 0,2,4,6,8,10,12,14 (4 pairs):
 *     each pair: word == $6000, next word > 0, even, non-negative
 *   Then checks 2 more pairs the same way, then jumps forward by that last word value,
 *   then checks for $48E7FFFE (movem.l push), $6100 (bsr), and $4DF9/$00DFF000 (lea $DFF000).
 *
 * Old format (Format = 0):
 *   At current position (after backing up 2): $303C0000 followed by $662233C0
 *
 * The assembly loop (loop1) checks 4 pairs of words:
 *   for i in 0..3: word[2i] == $6000, word[2i+1] > 0, even, non-negative
 * Then tries new-format checks; on failure, falls to OldCheck.
 *
 * Minimum file size: the new-format check reads at least 10+2+4+1 = ~20 bytes before
 * the MOVEM check; old format just needs 8 bytes for the two longs.
 * Using 20 bytes as a conservative minimum.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

const MIN_FILE_SIZE = 20;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Detect Ashley Hogg format.
 *
 * Mirrors Check2 in Ashley Hogg_v1.asm:
 *
 * loop1: 4 iterations checking word pairs at A0:
 *   cmp.w #$6000,(A0)+  → fail if not $6000
 *   move.w (A0)+,D2     → fail if zero, negative, or odd
 *
 * Then tries new-format path (one more pair + $48E7FFFE + bsr + lea $DFF000),
 * or falls back to old-format ($303C0000 / $662233C0).
 */
export function isAshleyHoggFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  let off = 0;

  // loop1: 4 pairs must each be ($6000, positive-even-nonzero word)
  for (let i = 0; i < 4; i++) {
    if (off + 4 > buf.length) return false;
    if (u16BE(buf, off) !== 0x6000) return false;
    off += 2;
    const d2 = u16BE(buf, off);
    off += 2;
    if (d2 === 0) return false;
    if (d2 & 0x8000) return false; // bmi → negative (sign bit set in 16-bit)
    if (d2 & 1) return false;      // btst #0 → odd
  }

  // Try new format: one more pair
  if (off + 4 <= buf.length) {
    const w0 = u16BE(buf, off);
    if (w0 === 0x6000) {
      const d2a = u16BE(buf, off + 2);
      if (d2a !== 0 && !(d2a & 0x8000) && !(d2a & 1)) {
        const off2 = off + 4;
        if (off2 + 4 <= buf.length) {
          const w1 = u16BE(buf, off2);
          if (w1 === 0x6000) {
            const d2b = u16BE(buf, off2 + 2);
            if (d2b !== 0 && !(d2b & 0x8000) && !(d2b & 1)) {
              // advance by d2b to reach code
              const codeOff = off2 + 4 + d2b;
              if (codeOff + 10 <= buf.length) {
                if (u32BE(buf, codeOff) === 0x48E7FFFE &&
                    u16BE(buf, codeOff + 4) === 0x6100) {
                  // bsr offset, then check for lea $DFF000
                  const bsrOff = u16BE(buf, codeOff + 6);
                  const leaOff = codeOff + 6 + bsrOff;
                  if (leaOff + 6 <= buf.length &&
                      u16BE(buf, leaOff) === 0x4DF9 &&
                      u32BE(buf, leaOff + 2) === 0x00DFF000) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // OldCheck: backup 2 bytes from current off, check $303C0000 / $662233C0
  const oldOff = off - 2;
  if (oldOff + 8 <= buf.length) {
    if (u32BE(buf, oldOff) === 0x303C0000 &&
        u32BE(buf, oldOff + 4) === 0x662233C0) {
      return true;
    }
  }

  return false;
}

export function parseAshleyHoggFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isAshleyHoggFormat(buf)) throw new Error('Not an Ashley Hogg module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^ash\./i, '') || baseName;

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
    name: `${moduleName} [Ashley Hogg]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
