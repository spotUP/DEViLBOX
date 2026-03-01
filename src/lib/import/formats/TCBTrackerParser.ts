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
 * Binary layout for sample extraction (from OpenMPT Load_tcb.cpp):
 *
 *   File header (144 bytes = struct TCBFileHeader):
 *     +0    magic[8]        "AN COOL!" or "AN COOL."
 *     +8    numPatterns     uint32BE
 *     +12   tempo           uint8 (0-15)
 *     +13   unused1         uint8 (0)
 *     +14   order[128]      pattern order table
 *     +142  numOrders       uint8
 *     +143  unused2         uint8 (0)
 *
 *   After header:
 *     Format 2 only: amigaFreqs uint16BE (then instrNames)
 *     instrNames: 16 × 8 chars (128 bytes)
 *     Format 2 only: specialValues 16 × int16BE = 32 bytes
 *
 *   Patterns: numPatterns × 512 bytes
 *   → sampleStart = pattBase + numPatterns × 0x200
 *     (pattBase = 0x110 for fmt1, 0x132 for fmt2)
 *
 *   Sample block at sampleStart:
 *     +0    sizeOfRemaining uint32BE (skip)
 *     +4    sampleHeaders1  16 × 4 bytes:
 *             [0] volume   uint8 (0-127)
 *             [1] skip     uint8
 *             [2..3] rawLoopEnd uint16BE  (distance-from-end: 0 = no loop)
 *     +68   sampleHeaders2  16 × 8 bytes:
 *             [0..3] offset  uint32BE (from sampleStart)
 *             [4..7] length  uint32BE (in samples)
 *     +196  (sentinel area, unused by parser)
 *     +0xD4 first sample PCM data (8-bit unsigned; convert to signed via XOR 0x80)
 *
 * UADE eagleplayer.conf: TCB_Tracker  prefixes=tcb
 * MI_MaxSamples = 16 (from InfoBuffer in TCB Tracker_V2.asm)
 *
 * Reference: OpenMPT soundlib/Load_tcb.cpp
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/TCB Tracker/src/TCB Tracker_V2.asm
 * Reference parsers: JeroenTelParser.ts, JasonPageParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, UADEChipRamInfo } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum file size enforced by the Check2 routine. */
const MIN_FILE_SIZE = 0x132;

/** Number of sample slots (MI_MaxSamples from the assembly InfoBuffer). */
const NUM_SAMPLES = 16;

