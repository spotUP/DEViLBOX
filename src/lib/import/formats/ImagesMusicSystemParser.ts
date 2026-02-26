/**
 * ImagesMusicSystemParser.ts — Images Music System Amiga format native parser
 *
 * Images Music System (IMS) is an Amiga music format identified by a
 * specific structural signature based on offset arithmetic in the header.
 *
 * Detection (from UADE Images Music System_v3.asm, DTP_Check2 routine):
 *   1. File size >= 1852 bytes
 *   2. u32BE(1080) = D1: must be >= 1084 (i.e., positive and large enough)
 *   3. (D1 - 1084) % 768 == 0 — pattern data size divisible by 768 bytes/pattern
 *   4. buf[950] < 0x80 — song length byte must not have bit 7 set
 *   5. buf.length >= D1 + 4 — file must extend to pattern data
 *
 * File prefix: IMS. (e.g. IMS.SomeSong)
 *
 * Single-file format. Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/ImagesMusicSystem/src/Images Music System_v3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to contain the structural header. */
const MIN_FILE_SIZE = 1852;

/** Maximum samples supported by IMS. */
const MAX_SAMPLES = 31;

/** Maximum patterns supported by IMS. */
const MAX_PATTERNS = 64;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is an Images Music System module.
 *
 * Detection mirrors DTP_Check2 from Images Music System_v3.asm.
 */
export function isImagesMusicSystemFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  const d1 = u32BE(buf, 1080);

  // D1 must be >= 1084 for the subtraction to be non-negative
  if (d1 < 1084) return false;

  // Pattern data size must divide evenly by 768 bytes per pattern
  if ((d1 - 1084) % 768 !== 0) return false;

  // Song length byte at offset 950 must have bit 7 clear (< 0x80)
  if (buf[950] >= 0x80) return false;

  // File must extend to contain the pattern data
  if (buf.length < d1 + 4) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an Images Music System module file into a TrackerSong.
 *
 * Extracts pattern count from the binary header.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseImagesMusicSystemFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isImagesMusicSystemFormat(buf)) {
    throw new Error('Not an Images Music System module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "IMS." prefix (case-insensitive) or ".ims" extension
  const moduleName =
    baseName.replace(/^ims\./i, '').replace(/\.ims$/i, '') || baseName;

  // ── Pattern count from header ─────────────────────────────────────────────

  const d1 = u32BE(buf, 1080);
  const patternCount = Math.min((d1 - 1084) / 768, MAX_PATTERNS);

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
    name: `${moduleName} [Images Music System]${nameSuffix}`,
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
