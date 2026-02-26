/**
 * MagneticFieldsPackerParser.ts — Magnetic Fields Packer Amiga format (mfp.*) native parser
 *
 * Magnetic Fields Packer is a 4-channel Amiga module packer by Shaun Southern.
 * Files are identified by a distinctive fixed-size header structure.
 *
 * Detection (from UADE "Magnetic Fields Packer_v3.asm", DTP_Check2 routine):
 *   1. File size > 400 bytes
 *   2. buf[248]: non-zero (instrument count / number of patterns)
 *   3. buf[249] == 0x7F (restart byte, always exactly 127)
 *   4. buf[378..379] (u16BE): the value at this offset (size1)
 *      - must equal buf[380..381] (u16BE, size2 cross-check)
 *      - must be <= 127 (cmp.w D3, D2 where D3=127)
 *      - must equal buf[248] (instrument count cross-check)
 *
 *   The assembly performs:
 *     lea 248(A0), A0
 *     move.b (A0)+, D1   ; D1 = buf[248], must be non-zero
 *     moveq #127, D3
 *     cmp.b (A0)+, D3    ; buf[249] must == 127
 *     lea 128(A0), A0    ; advance to offset 248+2+128 = 378
 *     move.w (A0)+, D2   ; D2 = u16BE(buf, 378)
 *     cmp.w (A0), D2     ; must equal u16BE(buf, 380)
 *     cmp.w D3, D2       ; must be <= 127
 *     cmp.b D1, D2       ; must equal D1 (buf[248])
 *
 * Prefix: mfp
 * UADE eagleplayer.conf: MagneticFieldsPacker  prefixes=mfp
 *
 * Note: A full MFP parser with pattern decoding already exists as MFPParser.ts.
 * This parser provides a lightweight detection + metadata-only stub consistent
 * with the other UADE format stubs in this directory.
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/MagneticFieldsPacker/src/Magnetic Fields Packer_v3.asm
 * Reference parsers: BenDaglishParser.ts, MFPParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_FILE_SIZE = 400;

const DEFAULT_INSTRUMENTS = 8;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the DTP_Check2 detection algorithm
 * from Magnetic Fields Packer_v3.asm.
 *
 * When `filename` is supplied the basename is checked for the expected UADE
 * prefix (`mfp.`). The binary scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isMagneticFieldsPackerFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('mfp.')) return false;
  }

  // File size > 400
  if (buf.length <= MIN_FILE_SIZE) return false;

  // buf[248]: D1 = non-zero
  const d1 = buf[248];
  if (d1 === 0) return false;

  // buf[249] must equal 127 (0x7F)
  if (buf[249] !== 0x7f) return false;

  // Need at least offset 381 inclusive
  if (buf.length < 382) return false;

  // u16BE(buf, 378): D2
  const d2 = u16BE(buf, 378);

  // D2 must equal u16BE(buf, 380) (size cross-check)
  if (d2 !== u16BE(buf, 380)) return false;

  // D2 must be <= 127 (cmp.w D3, D2 where D3=127; bhi.b Fault → fail if D2 > D3)
  if (d2 > 127) return false;

  // D2 must equal D1 / buf[248] (cmp.b D1, D2)
  if ((d2 & 0xff) !== d1) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Magnetic Fields Packer module file into a TrackerSong.
 *
 * The format is a structured Amiga module with 31 instruments. This parser
 * creates a metadata-only TrackerSong with placeholder instruments. Actual
 * audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseMagneticFieldsPackerFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isMagneticFieldsPackerFormat(buffer, filename)) {
    throw new Error('Not a Magnetic Fields Packer module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "mfp." prefix (case-insensitive)
  const moduleName = baseName.replace(/^mfp\./i, '') || baseName;

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
    name: `${moduleName} [Magnetic Fields Packer]`,
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
