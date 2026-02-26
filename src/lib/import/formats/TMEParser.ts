/**
 * TMEParser.ts — TME (The Musical Enlightenment) Amiga music format native parser
 *
 * TME is an Amiga music tracker format. Modules are single-file binaries.
 *
 * Detection (from UADE TME_v3.s, DTP_Check2 routine):
 *   1. buf[0] == 0 (first byte must be zero)
 *   2. fileSize >= 7000
 *   3. u32BE(0) != 0 (the full 4-byte long at offset 0 must be non-zero,
 *      which implies bytes[1..3] are not all zero since byte[0] == 0)
 *   4a. u32BE(0x3C) == 0x0000050F AND u32BE(0x40) == 0x0000050F  (primary check)
 *      OR
 *   4b. u32BE(0x1284) == 0x00040B11 AND u32BE(0x1188) == 0x181E2329 AND
 *       u32BE(0x128C) == 0x2F363C41  (alternative check, requires >= 0x1290 bytes)
 *
 * File extension: .tme  (prefix "TME.")
 *
 * Single-file format: compiled 68k executable.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/TME/src/TME_v3.s
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size required by DTP_Check2 (cmp.l #7000, D1; blt Fault). */
const MIN_FILE_SIZE = 7000;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a TME module.
 *
 * Detection mirrors DTP_Check2 from TME_v3.s.
 */
export function isTMEFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (buf.length < MIN_FILE_SIZE) return false;

  // buf[0] must be 0
  if (buf[0] !== 0) return false;

  // u32BE(0) must be non-zero (bytes[1..3] provide the non-zero portion)
  if (u32BE(buf, 0) === 0) return false;

  // Primary check: two specific longwords at offsets 0x3C and 0x40
  if (buf.length >= 0x44) {
    if (u32BE(buf, 0x3c) === 0x0000050f && u32BE(buf, 0x40) === 0x0000050f) {
      return true;
    }
  }

  // Alternative check: three specific longwords at higher offsets
  if (buf.length >= 0x1290) {
    if (
      u32BE(buf, 0x1284) === 0x00040b11 &&
      u32BE(buf, 0x1188) === 0x181e2329 &&
      u32BE(buf, 0x128c) === 0x2f363c41
    ) {
      return true;
    }
  }

  return false;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a TME module file into a TrackerSong.
 *
 * TME modules are compiled 68k executables. This parser creates a
 * metadata-only TrackerSong. Actual audio playback is delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseTMEFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isTMEFormat(buf)) {
    throw new Error('Not a TME module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip ".tme" extension or "TME." prefix (case-insensitive)
  const moduleName =
    baseName.replace(/^tme\./i, '').replace(/\.tme$/i, '') || baseName;

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
    name: `${moduleName} [TME]`,
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
