/**
 * PaulShieldsParser.ts — Paul Shields music format detector/parser
 *
 * Detects modules composed with the Paul Shields / Paul Hunter music system
 * (c) 1988–91. Common prefix: ps.*
 *
 * Detection logic ported from:
 *   uade-3.05/amigasrc/players/wanted_team/PaulShields/src/Paul Shields.AMP.asm
 *   → EP_Check5 routine (identical algorithm in DTP_Check2 of _v3.asm)
 *
 * The format has three recognized sub-variants (stored in internal Format byte):
 *
 *   New format (Format=1):
 *     - bytes 0..9 are all zero (tst.l (A0), tst.l 4(A0), tst.w 8(A0))
 *     - words at offsets 164, 168, 172, 176 are all equal (song-pointer table)
 *     - word at offset 160 is non-zero, non-negative, and even (sample-block pointer)
 *     - dereference: buf[160..161] as u16 added to base A0 → check u32 == 0x00B400B6
 *
 *   Old format (Format=0xFF i.e. -1, stored as byte via `st`):
 *     - same zero-prefix check at the top (implicit, falls from New check)
 *     - words at offsets 516, 520, 524, 528 are all equal
 *     - word at offset 512 is non-zero, non-negative, and even
 *     - dereference: buf[512..513] as u16 → base+u16 → check u32 == 0x02140216
 *
 *   Very-old format (Format=0):
 *     - Same zero-prefix (implied since the "Last" branch is reached after Old fails)
 *     - words at offsets 514, 518, 522, 526 are all equal
 *     - word at offset 516 is non-zero, non-negative, and even
 *     - dereference: buf[516..517] as u16 → A1+u16 → check word at -2 == 0xFFEC (loop)
 *       or 0xFFE8 (stop)
 *
 * Song name suffix: [Paul Shields]
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// The detection code checks offsets up to 528+2 bytes from file start.
const MIN_FILE_SIZE = 530;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

function safeU16(buf: Uint8Array, off: number): number {
  if (off < 0 || off + 1 >= buf.length) return 1; // non-zero sentinel — causes fails
  return u16BE(buf, off);
}

function safeU32(buf: Uint8Array, off: number): number {
  if (off < 0 || off + 3 >= buf.length) return 0;
  return u32BE(buf, off);
}

export function isPaulShieldsFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // All three sub-variants require the file to start with 10 zero bytes.
  // tst.l (A0)  → bytes 0..3 == 0
  // tst.l 4(A0) → bytes 4..7 == 0
  // tst.w 8(A0) → bytes 8..9 == 0
  if (safeU32(buf, 0) !== 0) return false;
  if (safeU32(buf, 4) !== 0) return false;
  if (safeU16(buf, 8) !== 0) return false;

  // ── New format (Format byte = 1) ─────────────────────────────────────────
  // move.w 164(A0), D1
  // cmp.w 168(A0), D1; cmp.w 172(A0), D1; cmp.w 176(A0), D1 — all must equal
  const d1_new = safeU16(buf, 164);
  if (
    d1_new === safeU16(buf, 168) &&
    d1_new === safeU16(buf, 172) &&
    d1_new === safeU16(buf, 176)
  ) {
    // move.w 160(A0), D1: must be non-zero, non-negative, and even
    const ptr_new = safeU16(buf, 160);
    if (ptr_new !== 0 && (ptr_new & 0x8000) === 0 && (ptr_new & 1) === 0) {
      // add.w D1, A1 → A1 = base + ptr_new; cmp.l #$00B400B6, (A1)
      const target = safeU32(buf, ptr_new);
      if (target === 0x00B400B6) return true;
    }
    // If the pointer checks failed, fall through to Old format check.
  }

  // ── Old format (Format byte = 0xFF) ──────────────────────────────────────
  // move.w 516(A0), D1
  // cmp.w 520(A0), D1; cmp.w 524(A0), D1; cmp.w 528(A0), D1 — all must equal
  const d1_old = safeU16(buf, 516);
  if (
    d1_old === safeU16(buf, 520) &&
    d1_old === safeU16(buf, 524) &&
    d1_old === safeU16(buf, 528)
  ) {
    // move.w 512(A0), D1: must be non-zero, non-negative, and even
    const ptr_old = safeU16(buf, 512);
    if (ptr_old !== 0 && (ptr_old & 0x8000) === 0 && (ptr_old & 1) === 0) {
      // add.w D1, A1 → A1 = base + ptr_old; cmp.l #$02140216, (A1)
      const target = safeU32(buf, ptr_old);
      if (target === 0x02140216) return true;
    }
    // Fall through to very-old format if this check fails.
  }

  // ── Very-old format (Format byte = 0) ────────────────────────────────────
  // move.w 514(A0), D1
  // cmp.w 518(A0), D1; cmp.w 522(A0), D1; cmp.w 526(A0), D1 — all must equal
  const d1_vold = safeU16(buf, 514);
  if (
    d1_vold === safeU16(buf, 518) &&
    d1_vold === safeU16(buf, 522) &&
    d1_vold === safeU16(buf, 526)
  ) {
    // move.w 516(A0), D1: must be non-zero, non-negative, and even
    const ptr_vold = safeU16(buf, 516);
    if (ptr_vold !== 0 && (ptr_vold & 0x8000) === 0 && (ptr_vold & 1) === 0) {
      // add.w D1, A1 → A1 = base + ptr_vold
      // cmp.w #$FFEC, -2(A1) → check word at (ptr_vold - 2) == 0xFFEC (loop)
      // cmp.w #$FFE8, -2(A1) → or 0xFFE8 (stop)
      const wordBefore = safeU16(buf, ptr_vold - 2);
      if (wordBefore === 0xFFEC || wordBefore === 0xFFE8) return true;
    }
  }

  return false;
}

export function parsePaulShieldsFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isPaulShieldsFormat(buf)) throw new Error('Not a Paul Shields module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^ps\./i, '') || baseName;

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
    name: `${moduleName} [Paul Shields]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
  };
}
