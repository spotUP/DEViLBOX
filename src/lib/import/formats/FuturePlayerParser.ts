/**
 * FuturePlayerParser.ts — Future Player Amiga format (.fp / FP.*) native parser
 *
 * Future Player is an Amiga 4-channel music player from the Wanted Team.
 * Files are typically named with a "FP." prefix (e.g. FP.songname) or a
 * ".fp" extension.
 *
 * Detection (from UADE Future Player_v1.asm Check3 routine):
 *   bytes[0..3]  = 0x000003F3
 *   byte[20]     != 0 (must be non-zero)
 *   bytes[32..35] = "F.PL" (0x46, 0x2E, 0x50, 0x4C)
 *   bytes[36..39] = "AYER" (0x41, 0x59, 0x45, 0x52)
 *
 * Together bytes[32..39] spell "F.PLAYER" embedded in the module.
 *
 * Single-file format: all player and music data in one file.
 * 4 channels (standard Amiga Paula).
 * This parser extracts basic metadata; UADE handles actual audio playback.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/FuturePlayer/Future Player_v1.asm
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
 * Return true if the buffer is a Future Player format module.
 *
 * Checks:
 *   1. bytes[0..3] == 0x000003F3
 *   2. byte[20] != 0
 *   3. bytes[32..35] == "F.PL" (0x462E504C)
 *   4. bytes[36..39] == "AYER" (0x41594552)
 *
 * Detection logic mirrors UADE's Future Player_v1.asm Check3 routine.
 */
export function isFuturePlayerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 40) return false;

  return (
    u32BE(buf, 0)  === 0x000003F3 &&
    buf[20]        !== 0          &&
    u32BE(buf, 32) === 0x462E504C && // "F.PL"
    u32BE(buf, 36) === 0x41594552    // "AYER"
  );
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Future Player module file into a TrackerSong.
 *
 * The internal format structure beyond the header is not publicly documented;
 * this parser creates a metadata-only TrackerSong with an empty 4-channel
 * pattern. Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseFuturePlayerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isFuturePlayerFormat(buf)) {
    throw new Error('Not a Future Player module');
  }

  // ── Module name from filename ─────────────────────────────────────────

  const baseName = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
  // Strip "FP." prefix (case-insensitive) or ".fp" extension
  const moduleName =
    baseName.replace(/^fp\./i, '').replace(/\.fp$/i, '') || baseName;

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
    name: `${moduleName} [Future Player]`,
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
