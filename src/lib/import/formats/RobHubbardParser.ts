/**
 * RobHubbardParser.ts — Rob Hubbard Amiga music format (rh.*) native parser
 *
 * Rob Hubbard composed music for many classic Amiga games. The player was
 * adapted by Wanted Team for EaglePlayer / DeliTracker. The module file is a
 * compiled 68k Amiga executable combining player code and music data in a
 * single file.
 *
 * Detection (from UADE "Rob Hubbard_v7.asm", DTP_Check2 routine):
 *   The check verifies five consecutive BRA branch opcodes at fixed offsets
 *   followed by two specific opcode constants:
 *
 *   1. word  at offset  0 == 0x6000  (BRA — unconditional branch)
 *   2. word  at offset  4 == 0x6000
 *   3. word  at offset  8 == 0x6000
 *   4. word  at offset 12 == 0x6000
 *   5. word  at offset 16 == 0x6000
 *   6. word  at offset 20 == 0x41FA  (LEA pc-relative)
 *   7. u32BE at offset 28 == 0x4E7541FA  (RTS + LEA pc-relative)
 *
 *   File must be at least 32 bytes for the checks to be performed.
 *
 * UADE eagleplayer.conf: RobHubbard  prefixes=rh
 * MI_MaxSamples = 13 (from InfoBuffer in Rob Hubbard_v7.asm).
 *
 * Sample table extraction algorithm (from Rob Hubbard.s EagleRipper + Rob Hubbard_v7.asm
 * InitPlayer routine):
 *
 *   Step 1 — Find sample count:
 *     Scan from offset 64 for the word $2418 (MOVE.B (A0)+,D4).
 *     When found at offset F, the sample count is the byte at F-1.
 *
 *   Step 2 — Find sample table start:
 *     Scan from offset 54 for the word $41FA (LEA d16(PC),An).
 *     When found at offset F, the displacement word d16 is at F+2.
 *     If the word at F+4 == $D1FC (ADD.L #imm,A0), apply a 0x40-byte variant skip.
 *     Sample table start = (F+2 [optionally +0x40]) + sign_extend(d16)
 *     (This is the standard 68k PC-relative address computation.)
 *
 *   Step 3 — Parse sample blobs:
 *     Each blob: [u32BE pcmLen][2 bytes header][pcmLen bytes signed PCM]
 *     Total blob size = pcmLen + 6.  Blobs are followed by a $4E71 (NOP) end marker.
 *
 * Single-file format: player code + music data in one binary blob.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/RobHubbard/src/Rob Hubbard_v7.asm
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/RobHubbard/src/Rob Hubbard.s
 * Reference parsers: JeroenTelParser.ts, JasonPageParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { RobHubbardConfig } from '@/types/instrument';
import { DEFAULT_ROB_HUBBARD } from '@/types/instrument';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Minimum file size required for the detection checks to be safe.
 * The last checked field is a u32BE at offset 28, so we need at least 32 bytes.
 */
const MIN_FILE_SIZE = 32;

/**
 * Maximum number of placeholder instruments to create.
 * Matches MI_MaxSamples = 13 declared in the InfoBuffer of Rob Hubbard_v7.asm.
 */
const MAX_INSTRUMENTS = 13;

/**
 * Maximum allowed PCM sample length (sanity check matching UADE's cmp.l #$10000,D1).
 */
const MAX_SAMPLE_LEN = 0x10000;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

/** Signed 16-bit big-endian read. */
function i16BE(buf: Uint8Array, off: number): number {
  const v = u16BE(buf, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the full DTP_Check2 detection algorithm.
 *
 * When `filename` is supplied the basename is also checked for the expected
 * UADE prefix (`rh.`). The prefix check alone is not sufficient; the binary
 * scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix fast-reject)
 */
export function isRobHubbardFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('rh.') && !base.endsWith('.rh')) return false;
  }

  // ── Minimum size ─────────────────────────────────────────────────────────
  if (buf.length < MIN_FILE_SIZE) return false;

  // ── Binary signature checks (DTP_Check2) ─────────────────────────────────
  if (u16BE(buf,  0) !== 0x6000)     return false;
  if (u16BE(buf,  4) !== 0x6000)     return false;
  if (u16BE(buf,  8) !== 0x6000)     return false;
  if (u16BE(buf, 12) !== 0x6000)     return false;
  if (u16BE(buf, 16) !== 0x6000)     return false;
  if (u16BE(buf, 20) !== 0x41FA)     return false;
  if (u32BE(buf, 28) !== 0x4e7541fa) return false;

  return true;
}

