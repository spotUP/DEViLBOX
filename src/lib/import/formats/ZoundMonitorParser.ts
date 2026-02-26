/**
 * ZoundMonitorParser.ts — ZoundMonitor Amiga music format native parser
 *
 * ZoundMonitor is an Amiga music format identified by the UADE eagleplayer
 * prefix "sng" (e.g. "sng.mysong"). Module files are single-file binaries
 * combining player code and music data in one 68k executable blob.
 * MI_MaxSamples = 15 (from InfoBuffer in ZoundMonitor_v1.asm).
 *
 * Detection algorithm (from ZoundMonitor_v1.asm DTP_Check2 routine):
 *
 *   The check computes a structural offset from the first two bytes of the
 *   file, advances a pointer to that offset, and verifies a signature tag:
 *
 *     D1 = (byte[0] + 1) * 16                ; lsl #4
 *     D0 = (byte[1] + 1) * 128               ; lsl #7
 *     D1 = D1 + D0 + 869                     ; total offset
 *     if D1 >= fileSize → fault              ; bge.b fault
 *     A0 += D1                               ; advance to check position
 *
 *   At offset D1 a two-branch tag check is performed using 68k post-increment
 *   addressing (the first cmp.b uses (A0)+ which increments A0 after reading):
 *
 *     if byte[D1] == 'd':
 *       "df?:" pattern — byte[D1+1]=='f', byte[D1+3]==':'
 *     else:
 *       "?amp" pattern — byte[D1+1]=='a', byte[D1+2]=='m', byte[D1+3]=='p'
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/ZoundMonitor/src/ZoundMonitor_v1.asm
 * Reference parsers: JeroenTelParser.ts, JasonPageParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Maximum number of instrument placeholders.
 * MI_MaxSamples = 15 from InfoBuffer in ZoundMonitor_v1.asm.
 */
const MAX_SAMPLES = 15;

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if `buffer` is a ZoundMonitor module.
 *
 * When `filename` is provided the basename is checked against the UADE prefix
 * "sng." (case-insensitive). If the prefix does not match, detection returns
 * false immediately to avoid false positives from unrelated formats.
 *
 * The structural binary check (DTP_Check2) is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isZoundMonitorFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('sng.')) return false;
  }

  if (buf.length < 4) return false;

  // ── Compute structural offset (DTP_Check2) ────────────────────────────────
  // D1 = (byte[0] + 1) * 16  (lsl #4 after addq #1)
  // D0 = (byte[1] + 1) * 128 (lsl #7 after addq #1)
  // D1 = D1 + D0 + 869
  const offset = (buf[0] + 1) * 16 + (buf[1] + 1) * 128 + 869;

  // bge.b fault: file must be strictly larger than offset
  if (offset >= buf.length) return false;

  // Need 4 bytes at and including offset (check reads bytes [offset..offset+3])
  if (offset + 3 >= buf.length) return false;

  const b0 = buf[offset];
  const b1 = buf[offset + 1];
  const b2 = buf[offset + 2];
  const b3 = buf[offset + 3];

  if (b0 === 0x64 /* 'd' */) {
    // "df?:" check — post-increment addressing in the assembly means:
    //   cmp.b #'d',(A0)+ → compares byte[offset]   to 'd', A0 → offset+1
    //   cmp.b #'f',(A0)+ → compares byte[offset+1] to 'f', A0 → offset+2
    //   cmp.b #':',1(A0) → compares byte[offset+3] to ':' (1 past A0=offset+2)
    return b1 === 0x66 /* 'f' */ && b3 === 0x3a /* ':' */;
  } else {
    // "?amp" check — A0 is already at offset+1 (advanced by the 'd' comparison):
    //   cmp.b #'a',(A0)+ → compares byte[offset+1] to 'a'
    //   cmp.b #'m',(A0)+ → compares byte[offset+2] to 'm'
    //   cmp.b #'p',(A0)  → compares byte[offset+3] to 'p'
    return b1 === 0x61 /* 'a' */ && b2 === 0x6d /* 'm' */ && b3 === 0x70 /* 'p' */;
  }
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a ZoundMonitor module file into a TrackerSong.
 *
 * ZoundMonitor modules are compiled 68k Amiga executables; there is no public
 * specification of the internal layout beyond what the EaglePlayer detection
 * code reveals. This parser creates a metadata-only TrackerSong with up to 15
 * placeholder instruments (MI_MaxSamples from the assembly InfoBuffer).
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseZoundMonitorFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isZoundMonitorFormat(buffer, filename)) {
    throw new Error('Not a ZoundMonitor module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "sng." prefix (case-insensitive) to derive the module title
  const moduleName = baseName.replace(/^sng\./i, '') || baseName;

  // ── Instrument placeholders ───────────────────────────────────────────────
  //
  // MI_MaxSamples = 15 (declared in InfoBuffer in ZoundMonitor_v1.asm).
  // Extracting the exact count used by a specific module would require
  // emulating the 68k player init; we use the documented maximum so that
  // the TrackerSong can represent any module in this format.

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
      originalPatternCount: 1,
      originalInstrumentCount: MAX_SAMPLES,
    },
  };

  return {
    name: `${moduleName} [ZoundMonitor] (${MAX_SAMPLES} smp)`,
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
