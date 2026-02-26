/**
 * TCBTrackerParser.ts — TCB Tracker Amiga music format (also known as "AN COOL!") native parser
 *
 * TCB Tracker was an Amiga music editor/player whose modules are identified by
 * the ASCII header "AN COOL!" (format 1) or "AN COOL." (format 2) at the start
 * of the file. Files are distributed with the UADE prefix "tcb.".
 *
 * Detection (from UADE "TCB Tracker_V2.asm", DTP_Check2 routine):
 *   1. File must be >= 0x132 bytes.
 *   2. u32BE(0) must be "AN C" (0x414E2043).
 *   3. u32BE(4) must be "OOL!" (0x4F4F4C21) → format 1 (pattBase = 0x110), or
 *                            "OOL." (0x4F4F4C2E) → format 2 (pattBase = 0x132).
 *   4. nbPatt = u32BE(8) must be <= 127.
 *   5. byte[12] (speed field) must be <= 15.
 *   6. byte[13] must be 0.
 *   7. byte[0x8E] (sequence length, treated as signed) must be positive (1..127).
 *   8. Compute A3 = pattBase + nbPatt * 0x200 + 0xD4; file must extend past A3.
 *   9. u32BE(A3 - 8) must be 0xFFFFFFFF.
 *  10. u32BE(A3 - 4) must be 0x00000000.
 *  11. u32BE(A3 - 0x90) must be 0x000000D4  (first sample always at +$D4).
 *
 * UADE eagleplayer.conf: TCB_Tracker  prefixes=tcb
 * MI_MaxSamples = 16 (from InfoBuffer in TCB Tracker_V2.asm)
 *
 * Single-file format. UADE handles actual audio playback. This parser extracts
 * metadata only.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/TCB Tracker/src/TCB Tracker_V2.asm
 * Reference parsers: JeroenTelParser.ts, JasonPageParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum file size enforced by the Check2 routine. */
const MIN_FILE_SIZE = 0x132;

/**
 * Maximum number of samples as declared in InfoBuffer:
 *   dc.l  MI_MaxSamples, 16
 */
const MAX_SAMPLES = 16;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the full DTP_Check2 detection algorithm for
 * the TCB Tracker "AN COOL!" / "AN COOL." format.
 *
 * When `filename` is supplied the basename is also checked for the expected
 * UADE prefix (`tcb.`). The prefix check alone is not sufficient; the binary
 * scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isTCBTrackerFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('tcb.')) return false;
  }

  // ── Minimum size ─────────────────────────────────────────────────────────
  if (buf.length < MIN_FILE_SIZE) return false;

  // ── "AN C" at offset 0 ───────────────────────────────────────────────────
  if (u32BE(buf, 0) !== 0x414e2043) return false;

  // ── "OOL!" or "OOL." at offset 4 ─────────────────────────────────────────
  const sig4 = u32BE(buf, 4);
  let fmt: 1 | 2;
  if (sig4 === 0x4f4f4c21) {
    fmt = 1; // "OOL!" → format 1; pattern base = 0x110
  } else if (sig4 === 0x4f4f4c2e) {
    fmt = 2; // "OOL." → format 2; pattern base = 0x132
  } else {
    return false;
  }

  // ── nbPatt = u32BE(8) must be <= 127 ─────────────────────────────────────
  const nbPatt = u32BE(buf, 8);
  if (nbPatt > 127) return false;

  // ── byte[12] (speed) must be <= 15 ───────────────────────────────────────
  if (buf[12] > 15) return false;

  // ── byte[13] must be 0 ───────────────────────────────────────────────────
  if (buf[13] !== 0) return false;

  // ── byte[0x8E] (seq length, signed) must be positive: 1..127 ─────────────
  // The assembly does ble.s Fault — so the value must be > 0 as a signed byte.
  // Values 0x80..0xFF would be negative as signed byte → fail.
  const seqLen = buf[0x8e];
  if (seqLen === 0 || seqLen > 127) return false;

  // ── Compute A3 and validate structural sentinel values ────────────────────
  const pattBase = fmt === 1 ? 0x110 : 0x132;
  const a1 = pattBase + nbPatt * 0x200;
  const a3 = a1 + 0xd4;

  // File must extend past A3
  if (a3 >= buf.length) return false;

  // Verify we have enough bytes for all sentinel reads
  if (a3 - 0x90 < 0) return false;
  if (a3 - 0x90 + 3 >= buf.length) return false;

  // u32BE(A3 - 8) must be 0xFFFFFFFF
  if (u32BE(buf, a3 - 8) !== 0xffffffff) return false;

  // u32BE(A3 - 4) must be 0x00000000
  if (u32BE(buf, a3 - 4) !== 0x00000000) return false;

  // u32BE(A3 - 0x90) must be 0x000000D4  (first sample always at +$D4)
  if (u32BE(buf, a3 - 0x90) !== 0x000000d4) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a TCB Tracker module file into a TrackerSong.
 *
 * TCB Tracker modules contain a fixed-layout header, pattern data, and sample
 * data in a single file. This parser creates a metadata-only TrackerSong with
 * 16 placeholder instruments (MI_MaxSamples from the assembly InfoBuffer).
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseTCBTrackerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isTCBTrackerFormat(buffer, filename)) {
    throw new Error('Not a TCB Tracker module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "tcb." prefix (case-insensitive)
  const moduleName = baseName.replace(/^tcb\./i, '') || baseName;

  // ── Pattern count from header ─────────────────────────────────────────────

  const nbPatt = u32BE(buf, 8);

  // ── Instrument placeholders ───────────────────────────────────────────────
  //
  // MI_MaxSamples = 16 (declared in InfoBuffer in the assembly).
  // The exact count in a given module would require walking the sample table;
  // we use the documented maximum as placeholders so the TrackerSong can
  // represent any module in this format family.

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < MAX_SAMPLES; i++) {
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

  // ── Empty pattern (placeholder — UADE handles actual audio) ───────────────

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
      originalPatternCount: nbPatt,
      originalInstrumentCount: MAX_SAMPLES,
    },
  };

  return {
    name: `${moduleName} [TCB Tracker] (${nbPatt} patt)`,
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