// ── Sample table extraction ──────────────────────────────────────────────────

/**
 * Locate the sample table and count in the Rob Hubbard binary.
 *
 * Uses the algorithm from Rob Hubbard_v7.asm (InitPlayer) and Rob Hubbard.s
 * (EagleRipper):
 *
 *   1. Scan from offset 64 for the opcode $2418.  The byte at (found-1) is the
 *      sample count (0-based dbf loop counter, so actual count = byte+1).
 *   2. Scan from offset 54 for $41FA (LEA d16(PC)).  The word following is the
 *      PC-relative displacement: sample_table = disp_word_offset + displacement.
 *      If $D1FC (ADD.L) follows, add 0x40 first (variant skip, from ripper).
 *
 * Returns null if the scan fails or the computed offset is out-of-bounds.
 */
function findSampleTable(buf: Uint8Array): { tableOffset: number; count: number } | null {
  // ── Step 1: find sample count ─────────────────────────────────────────────
  let sampleCount = -1;
  for (let i = 0; i < 8; i++) {
    const off = 64 + i * 2;
    if (off + 2 > buf.length) break;
    if (u16BE(buf, off) === 0x2418) {
      // After post-increment: A2 = off + 2.  The count byte is at -3(A2) = off - 1.
      if (off - 1 >= 0) {
        sampleCount = buf[off - 1];
      }
      break;
    }
  }
  if (sampleCount < 0) return null;

  // ── Step 2: find sample table offset ─────────────────────────────────────
  let d16Pos = -1;
  for (let i = 0; i <= 4; i++) {
    const off = 54 + i * 2;
    if (off + 2 > buf.length) break;
    if (u16BE(buf, off) === 0x41FA) {
      d16Pos = off + 2; // displacement word is immediately after the opcode
      break;
    }
  }
  if (d16Pos < 0 || d16Pos + 2 > buf.length) return null;

  const displacement = i16BE(buf, d16Pos);

  // Variant skip: if $D1FC (ADD.L #imm,A0) is at d16Pos+2, add 0x40
  let a1 = d16Pos;
  if (d16Pos + 4 <= buf.length && u16BE(buf, d16Pos + 2) === 0xD1FC) {
    a1 += 0x40;
  }

  // 68k PC-relative: EA = address_of_d16 + displacement
  const tableOffset = a1 + displacement;
  if (tableOffset < 0 || tableOffset >= buf.length) return null;

  // actual sample count = sampleCount + 1  (dbf loop counter is 0-based)
  return { tableOffset, count: sampleCount + 1 };
}

/**
 * Parse the sample table and return one RobHubbardConfig per sample.
 *
 * Each sample blob layout (big-endian):
 *   +0  uint32  pcmLen   — PCM data length in bytes
 *   +4  uint8   vol      — possible volume byte (0–64 range), from blob header
 *   +5  uint8   unused
 *   +6  int8[]  PCM data — signed 8-bit PCM, pcmLen bytes
 *
 * Total blob size = pcmLen + 6.
 *
 * All synth parameters other than sampleData/sampleVolume/sampleLen are set to
 * safe defaults (relative=1024 → identity period, divider=0 → no vibrato, etc.)
 * because the exact synth parameters are encoded in 68k machine code and cannot
 * be extracted without emulation.
 */
