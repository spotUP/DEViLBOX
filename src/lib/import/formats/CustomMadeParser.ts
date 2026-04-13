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
 *   third-party/uade-3.05/amigasrc/players/wanted_team/CustomMade/CustomMade_v1.asm
 * Reference parsers: BenDaglishParser.ts, RonKlarenParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_FILE_SIZE = 3001; // file size must be > 3000

// Delitracker Custom magic: dword at offset 0 in all .cus / cust. / custom. files
const DELITRACKER_CUSTOM_MAGIC = 0x000003f3;

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
 * Return true if the buffer is a Custom Made or Delitracker Custom format file.
 *
 * Two sub-formats are detected:
 *
 * 1. Delitracker Custom (.cus / cust. / custom.):
 *    - dword at offset 0 == 0x000003F3
 *    - file size > 3000 bytes
 *
 * 2. CustomMade (cm.* / rk.* / rkb.*) — 68k executable:
 *    - Passes the DTP_Check2 detection algorithm from CustomMade_v1.asm
 *    - First word is 0x4EF9 (JMP), 0x4EB9 (JSR), or 0x6000 (BRA.W)
 *    - Followed by secondary opcode validation
 *    - Voice-clear signature in bytes 8..407
 *
 * When `filename` is supplied and starts with a known prefix (cm., rk., rkb.)
 * only the CustomMade binary scan is attempted. For .cus / cust. extensions
 * only the Delitracker magic is checked. Without a filename both checks run.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix/extension check)
 */
