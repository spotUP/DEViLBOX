/**
 * SeanConranParser.ts — Sean Conran Amiga music format (SCR.*) native parser
 *
 * Sean Conran composed music for various Amiga games and demos. The format is a
 * compiled 68k executable where player code and music data are combined into a
 * single self-contained file.
 *
 * Detection (from Sean Conran_v3.asm, DTP_Check2 routine):
 *
 *   Three possible paths, all ending with a common scan loop.
 *
 *   Path A (fast path 1): u32BE(0) == 0x0FFF0FE2
 *     u32BE(4) == 0x0FC40FA7  (A0 post-incremented to 8)
 *     u32BE(8) == 0x0F8B0F6E  (A0 stays at 8)
 *     → scan start = 8 + 284 = 292
 *
 *   Path B (fast path 2): u32BE(0) == 0x10000FE2
 *     Same secondary checks as Path A (offsets 4 and 8)
 *     → scan start = 8 + 284 = 292
 *
 *   Path C (standard path):
 *     u32BE(0) == 0x0F1C0F0E AND u32BE(4) == 0x0F000EF2 AND u32BE(8) == 0x0EE40ED6
 *     A0 advanced to 8 by post-increment reads, then lea 160(A0) → A0 = 168
 *     → scan start = 168 + 284 = 452
 *
 *   Final scan (common to all paths): Starting at the calculated scan offset,
 *   check 128 consecutive 2-byte positions:
 *     u32BE(pos) != 0x7F7F7F7F  AND  u16BE(pos) != 0xFFFF
 *     Advance pos by 2 each iteration.
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * References:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/SeanConran/
 *     src/Sean Conran_v3.asm  (DTP_Check2 routine)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

// Minimum file size: for paths A/B we need scan start 292 + 128*2 = 548.
// For path C we need 452 + 128*2 = 708. Use 548 as the general minimum.
const MIN_FILE_SIZE = 548;

// Secondary check values common to paths A and B
const PATH_AB_CHECK4  = 0x0FC40FA7;
const PATH_AB_CHECK8  = 0x0F8B0F6E;

// Scan parameters
const SCAN_STEP       = 2;
const SCAN_ITERATIONS = 128;
const SCAN_ADDEND     = 284; // lea 284(A0), from the assembly source

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Sean Conran format module (SCR.*).
 *
 * Mirrors the DTP_Check2 routine from Sean Conran_v3.asm. Three entry paths
 * (A, B, C) determine a scan start offset; the common scan loop at that offset
 * then verifies 128 consecutive 2-byte positions are neither 0x7F7F7F7F nor
 * 0xFFFF.
 */
export function isSeanConranFormat(buf: Uint8Array): boolean {
  if (buf.length < MIN_FILE_SIZE) return false;

  const first = u32BE(buf, 0);

  let scanStart: number;

  if (first === 0x0FFF0FE2 || first === 0x10000FE2) {
    // Path A or Path B — verify secondary longwords at offsets 4 and 8
    if (u32BE(buf, 4) !== PATH_AB_CHECK4) return false;
    if (u32BE(buf, 8) !== PATH_AB_CHECK8) return false;
    scanStart = 8 + SCAN_ADDEND; // 292
  } else if (
    first === 0x0F1C0F0E &&
    u32BE(buf, 4) === 0x0F000EF2 &&
    u32BE(buf, 8) === 0x0EE40ED6
  ) {
    // Path C — lea 160(A0) after reading three longwords (A0 ends at 8)
    // A0 = 8 + 160 = 168
    scanStart = 168 + SCAN_ADDEND; // 452
  } else {
    return false;
  }

  // Final scan: 128 iterations of 2-byte steps starting at scanStart.
  // Each position must have u32BE != 0x7F7F7F7F AND u16BE != 0xFFFF.
  const scanEnd = scanStart + SCAN_ITERATIONS * SCAN_STEP;
  if (buf.length < scanEnd) return false;

  for (let pos = scanStart; pos < scanEnd; pos += SCAN_STEP) {
    if (u32BE(buf, pos) === 0x7F7F7F7F) return false;
    if (u16BE(buf, pos) === 0xFFFF)     return false;
  }

  return true;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Sean Conran module file into a TrackerSong.
 *
 * Sean Conran modules are compiled 68k Amiga executables combining the player
 * code with music and sample data. There is no public specification of the
 * internal binary layout beyond what the DTP_Check2 detection code reveals.
 *
 * This parser creates a metadata-only TrackerSong with placeholder instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export async function parseSeanConranFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isSeanConranFormat(buf)) {
    throw new Error('Not a Sean Conran module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "SCR." prefix (case-insensitive)
  const moduleName = baseName.replace(/^scr\./i, '') || baseName;

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
    name: `${moduleName} [Sean Conran]`,
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
