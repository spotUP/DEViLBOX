/**
 * ThomasHermannParser.ts — Thomas Hermann Amiga music format (THM.*) native parser
 *
 * Thomas Hermann composed music for various Amiga demos and games. The format
 * stores music data as a structured binary file beginning with a table of
 * absolute Amiga memory addresses (pointers) that, when adjusted by a base
 * origin value, yield fixed offsets into the file.
 *
 * Detection (from Thomas Hermann_v2.asm, DTP_Check2 routine):
 *
 *   1. File size must be > 6848 (strictly greater, i.e. >= 6849).
 *   2. origin = u32BE(buf, 46): must be non-zero, bit 31 clear (positive),
 *      bit 0 clear (even address).
 *   3. Eight arithmetic checks using unsigned 32-bit subtraction with origin:
 *        (u32BE(buf,  0) - origin) >>> 0 === 64
 *        (u32BE(buf,  4) - origin) >>> 0 === 1088
 *        (u32BE(buf,  8) - origin) >>> 0 === 2112
 *        (u32BE(buf, 12) - origin) >>> 0 === 3136
 *        (u32BE(buf, 16) - origin) >>> 0 === 4160
 *        (u32BE(buf, 20) - origin) >>> 0 === 4416
 *        (u32BE(buf, 24) - origin) >>> 0 === 4672
 *        (u32BE(buf, 28) - origin) >>> 0 === 4928
 *
 * These fixed offset differences reflect the format's internal structure:
 * the module begins with a pointer table where each entry is an Amiga address
 * equal to (origin + fixedOffset). Subtracting origin recovers the deterministic
 * file layout regardless of where in Amiga memory the module was loaded.
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * References:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/ThomasHermann/
 *     src/Thomas Hermann_v2.asm  (DTP_Check2 routine)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

// Minimum file size: strictly > 6848 (i.e. >= 6849).
// We also need at least 50 bytes to read origin at offset 46 (u32 = offsets 46..49).
const MIN_FILE_SIZE = 6849;

// Expected unsigned differences: (pointer_at_offset - origin) >>> 0
const EXPECTED_DIFFS: ReadonlyArray<readonly [number, number]> = [
  [ 0,    64],
  [ 4,  1088],
  [ 8,  2112],
  [12,  3136],
  [16,  4160],
  [20,  4416],
  [24,  4672],
  [28,  4928],
];

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Thomas Hermann format module (THM.*).
 *
 * Mirrors the DTP_Check2 routine from Thomas Hermann_v2.asm. The module begins
 * with a table of absolute Amiga memory addresses; subtracting the base origin
 * (stored at offset 46) from each entry must yield a fixed set of offsets that
 * match the format's deterministic internal layout.
 */
export function isThomasHermannFormat(buf: Uint8Array): boolean {
  if (buf.length < MIN_FILE_SIZE) return false;

  // Read origin from offset 46 (need 50 bytes for offset 46..49)
  if (buf.length < 50) return false;
  const origin = u32BE(buf, 46);

  // origin must be non-zero
  if (origin === 0) return false;

  // origin must have bit 31 clear (positive Amiga address)
  if ((origin & 0x80000000) !== 0) return false;

  // origin must have bit 0 clear (even address)
  if ((origin & 0x00000001) !== 0) return false;

  // Verify all eight pointer-table entries against origin
  for (const [fileOff, expectedDiff] of EXPECTED_DIFFS) {
    const pointer = u32BE(buf, fileOff);
    if (((pointer - origin) >>> 0) !== expectedDiff) return false;
  }

  return true;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Thomas Hermann module file into a TrackerSong.
 *
 * Thomas Hermann modules are structured Amiga binary files where the internal
 * data sections are located via a pointer table at the file start. Beyond the
 * detection-level layout revealed by DTP_Check2, there is no further public
 * specification of the sample or pattern structures.
 *
 * This parser creates a metadata-only TrackerSong with placeholder instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export async function parseThomasHermannFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isThomasHermannFormat(buf)) {
    throw new Error('Not a Thomas Hermann module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "THM." prefix (case-insensitive)
  const moduleName = baseName.replace(/^thm\./i, '') || baseName;

  // ── Instrument placeholders ──────────────────────────────────────────────

  const NUM_PLACEHOLDER_INSTRUMENTS = 8;
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < NUM_PLACEHOLDER_INSTRUMENTS; i++) {
    instruments.push({
      id: i + 1,
      name: `Sample ${i + 1}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
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
      originalInstrumentCount: NUM_PLACEHOLDER_INSTRUMENTS,
    },
  };

  return {
    name: `${moduleName} [Thomas Hermann]`,
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
