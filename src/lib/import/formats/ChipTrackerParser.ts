/**
 * ChipTrackerParser.ts — ChipTracker Amiga music format native parser
 *
 * ChipTracker is an Amiga music format created by Krister 'Kris' Wombell, 1991.
 * Files are prefixed with "KRIS." (e.g., KRIS.Drugstore).
 *
 * Detection (from DTP_Check2 in ChipTracker_v3.asm):
 *   File size must be > 1984 + 256 (2240) bytes.
 *   Magic bytes 'KRIS' (0x4B, 0x52, 0x49, 0x53) must appear at byte offset 952.
 *
 * Metadata extraction (from DTP_InitPlayer):
 *   offset 956 (u8) = song length (1–255)
 *   Max 31 sample slots, max 128 patterns.
 *
 * Single-file format: player code + music data in one binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/ChipTracker/ChipTracker_v3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size required by DTP_Check2: 1984 + 256 = 2240 bytes. */
const MIN_FILE_SIZE = 1984 + 256;

/** Byte offset of the 'KRIS' magic word, per DTP_Check2: cmp.l #'KRIS',952(A0). */
const MAGIC_OFFSET = 952;

/** Byte offset of the song length field, per InitPlayer: move.b 956(A0),D2. */
const SONG_LENGTH_OFFSET = 956;

/** ChipTracker always has exactly 31 sample slots (MI_MaxSamples = 31). */
const INSTRUMENT_COUNT = 31;

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a ChipTracker module.
 *
 * Detection mirrors DTP_Check2 from ChipTracker_v3.asm:
 *   cmp.l #1984+256, dtg_ChkSize(A5)  → file must be > 2240 bytes
 *   cmp.l #'KRIS', 952(A0)            → magic at offset 952
 */
export function isChipTrackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length <= MIN_FILE_SIZE) return false;
  return (
    buf[MAGIC_OFFSET] === 0x4b &&
    buf[MAGIC_OFFSET + 1] === 0x52 &&
    buf[MAGIC_OFFSET + 2] === 0x49 &&
    buf[MAGIC_OFFSET + 3] === 0x53
  );
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a ChipTracker module file into a TrackerSong.
 *
 * Extracts song length from the binary header and creates 31 placeholder
 * instrument slots matching the fixed ChipTracker sample table.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseChipTrackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isChipTrackerFormat(buf)) {
    throw new Error('Not a ChipTracker module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "KRIS." prefix (case-insensitive) or ".kris" extension
  const moduleName =
    baseName.replace(/^kris\./i, '').replace(/\.kris$/i, '') || baseName;

  // ── Metadata extraction ───────────────────────────────────────────────────

  // From InitPlayer: move.b 956(A0),D2  → song length byte
  const songLength = buf[SONG_LENGTH_OFFSET] || 1;

  // ── Instrument placeholders ──────────────────────────────────────────────

  // ChipTracker always has 31 sample slots (dbf D5,hop with D5=30, i.e. 31 iterations)
  const instruments: InstrumentConfig[] = Array.from(
    { length: INSTRUMENT_COUNT },
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
      originalPatternCount: 1,
      originalInstrumentCount: INSTRUMENT_COUNT,
    },
  };

  return {
    name: `${moduleName} [ChipTracker]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
