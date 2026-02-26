/**
 * CustomMadeParser.ts — Custom Made Amiga music format (cm.* / rk.* / rkb.*) native parser
 *
 * Custom Made (also known as Ron Klaren) is a 4-channel Amiga tracker format
 * created by Ivo Zoer and composed primarily by Ron Klaren. The module file
 * is a single-file compiled 68k Amiga executable.
 *
 * Detection (from UADE "CustomMade_v1.asm", DTP_Check2 routine):
 *   1. File size > 3000 bytes
 *   2. First word is one of:
 *        0x4EF9 (JMP absolute)
 *        0x4EB9 (JSR absolute)
 *        0x6000 (BRA.W)
 *      If 0x6000, then word at offset 4 must also be 0x6000; otherwise skip to More.
 *      If 0x4EF9 or 0x4EB9, then word at offset 6 must be 0x4EF9 (JMP).
 *   3. Scan bytes 8..407 (lea 8(A0),A1; lea 400(A1),A2) for the signature sequence:
 *        u32BE(off+0) == 0x42280030  (CLR.B $30(A0) — voice clear sequence)
 *        u32BE(off+4) == 0x42280031  (CLR.B $31(A0))
 *        u32BE(off+8) == 0x42280032  (CLR.B $32(A0))
 *      Scan advances 2 bytes at a time until the signature is found or A1 reaches A2.
 *
 * Prefixes: cm, rk, rkb
 * UADE eagleplayer.conf: CustomMade  prefixes=cm,rk,rkb
 *
 * Note: A full Ron Klaren parser with note/pattern decoding exists as RonKlarenParser.ts.
 * This CustomMade parser provides the UADE DTP_Check2 detection covering all three
 * prefixes (cm.*, rk.*, rkb.*) as a lightweight metadata-only stub.
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/CustomMade/CustomMade_v1.asm
 * Reference parsers: BenDaglishParser.ts, RonKlarenParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_FILE_SIZE = 3001; // file size must be > 3000

const DEFAULT_INSTRUMENTS = 8;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the DTP_Check2 detection algorithm
 * from CustomMade_v1.asm.
 *
 * When `filename` is supplied the basename is checked for one of the expected
 * UADE prefixes (`cm.`, `rk.`, `rkb.`). The binary scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isCustomMadeFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('cm.') && !base.startsWith('rk.') && !base.startsWith('rkb.')) {
      return false;
    }
  }

  // File size > 3000
  if (buf.length <= MIN_FILE_SIZE - 1) return false;

  // Need at least 8 bytes for the header checks
  if (buf.length < 8) return false;

  const word0 = u16BE(buf, 0);

  // Entry point opcode must be JMP, JSR, or BRA.W
  let scanStart = 8;

  if (word0 === 0x4ef9 || word0 === 0x4eb9) {
    // JMP or JSR: word at offset 6 must be 0x4EF9 (JMP)
    if (buf.length < 8) return false;
    if (u16BE(buf, 6) !== 0x4ef9) return false;
    // scanStart already set to 8
  } else if (word0 === 0x6000) {
    // BRA.W: word at offset 4 must also be 0x6000
    if (buf.length < 6) return false;
    if (u16BE(buf, 4) !== 0x6000) return false;
    // scanStart already set to 8
  } else {
    return false;
  }

  // Scan [scanStart .. scanStart+400) for the voice-clear signature
  // Signature: CLR.B $30(A0), CLR.B $31(A0), CLR.B $32(A0)
  // Encoded as: 0x42280030, 0x42280031, 0x42280032
  const scanEnd = scanStart + 400;
  if (buf.length < scanStart + 12) return false;

  const end = Math.min(scanEnd, buf.length - 12);
  for (let off = scanStart; off <= end; off += 2) {
    if (
      u32BE(buf, off + 0) === 0x42280030 &&
      u32BE(buf, off + 4) === 0x42280031 &&
      u32BE(buf, off + 8) === 0x42280032
    ) {
      return true;
    }
  }

  return false;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Custom Made module file into a TrackerSong.
 *
 * The format is a compiled 68k Amiga executable. This parser creates a
 * metadata-only TrackerSong with placeholder instruments. Actual audio
 * playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseCustomMadeFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isCustomMadeFormat(buffer, filename)) {
    throw new Error('Not a Custom Made module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "cm.", "rk.", or "rkb." prefix (case-insensitive)
  const moduleName = baseName.replace(/^(cm|rk|rkb)\./i, '') || baseName;

  // ── Instrument placeholders ───────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < DEFAULT_INSTRUMENTS; i++) {
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
      originalPatternCount: 1,
      originalInstrumentCount: DEFAULT_INSTRUMENTS,
    },
  };

  return {
    name: `${moduleName} [Custom Made]`,
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