export function isCustomMadeFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  if (buf.length <= MIN_FILE_SIZE - 1) return false;

  // ── Delitracker Custom check ──────────────────────────────────────────────
  // Files with .cus / .cust / custom. prefix use the Delitracker custom player.
  // They all share the magic value 0x000003F3 at offset 0.
  if (buf.length >= 4 && u32BE(buf, 0) === DELITRACKER_CUSTOM_MAGIC) {
    return true;
  }

  // ── CustomMade (cm./rk./rkb.) binary scan ────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('cm.') && !base.startsWith('rk.') && !base.startsWith('rkb.')) {
      return false;
    }
  }

  // Need at least 8 bytes for the header checks
  if (buf.length < 8) return false;

  const word0 = u16BE(buf, 0);

  // Entry point opcode must be JMP, JSR, or BRA.W
  let scanStart = 8;

  if (word0 === 0x4ef9 || word0 === 0x4eb9) {
    // JMP or JSR: word at offset 6 must be 0x4EF9 (JMP)
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

  const buf = new Uint8Array(buffer);

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "cm.", "rk.", or "rkb." prefix (case-insensitive)
  const moduleName = baseName.replace(/^(cm|rk|rkb)\./i, '') || baseName;

  // ── Detect sub-variant ────────────────────────────────────────────────────

  const isDelitracker = buf.length >= 4 && u32BE(buf, 0) === DELITRACKER_CUSTOM_MAGIC;
  const word0 = u16BE(buf, 0);
  const isBRAVariant = word0 === 0x6000;
  const variantLabel = isDelitracker ? 'Delitracker Custom' : 'Custom Made';

  // ── Sample count extraction ───────────────────────────────────────────────
  //
  // Scan the binary for sample table structures. In the CustomMade format,
  // after the voice-clear signature there is typically a sample table with
  // 6 or 8-byte entries (offset + length per sample).
  //
  // For the Delitracker variant, scan for MOVE.W #n,Dn patterns that set
  // sample count, or count recognizable sample headers.

  let sampleCount = DEFAULT_INSTRUMENTS;
  const instruments: InstrumentConfig[] = [];

  try {
    if (isDelitracker) {
      // Delitracker Custom: scan for u16 sample count in the header area.
      // Look for MOVE.W immediate patterns that set sample counts.
      for (let off = 32; off < Math.min(buf.length - 4, 512); off += 2) {
        const op = u16BE(buf, off);
        // MOVE.W #imm,Dn ($303C = MOVE.W #imm,D0, $323C = MOVE.W #imm,D1, etc.)
        if ((op & 0xF1FF) === 0x303C) {
          const val = u16BE(buf, off + 2);
          if (val >= 1 && val <= 64) {
            sampleCount = val;
            break;
          }
        }
      }
    } else {
      // CustomMade (cm/rk/rkb): look for the voice-clear signature location
      // and then scan after it for sample data
      const scanStart = 8;
      const scanEnd = Math.min(scanStart + 400, buf.length - 12);

      let sigOffset = -1;
      for (let off = scanStart; off <= scanEnd; off += 2) {
        if (
          u32BE(buf, off + 0) === 0x42280030 &&
          u32BE(buf, off + 4) === 0x42280031 &&
          u32BE(buf, off + 8) === 0x42280032
        ) {
          sigOffset = off + 12;
          break;
        }
      }

      // Scan for LEA instructions after the signature to find sample tables
      // and extract inline PCM data: each entry is [u32 len] [u16 period] [len bytes PCM]
      if (sigOffset > 0) {
        for (let off = sigOffset; off < Math.min(sigOffset + 512, buf.length - 4); off += 2) {
          const op = u16BE(buf, off);
          if (op === 0x41FA && off + 4 <= buf.length) {
            const disp = u16BE(buf, off + 2);
            const signedDisp = disp < 0x8000 ? disp : disp - 0x10000;
            const target = off + 2 + signedDisp;
            if (target > 0 && target + 8 <= buf.length) {
              // First pass: count entries to validate
              let count = 0;
              let soff = target;
              for (let i = 0; i < 64 && soff + 6 <= buf.length; i++) {
                const len = u32BE(buf, soff);
                if (len === 0 || len > 0x100000) break;
                const period = u16BE(buf, soff + 4);
                if (period === 0) break;
                count++;
                soff += 6 + len;
              }
              if (count >= 2) {
                sampleCount = count;
                // Second pass: extract PCM samples
                soff = target;
                for (let i = 0; i < count && soff + 6 <= buf.length; i++) {
                  const len = u32BE(buf, soff);
                  const period = u16BE(buf, soff + 4);
                  const pcmStart = soff + 6;
                  const pcmEnd = Math.min(pcmStart + len, buf.length);
                  if (pcmEnd > pcmStart && len > 0) {
                    const pcm = buf.slice(pcmStart, pcmEnd);
                    // Convert period to sample rate: PAL clock / period
                    const sampleRate = period > 0 ? Math.round(3546895 / period) : 8287;
                    instruments.push(createSamplerInstrument(
                      i + 1, `${variantLabel} ${i + 1}`, pcm, 64, sampleRate, 0, 0,
                    ));
                  } else {
                    instruments.push({
                      id: i + 1, name: `${variantLabel} ${i + 1}`,
                      type: 'synth' as const, synthType: 'Synth' as const,
                      effects: [], volume: 0, pan: 0,
                    } as InstrumentConfig);
                  }
                  soff += 6 + len;
                }
                break;
              }
            }
          }
        }
      }
    }
  } catch {
    // Binary scan failed — use defaults
  }

  // ── Build instrument list (fallback if PCM extraction didn't populate) ──

  if (instruments.length === 0) {
    for (let i = 0; i < sampleCount; i++) {
      instruments.push({
        id: i + 1,
        name: `${variantLabel} Sample ${i + 1}`,
        type: 'synth' as const,
        synthType: 'Synth' as const,
        effects: [],
        volume: 0,
        pan: 0,
      } as InstrumentConfig);
    }
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
      originalInstrumentCount: sampleCount,
      variant: isDelitracker ? 'delitracker' : isBRAVariant ? 'bra' : 'jmp',
    },
  };

  return {
    name: `${moduleName} [${variantLabel}]`,
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
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'customMade',
      patternDataFileOffset: 0,
      bytesPerCell: 4,
      rowsPerPattern: 64,
      numChannels: 4,
      numPatterns: 1,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
      decodeCell: decodeMODCell,
    } as UADEPatternLayout,
  };
}
