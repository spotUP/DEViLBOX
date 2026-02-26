/**
 * TimeTrackerParser.ts — TimeTracker Amiga music format native parser
 *
 * TimeTracker is an Amiga music format created by BrainWasher & FireBlade (1993).
 * Files use a "TMK." prefix naming convention (e.g. TMK.Tourists).
 *
 * Detection (from DTP_Check2 in TimeTracker_v1.asm):
 *   Read first longword at offset 0 into D1.
 *   Test the low byte (offset 3) — must be non-zero.
 *   Clear the low byte, then compare with 0x544D4B00 ('TMK\0').
 *   In other words: buf[0]=='T', buf[1]=='M', buf[2]=='K', buf[3] != 0.
 *
 * Metadata extraction (from DTP_InitPlayer):
 *   offset 3 (u8)       = subsong count  (move.b 3(A0),D0 → SubSongs)
 *   offset 5 (u8) & 127 = sample count   (and.b 5(A0),D3 with D3=127 → Samples)
 *   File must be >= 10 bytes minimum.
 *
 * Single-file format: player code + music data in one binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/TimeTracker/src/TimeTracker_v1.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to hold the magic bytes and basic header fields. */
const MIN_FILE_SIZE = 10;

/** Maximum sample count (7-bit field, per and.b mask of 127). */
const MAX_SAMPLES = 127;

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a TimeTracker module.
 *
 * Detection mirrors DTP_Check2 from TimeTracker_v1.asm:
 *   move.l (A0),D1       → read first longword
 *   tst.b D1             → low byte (offset 3) must be non-zero
 *   beq.b Fault
 *   clr.b D1             → clear the low byte
 *   cmp.l #$544D4B00,D1  → compare with 'TMK\0'
 *   bne.b Fault
 */
export function isTimeTrackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return false;
  return buf[0] === 0x54 && buf[1] === 0x4d && buf[2] === 0x4b && buf[3] !== 0x00;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a TimeTracker module file into a TrackerSong.
 *
 * Extracts subsong and sample counts from the binary header.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseTimeTrackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isTimeTrackerFormat(buf)) {
    throw new Error('Not a TimeTracker module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "TMK." prefix (case-insensitive) or ".tmk" extension
  const moduleName =
    baseName.replace(/^tmk\./i, '').replace(/\.tmk$/i, '') || baseName;

  // ── Metadata extraction ───────────────────────────────────────────────────

  // From InitPlayer:
  //   move.b 3(A0),D0  → D0 = subsong count
  //   and.b  5(A0),D3  → D3 = buf[5] & 127  (sample count, D3 pre-loaded with #127)
  let subsongCount = 1;
  let sampleCount = 0;

  if (buf.length >= MIN_FILE_SIZE) {
    const rawSubsongs = buf[3]; // always non-zero per detection check
    subsongCount = rawSubsongs;

    const rawSamples = buf[5] & 0x7f;
    if (rawSamples > 0) sampleCount = Math.min(rawSamples, MAX_SAMPLES);
  }

  // ── Instrument placeholders ──────────────────────────────────────────────

  const instrumentCount = sampleCount || 1;

  const instruments: InstrumentConfig[] = Array.from(
    { length: instrumentCount },
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
      // Amiga hard-left/hard-right panning: ch 0 & 3 = -50, ch 1 & 2 = +50
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
      originalInstrumentCount: sampleCount,
    },
  };

  // ── Song name ─────────────────────────────────────────────────────────────

  const songName =
    subsongCount > 1
      ? `${moduleName} [TimeTracker](${subsongCount} subsongs)`
      : `${moduleName} [TimeTracker]`;

  return {
    name: songName,
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