function parseSampleBlobs(
  buf: Uint8Array,
  tableOffset: number,
  count: number,
): RobHubbardConfig[] {
  const configs: RobHubbardConfig[] = [];
  let pos = tableOffset;

  for (let i = 0; i < count; i++) {
    if (pos + 6 > buf.length) break;

    const pcmLen = u32BE(buf, pos);

    // Sanity check: matches UADE's cmp.l #$10000,D1
    if (pcmLen === 0 || pcmLen > MAX_SAMPLE_LEN) break;

    // Volume may be in byte at +4 (header area before PCM data).
    // If it's in the 0-64 Amiga volume range, use it; otherwise default to 64.
    const headerByte4 = buf[pos + 4];
    const sampleVolume = headerByte4 <= 64 ? headerByte4 : 64;

    if (pos + 6 + pcmLen > buf.length) break;

    // Extract PCM as signed int8 array
    const pcmSlice = buf.slice(pos + 6, pos + 6 + pcmLen);
    const sampleData: number[] = new Array(pcmLen);
    for (let j = 0; j < pcmLen; j++) {
      const byte = pcmSlice[j];
      sampleData[j] = byte >= 128 ? byte - 256 : byte;
    }

    configs.push({
      sampleLen:     pcmLen,
      loopOffset:    -1,    // no loop — loop info is encoded in 68k code
      sampleVolume:  sampleVolume || 64,
      relative:      1024,  // identity: period = PERIODS[note] * 1024 >> 10 = PERIODS[note]
      divider:       0,     // no vibrato — divider stored in 68k code, not extractable
      vibratoIdx:    0,
      hiPos:         0,     // no wobble
      loPos:         0,
      vibTable:      [],
      sampleData,
    });

    pos += pcmLen + 6;
  }

  return configs;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Rob Hubbard module file into a TrackerSong.
 *
 * Rob Hubbard modules are compiled 68k Amiga executables.  The parser:
 *   - Locates the sample table using the UADE EaglePlayer detection algorithm
 *   - Extracts up to MI_MaxSamples PCM instruments as RobHubbardSynth configs
 *   - Falls back to silent placeholder instruments for any unextracted slots
 *
 * Actual synthesis is handled by RobHubbardSynth / RobHubbardEngine (WASM).
 * Synth parameters that require 68k emulation (relative, divider, vibTable,
 * hiPos/loPos) are set to safe defaults.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseRobHubbardFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isRobHubbardFormat(buffer, filename)) {
    throw new Error('Not a Rob Hubbard module');
  }

  const buf = new Uint8Array(buffer);

  // ── Module name from filename ─────────────────────────────────────────────
  const baseName = (filename.split('/').pop() ?? filename);
  const moduleName = baseName.replace(/^rh\./i, '') || baseName;

  // ── Extract sample configs ────────────────────────────────────────────────
  let extractedConfigs: RobHubbardConfig[] = [];
  const tableResult = findSampleTable(buf);
  if (tableResult !== null) {
    extractedConfigs = parseSampleBlobs(buf, tableResult.tableOffset, tableResult.count);
  }

  const extractedCount = extractedConfigs.length;

  // ── Build instrument list ─────────────────────────────────────────────────
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < MAX_INSTRUMENTS; i++) {
    if (i < extractedCount) {
      // Real PCM data extracted from the binary
      const cfg = extractedConfigs[i];
      instruments.push({
        id:         i + 1,
        name:       `Sample ${i + 1}`,
        type:       'synth' as const,
        synthType:  'RobHubbardSynth' as const,
        effects:    [],
        volume:     0,
        pan:        0,
        robHubbard: cfg,
      } as InstrumentConfig);
    } else {
      // Placeholder for unextracted slots (silent but correctly typed)
      instruments.push({
        id:         i + 1,
        name:       `Sample ${i + 1}`,
        type:       'synth' as const,
        synthType:  'RobHubbardSynth' as const,
        effects:    [],
        volume:     0,
        pan:        0,
        robHubbard: { ...DEFAULT_ROB_HUBBARD },
      } as InstrumentConfig);
    }
  }

  // ── Empty pattern (placeholder — UADE handles actual song playback) ───────
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
      originalInstrumentCount: MAX_INSTRUMENTS,
    },
  };

  const extractNote = extractedCount > 0
    ? ` (${extractedCount}/${MAX_INSTRUMENTS} smp extracted)`
    : ` (${MAX_INSTRUMENTS} smp)`;

  return {
    name: `${moduleName} [Rob Hubbard]${extractNote}`,
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
