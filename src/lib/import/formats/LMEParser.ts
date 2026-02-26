/**
 * LMEParser.ts — Leggless Music Editor (LME) Amiga format native parser
 *
 * LME is an Amiga tracker created by Leggless. Files are typically named
 * with a "LME." prefix (e.g. LME.songname) or a ".lme" extension.
 *
 * Detection (from UADE LMEv3.asm Check2 routine):
 *   bytes[0..2]  = "LME" (0x4C, 0x4D, 0x45)
 *   bytes[3]     = any (format version byte, typically 1, 2, or 3)
 *   u32BE at offset 36 (bytes[36..39]) must be 0
 *
 *   In the 68k Check2 code: D1 is loaded with the first 4 bytes, then
 *   clr.b D1 clears the lowest byte (index 3), then compared against
 *   #'LME'<<8 = 0x4C4D4500. The separate tst.l 9*4(A0) checks offset 36.
 *
 * Single-file format: all player and music data in one file.
 * 4 channels (standard Amiga Paula).
 * This parser extracts basic metadata; UADE handles actual audio playback.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/LME/src/LMEv3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Leggless Music Editor (LME) format module.
 *
 * Checks:
 *   1. bytes[0..2] == "LME" (0x4C, 0x4D, 0x45)
 *   2. u32BE at offset 36 == 0
 *
 * Detection logic mirrors UADE's LMEv3.asm Check2 routine.
 * bytes[3] (format version) is intentionally not checked.
 */
export function isLMEFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 40) return false;

  return (
    buf[0] === 0x4C && // 'L'
    buf[1] === 0x4D && // 'M'
    buf[2] === 0x45 && // 'E'
    u32BE(buf, 36) === 0
  );
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Leggless Music Editor (LME) module file into a TrackerSong.
 *
 * The internal format structure beyond the header is not publicly documented;
 * this parser creates a metadata-only TrackerSong with an empty 4-channel
 * pattern. Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseLMEFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isLMEFormat(buf)) {
    throw new Error('Not a Leggless Music Editor (LME) module');
  }

  // ── Format version from bytes[3] ──────────────────────────────────────

  const _version = buf[3]; // available if needed for diagnostics

  // ── Module name from filename ─────────────────────────────────────────

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  // Strip "LME." prefix (case-insensitive) or ".lme" extension
  const moduleName =
    baseName.replace(/^lme\./i, '').replace(/\.lme$/i, '') || baseName;

  // ── Instrument placeholders ───────────────────────────────────────────

  // No instruments — UADE handles all playback; emit an empty list.
  const instruments: InstrumentConfig[] = [];

  // ── Empty pattern (placeholder — UADE handles actual audio) ──────────

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
      pan: (ch === 0 || ch === 3) ? -50 : 50,
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
    name: `${moduleName} [LME]`,
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
