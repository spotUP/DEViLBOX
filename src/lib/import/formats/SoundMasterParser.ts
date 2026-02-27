/**
 * SoundMasterParser.ts — Sound Master Amiga music format native parser
 *
 * Sound Master (versions 1.0–3.0) was written by Michiel J. Soede. The module
 * file is a compiled 68k Amiga executable combining player code and music data
 * in a single binary. MI_MaxSamples = 32 (from InfoBuffer in the player asm).
 *
 * Detection (from UADE "Sound Master_v1.asm", DTP_Check2 routine):
 *   1. word[0] must be 0x6000 (BRA.W opcode).
 *   2. word[1] (D2) must be: non-negative (< 0x8000 signed), non-zero, even.
 *   3. word[2] must be 0x6000.
 *   4. word[3] (D3) must be: non-negative, non-zero, even.
 *   5. word[4] must be 0x6000.
 *   6. Scan from (2 + D2) up to 30 bytes for 0x47FA (LEA pc-relative opcode).
 *   7. From that position, scan forward for 0x4E75 (RTS opcode). Let rtsEnd be
 *      the position immediately after the RTS word.
 *   8. Optional new-format check: if 4 bytes at (rtsEnd - 8) == 0x177C0000,
 *      set checkOff = rtsEnd - 6; otherwise checkOff = rtsEnd.
 *   9. Required: 4 bytes at (checkOff - 6) must equal 0x00BFE001.
 *
 * UADE eagleplayer.conf: SoundMaster  prefixes=sm,sm1,sm2,sm3,smpro
 *
 * Single-file format: player code + music data + samples all in one binary
 * blob. This parser extracts metadata only; UADE handles actual audio playback.
 *
 * Reference:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/SoundMaster/Sound Master_v1.asm
 * Reference parsers: JeroenTelParser.ts, JasonPageParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Maximum number of samples as declared in InfoBuffer:
 *   MI_MaxSamples = 32
 */
const MAX_SAMPLES = 32;

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
 * Return true if the buffer passes the full DTP_Check2 detection algorithm for
 * the Sound Master format.
 *
 * When `filename` is supplied the basename is also checked for the expected
 * UADE prefixes (sm., sm1., sm2., sm3., smpro.). If a prefix does not match,
 * detection returns false immediately to avoid false positives. The binary
 * detection is always performed regardless of filename.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isSoundMasterFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Extension check (optional fast-reject) ───────────────────────────────
  // UADE eagleplayer.conf declares: prefixes=sm,sm1,sm2,sm3,smpro
  // In practice the reference files use these as file extensions (.sm, .smpro, .sm3).
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    const validExtensions = ['.sm', '.sm1', '.sm2', '.sm3', '.smpro'];
    if (!validExtensions.some(ext => base.endsWith(ext))) return false;
  }

  // Minimum bytes: three BRA.W words at offsets 0, 4, 8 → need at least 10;
  // subsequent scan requires more. Gate on specific reads below.
  if (buf.length < 14) return false;

  // ── Three consecutive 0x6000 BRA.W words at offsets 0, 4, 8 ─────────────
  if (u16BE(buf, 0) !== 0x6000) return false;

  const d2 = u16BE(buf, 2);
  // D2 must be non-zero, non-negative (signed < 0x8000), and even
  if (d2 === 0 || d2 >= 0x8000 || (d2 & 1) !== 0) return false;

  if (u16BE(buf, 4) !== 0x6000) return false;

  const d3 = u16BE(buf, 6);
  // D3 must be non-zero, non-negative, and even
  if (d3 === 0 || d3 >= 0x8000 || (d3 & 1) !== 0) return false;

  if (u16BE(buf, 8) !== 0x6000) return false;

  // ── Scan for 0x47FA (LEA pc-relative) starting at (2 + D2) ───────────────
  // Scan limit is scanBase + 30 bytes (lea 30(A1), A0 in assembly)
  const scanBase = 2 + d2;
  const scanLimit = scanBase + 30;
  if (scanLimit + 1 >= buf.length) return false;

  let leaPos = -1;
  for (let pos = scanBase; pos < scanLimit && pos + 1 < buf.length; pos += 2) {
    if (u16BE(buf, pos) === 0x47fa) {
      leaPos = pos;
      break;
    }
  }
  if (leaPos === -1) return false;

  // ── Scan forward from leaPos for 0x4E75 (RTS) ────────────────────────────
  let rtsPos = -1;
  for (let pos = leaPos; pos + 1 < buf.length; pos += 2) {
    if (u16BE(buf, pos) === 0x4e75) {
      rtsPos = pos;
      break;
    }
  }
  if (rtsPos === -1) return false;

  // rtsEnd = position of A1 after the FindRTS loop (2 bytes past the RTS word)
  const rtsEnd = rtsPos + 2;

  // ── Optional new-format adjustment ───────────────────────────────────────
  // If 4 bytes at (rtsEnd - 8) == 0x177C0000, adjust checkOff back by 6
  let checkOff = rtsEnd;
  if (rtsEnd >= 8 && rtsEnd - 8 + 3 < buf.length && u32BE(buf, rtsEnd - 8) === 0x177c0000) {
    checkOff = rtsEnd - 6;
  }

  // ── Required check: 4 bytes at (checkOff - 6) must be 0x00BFE001 ─────────
  if (checkOff < 6 || checkOff - 6 + 3 >= buf.length) return false;
  return u32BE(buf, checkOff - 6) === 0x00bfe001;
}

// ── Prefix helpers ──────────────────────────────────────────────────────────

/**
 * Strip the Sound Master UADE prefix from a basename to derive the module title.
 * Handles: smpro., sm3., sm2., sm1., sm.  (longest match first).
 */
function stripSoundMasterPrefix(name: string): string {
  return (
    name
      .replace(/^smpro\./i, '')
      .replace(/^sm3\./i, '')
      .replace(/^sm2\./i, '')
      .replace(/^sm1\./i, '')
      .replace(/^sm\./i, '') || name
  );
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Sound Master module file into a TrackerSong.
 *
 * Sound Master modules are compiled 68k Amiga executables; there is no public
 * specification of the internal layout beyond what the EaglePlayer detection
 * code reveals. This parser creates a metadata-only TrackerSong with up to 32
 * placeholder instruments (MI_MaxSamples from the assembly InfoBuffer).
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseSoundMasterFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isSoundMasterFormat(buffer, filename)) {
    throw new Error('Not a Sound Master module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const base = filename.split('/').pop() ?? filename;
  const moduleName = stripSoundMasterPrefix(base) || base;

  // ── Instrument placeholders ───────────────────────────────────────────────
  //
  // MI_MaxSamples = 32 (declared in InfoBuffer in the player assembly).
  // The exact count requires emulating the 68k player init routine to walk
  // internal data structures; we use the documented maximum as placeholders
  // so that the TrackerSong can represent any module in this format family.

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
      originalInstrumentCount: MAX_SAMPLES,
    },
  };

  return {
    name: `${moduleName} [Sound Master]`,
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