/** Amiga standard sample rate (PAL C-3 = period 214). */
const AMIGA_SAMPLE_RATE = 8363;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u8(buf: Uint8Array, off: number): number {
  return buf[off];
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

function readStr(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
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
 * Parse a TCB Tracker module file into a TrackerSong with Sampler instruments.
 *
 * TCB Tracker modules contain a fixed-layout header, pattern data, and up to
 * 16 PCM sample slots in a single file. Non-empty samples are returned as
 * Sampler instruments with audioBuffer set (8-bit signed Amiga PCM, 8363 Hz).
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name; must have tcb. prefix)
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
  const moduleName = baseName.replace(/^tcb\./i, '') || baseName;

  // ── Header fields ─────────────────────────────────────────────────────────

  const isNewFmt = buf[7] === 0x2e; // '.' → format 2; '!' → format 1
  const numPatterns = u32BE(buf, 8);
  const tempo = u8(buf, 12);
  const numOrders = u8(buf, 142);

  // ── Locate instrument name table ──────────────────────────────────────────
  // TCBFileHeader is 144 bytes.
  // Format 2 ("AN COOL."): amigaFreqs (2 bytes) precedes instrNames.
  // Format 1 ("AN COOL!"): instrNames start immediately after header.

  const instrNamesOff = isNewFmt ? 146 : 144; // 144 or 144+2

  const instrNames: string[] = [];
  for (let i = 0; i < NUM_SAMPLES; i++) {
    instrNames.push(readStr(buf, instrNamesOff + i * 8, 8));
  }

  // ── Locate pattern base and sample block ─────────────────────────────────
  // pattBase = total bytes before first pattern row (matches UADE assembly):
  //   Format 1: 0x110 = 272 (header + instrNames)
  //   Format 2: 0x132 = 306 (header + amigaFreqs + instrNames + specialValues)
  // sampleStart = pattBase + numPatterns × 512

  const pattBase = isNewFmt ? 0x132 : 0x110;
  const sampleStart = pattBase + numPatterns * 0x200;

  // ── Read sample headers ───────────────────────────────────────────────────
  // At sampleStart:
  //   +0   uint32 sizeOfRemaining (skip)
  //   +4   sampleHeaders1: 16 × [volume(u8), skip(u8), rawLoopEnd(u16BE)]
  //   +68  sampleHeaders2: 16 × [offset(u32BE from sampleStart), length(u32BE)]

  const h1Start = sampleStart + 4;
  const h2Start = h1Start + NUM_SAMPLES * 4;   // = sampleStart + 68

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const h1 = h1Start + i * 4;
    const h2 = h2Start + i * 8;

    const volume     = Math.min(u8(buf, h1), 127);          // clamped per OpenMPT
    const rawLoopEnd = u16BE(buf, h1 + 2);                  // distance from end (0 = no loop)
    const offset     = u32BE(buf, h2);                       // from sampleStart
    const length     = u32BE(buf, h2 + 4);                  // in samples

    if (length === 0 || length > 0x200000) continue;        // empty or pathological

    const pcmStart = sampleStart + offset;
    const pcmEnd   = pcmStart + length;
    if (pcmEnd > buf.length) continue;                       // truncated file

    // TCB Tracker stores 8-bit unsigned PCM (OpenMPT: SampleIO::unsignedPCM).
    // Convert to signed (Amiga standard) by XOR 0x80.
    const unsigned = buf.slice(pcmStart, pcmEnd);
    const pcm = new Uint8Array(length);
    for (let j = 0; j < length; j++) {
      pcm[j] = (unsigned[j] ^ 0x80) & 0xff;
    }

    // Loop geometry:
    //   rawLoopEnd is the loop length counted from the end of the sample.
    //   If rawLoopEnd != 0 and rawLoopEnd < length, the loop is enabled and:
    //     realLoopStart = length - rawLoopEnd
    //     realLoopEnd   = length
    let loopStart = 0;
    let loopEnd   = length;
    if (rawLoopEnd !== 0 && rawLoopEnd < length) {
      loopStart = length - rawLoopEnd;
    } else {
      loopStart = 0;   // no loop
    }

    const name = instrNames[i] || `Sample ${i + 1}`;
    const instr = createSamplerInstrument(i + 1, name, pcm, volume, AMIGA_SAMPLE_RATE, loopStart, loopEnd);
    const chipRam: UADEChipRamInfo = {
      moduleBase: 0,
      moduleSize: buf.length,
      instrBase:  h1Start + i * 4,   // file offset of this sample's h1 header entry (4 bytes)
      instrSize:  12,                 // h1 entry (4 bytes) + h2 entry (8 bytes) per sample slot
    };
    instr.uadeChipRam = chipRam;
    instruments.push(instr);
  }

  // ── Pattern stub ─────────────────────────────────────────────────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: numPatterns,
      originalInstrumentCount: instruments.length,
    },
  };

  // Build order list from the header's order table (bytes 14-141, length numOrders)
  const orderCount = Math.max(1, numOrders);
  const songPositions = Array.from({ length: orderCount }, (_, i) => buf[14 + i] || 0);

  return {
    name:            `${moduleName} [TCB Tracker]`,
    format:          'MOD' as TrackerFormat,
    patterns:        [pattern],
    instruments,
    songPositions,
    songLength:      orderCount,
    restartPosition: 0,
    numChannels:     4,
    initialSpeed:    16 - tempo,   // OpenMPT: Order().SetDefaultSpeed(16 - fileHeader.tempo)
    initialBPM:      125,
    linearPeriods:   false,
  };
}
