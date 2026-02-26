/**
 * FashionTrackerParser.ts — Fashion Tracker Amiga music format native parser
 *
 * Fashion Tracker is an Amiga music format by Richard van der Veen (1988),
 * adapted by Wanted Team. Files are named with an "EX." prefix.
 *
 * Detection (from UADE FashionTracker.asm, DTP_Check2 routine):
 *   1. u32BE(0)  == 0x13FC0040  (MOVE.B #$40,abs.l — volume init)
 *   2. u32BE(8)  == 0x4E710439  (NOP; TRAP #9)
 *   3. u16BE(12) == 0x0001      (word constant == 1)
 *   4. u32BE(18) == 0x66F44E75  (BNE -12; RTS)
 *   5. u32BE(22) == 0x48E7FFFE  (MOVEM.L d0-d7/a0-a6,-(sp))
 *
 * These are specific 68k instruction sequences at fixed byte offsets in the
 * compiled executable, unique to this format.
 *
 * File prefix: "EX."  (e.g. "EX.songname")
 *
 * Single-file format: compiled 68k executable.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/FashionTracker-v1.0/FashionTracker.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size: needs bytes through offset 25 (22 + 4 bytes = 26). */
const MIN_FILE_SIZE = 26;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Fashion Tracker module.
 *
 * Detection mirrors DTP_Check2 from FashionTracker.asm:
 *   cmp.l #$13FC0040, (A0)    ; buf[0..3]
 *   cmp.l #$4E710439, 8(A0)   ; buf[8..11]
 *   cmp.w #1, 12(A0)          ; buf[12..13]
 *   cmp.l #$66F44E75, 18(A0)  ; buf[18..21]
 *   cmp.l #$48E7FFFE, 22(A0)  ; buf[22..25]
 */
export function isFashionTrackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  if (u32BE(buf, 0) !== 0x13fc0040) return false;
  if (u32BE(buf, 8) !== 0x4e710439) return false;
  if (u16BE(buf, 12) !== 0x0001) return false;
  if (u32BE(buf, 18) !== 0x66f44e75) return false;
  if (u32BE(buf, 22) !== 0x48e7fffe) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Fashion Tracker module file into a TrackerSong.
 *
 * Fashion Tracker modules are compiled 68k executables. This parser creates a
 * metadata-only TrackerSong. Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseFashionTrackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isFashionTrackerFormat(buf)) {
    throw new Error('Not a Fashion Tracker module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "EX." prefix (case-insensitive) or .ex extension
  const moduleName = baseName.replace(/^ex\./i, '').replace(/\.ex$/i, '') || baseName;

  // ── Instrument placeholder ────────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [
    {
      id: 1,
      name: 'Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig,
  ];

  // ── Empty pattern (placeholder — UADE handles actual audio) ──────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [Fashion Tracker]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
