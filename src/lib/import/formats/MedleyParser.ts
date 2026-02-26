/**
 * MedleyParser.ts — Medley Amiga music format (.ml) native parser
 *
 * Medley is an Amiga music tracker that produces single-file modules
 * supporting multiple subsongs and standard 4-channel Paula playback.
 *
 * Detection (from UADE Check2 routine in Medley.s):
 *   bytes[0..3]  = "MSOB"  (0x4D, 0x53, 0x4F, 0x42)
 *   bytes[4..7]  = u32BE offset to end-of-song-header / song data start
 *   At (offset - 2): u16BE = number of subsongs (must be > 0)
 * The "MSOB" magic is unique and sufficient for reliable detection.
 *
 * Single-file format: all player code and music data in one .ml file.
 * This parser extracts basic metadata; UADE handles actual audio playback.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/medley/Medley.s
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Medley format module.
 *
 * Checks for the "MSOB" magic bytes at the start of the file.
 * Detection logic mirrors UADE's Check2 routine in Medley.s.
 */
export function isMedleyFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 8) return false;

  // bytes[0..3] == "MSOB" (0x4D, 0x53, 0x4F, 0x42)
  return (
    buf[0] === 0x4D &&
    buf[1] === 0x53 &&
    buf[2] === 0x4F &&
    buf[3] === 0x42
  );
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Medley module file into a TrackerSong.
 *
 * Medley uses a proprietary binary format with an "MSOB" header followed
 * by an offset pointing to the song header. The word immediately before
 * that offset position contains the subsong count.
 * This parser creates a metadata-only TrackerSong with no instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseMedleyFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isMedleyFormat(buf)) {
    throw new Error('Not a Medley module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip ".ml" extension
  const moduleName = baseName.replace(/\.ml$/i, '') || baseName;

  // ── Subsong count extraction ──────────────────────────────────────────────

  // bytes[4..7] = u32BE offset to end-of-song-header / song data start
  // At (offset - 2) from file start: u16BE = number of subsongs
  let subsongCount = 1;
  if (buf.length >= 8) {
    const dataOffset = u32BE(buf, 4);
    const subsongWordOffset = dataOffset - 2;
    if (subsongWordOffset >= 0 && subsongWordOffset + 2 <= buf.length) {
      const raw = u16BE(buf, subsongWordOffset);
      if (raw > 0) {
        // Clamp to a reasonable range
        subsongCount = Math.min(Math.max(raw, 1), 64);
      }
    }
  }

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

  const instruments: InstrumentConfig[] = [];

  return {
    name: `${moduleName} [Medley]${subsongCount > 1 ? ` (${subsongCount} subsongs)` : ''}`,
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
