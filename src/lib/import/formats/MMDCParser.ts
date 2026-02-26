/**
 * MMDCParser.ts — MMDC (MED Packer) Amiga music format native parser
 *
 * MMDC is an Amiga music packer format created by Antony "Ratt" Crowther.
 * It is also known as "MED Packer" and uses a 4-char magic identifier.
 *
 * Detection (from UADE MMDC_v3.asm, DTP_Check2 routine):
 *   1. bytes[0..3] == 'MMDC' (0x4D4D4443)
 *   2. u16BE(16) == 0 (reserved word must be zero)
 *   3. u16BE(18) != 0, positive (signed), even (bit 0 == 0)
 *   4. u16BE(u16BE(18)) == 0 (word at the offset stored in bytes[18..19] must be zero)
 *
 * Metadata extraction (from InitPlayer):
 *   Pattern count: u16BE(556) in the module data
 *
 * Single-file format: packer wraps music data in a MMDC container.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/MMDC/src/MMDC_v3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to hold the MMDC header (at least 20 bytes). */
const MIN_FILE_SIZE = 20;

/** Maximum patterns to report. */
const MAX_PATTERNS = 128;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is an MMDC (MED Packer) module.
 *
 * Detection mirrors DTP_Check2 from MMDC_v3.asm.
 */
export function isMMDCFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // bytes[0..3] == 'MMDC' (0x4D4D4443)
  if (
    buf[0] !== 0x4d ||
    buf[1] !== 0x4d ||
    buf[2] !== 0x44 ||
    buf[3] !== 0x43
  )
    return false;

  // u16BE(16) == 0
  if (u16BE(buf, 16) !== 0) return false;

  // u16BE(18): non-zero, positive (bit 15 clear), even (bit 0 clear)
  const offset = u16BE(buf, 18);
  if (offset === 0) return false;
  if (offset & 0x8000) return false; // sign bit set → negative
  if (offset & 0x0001) return false; // odd

  // word at that offset must be zero
  if (offset + 1 >= buf.length) return false;
  if (u16BE(buf, offset) !== 0) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an MMDC module file into a TrackerSong.
 *
 * Extracts pattern count from the binary header.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseMMDCFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isMMDCFormat(buf)) {
    throw new Error('Not an MMDC module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "MMDC." prefix (case-insensitive) or ".mmdc" extension
  const moduleName =
    baseName.replace(/^mmdc\./i, '').replace(/\.mmdc$/i, '') || baseName;

  // ── Pattern count from offset 556 ────────────────────────────────────────

  let patternCount = 0;
  if (buf.length >= 558) {
    const raw = u16BE(buf, 556);
    patternCount = Math.min(raw, MAX_PATTERNS);
  }

  // ── Instrument placeholders (MMDC supports up to 64 samples) ─────────────

  const instruments: InstrumentConfig[] = Array.from(
    { length: 1 },
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
    name: `${moduleName} [MMDC]${nameSuffix}`,
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
