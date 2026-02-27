/**
 * TomyTrackerParser.ts — Tomy Tracker Amiga music format native parser
 *
 * Tomy Tracker is an Amiga music format identified by a specific
 * size-based structural signature at the start of the file.
 *
 * Detection (from UADE Tomy Tracker_v2.asm, DTP_Check2 routine):
 *   1. File size >= 1728 bytes (704 + 1024)
 *   2. u32BE(0) = D1: must be >= 1, <= 0x200000, and even (bit 0 clear)
 *   3. u32BE(4) = D2: must equal D1 and be even
 *   4. (D2 - 704) % 1024 == 0 — pattern data must divide evenly by 1024
 *
 * File prefix: SG. (e.g. SG.SomeSong)
 *
 * Single-file format. Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/TomyTracker/src/Tomy Tracker_v2.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size (704 base + 1024 pattern). */
const MIN_FILE_SIZE = 1728;

/** Maximum samples supported by Tomy Tracker. */
const MAX_SAMPLES = 30;

/** Maximum value for the D1/D2 size field (2 MB). */
const MAX_SIZE_FIELD = 0x200000;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Tomy Tracker module.
 *
 * Detection mirrors DTP_Check2 from Tomy Tracker_v2.asm.
 */
export function isTomyTrackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  const d1 = u32BE(buf, 0);
  const d2 = u32BE(buf, 4);

  // D1: must be >= 1, <= MAX_SIZE_FIELD, and even (bit 0 clear)
  if (d1 < 1 || d1 > MAX_SIZE_FIELD) return false;
  if (d1 & 1) return false;

  // D2 must not exceed D1 (bhi check) and must be even
  // ASM uses "bhi fault" (branch if higher unsigned), so D2 <= D1 is valid
  if (d2 > d1) return false;
  if (d2 & 1) return false;

  // Pattern data size must be >= 0 and divisible by 1024
  if (d2 < 704) return false;
  if ((d2 - 704) % 1024 !== 0) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Tomy Tracker module file into a TrackerSong.
 *
 * Extracts pattern count from the binary header.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseTomyTrackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isTomyTrackerFormat(buf)) {
    throw new Error('Not a Tomy Tracker module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "SG." prefix (case-insensitive)
  const moduleName = baseName.replace(/^sg\./i, '') || baseName;

  // ── Pattern count from header ─────────────────────────────────────────────

  const d2 = u32BE(buf, 4);
  const patternCount = (d2 - 704) / 1024;

  // ── Instrument placeholders ──────────────────────────────────────────────

  const instruments: InstrumentConfig[] = Array.from(
    { length: MAX_SAMPLES },
    (_, i) =>
      ({
        id: i + 1,
        name: `Sample ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      }) as InstrumentConfig,
  );

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
      originalPatternCount: patternCount || 1,
      originalInstrumentCount: 0,
    },
  };

  const nameSuffix = patternCount > 0 ? ` (${patternCount} patt)` : '';

  return {
    name: `${moduleName} [TomyTracker]${nameSuffix}`,
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
