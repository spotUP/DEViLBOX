/**
 * BenDaglishSIDParser.ts — Ben Daglish SID Amiga music format (BDS.*) native parser
 *
 * Ben Daglish SID is a 3-voice variant of the Ben Daglish player, using SID-style
 * synthesis on the Amiga. Files are identified by a distinctive header structure.
 *
 * Detection (from UADE "Benn Daglish SID_v2.asm", EP_Check3 / DTP_Check1 routine):
 *   The format uses both Check1 (requires DeliTracker base) and Check3 (data check):
 *     1. u32BE(buf, 0) == 0x000003F3  (Amiga HUNK_HEADER magic)
 *     2. buf[20] != 0                 (loading-into-chip-ram check: must be non-zero)
 *     3. u32BE(buf, 32) == 0x70FF4E75 (at offset 32: "moveq #-1,d0 / rts")
 *     4. u32BE(buf, 36) == 0x44414749 ('DAGI' — part of 'DAGLISH!')
 *     5. u32BE(buf, 40) == 0x4953482E  ('' remainder + '!')
 *        NOTE: ASM uses 'DAGL' then 'ISH!' so full string is "DAGLISH!"
 *     6. u32BE(buf, 44) != 0          (interrupt pointer non-zero)
 *     7. u32BE(buf, 48) != 0          (audio interrupt pointer non-zero)
 *     8. u32BE(buf, 52) != 0          (InitSong pointer non-zero)
 *     9. u32BE(buf, 56) != 0          (subsongs count non-zero)
 *
 *   Note: the assembly reads "DAGL" + "ISH!" as two separate 4-byte comparisons.
 *   The combined 8-byte signature at offset 36..43 is "DAGLISH!".
 *
 * Prefix (case-sensitive in eagleplayer.conf): BDS
 * UADE eagleplayer.conf: BenDaglishSID  prefixes=BDS
 * Voices: 3 (SID-style 3-voice synthesis)
 *
 * UADE handles actual audio playback. This parser extracts metadata only.
 *
 * Reference:
 *   Reference Code/uade-3.05/amigasrc/players/wanted_team/BennDaglishSID/Benn Daglish SID_v2.asm
 * Reference parsers: BenDaglishParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_FILE_SIZE = 60; // need at least through offset 56+4

const DEFAULT_INSTRUMENTS = 8;

// ── Binary helpers ──────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer passes the EP_Check3 detection algorithm
 * from Benn Daglish SID_v2.asm.
 *
 * When `filename` is supplied the basename is checked for the expected UADE
 * prefix (`BDS.`). The binary scan is always performed.
 *
 * @param buffer    Raw file bytes
 * @param filename  Original filename (optional; used for prefix check)
 */
export function isBenDaglishSIDFormat(buffer: ArrayBuffer, filename?: string): boolean {
  const buf = new Uint8Array(buffer);

  // ── Prefix check (optional fast-reject) ──────────────────────────────────
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.startsWith('bds.')) return false;
  }

  if (buf.length < MIN_FILE_SIZE) return false;

  // u32BE(buf, 0) == 0x000003F3 (Amiga HUNK_HEADER magic)
  if (u32BE(buf, 0) !== 0x000003f3) return false;

  // buf[20] != 0 (loading-into-chip check)
  if (buf[20] === 0) return false;

  // Advance to offset 32 (lea 32(A0),A0 in the ASM)
  // u32BE(buf, 32) == 0x70FF4E75: "moveq #-1,d0 / rts"
  if (u32BE(buf, 32) !== 0x70ff4e75) return false;

  // 'DAGL' at offset 36
  if (u32BE(buf, 36) !== 0x4441474c) return false; // 'DAGL'

  // 'ISH!' at offset 40
  if (u32BE(buf, 40) !== 0x49534821) return false; // 'ISH!'

  // interrupt pointer non-zero at offset 44
  if (u32BE(buf, 44) === 0) return false;

  // audio interrupt pointer non-zero at offset 48
  if (u32BE(buf, 48) === 0) return false;

  // InitSong pointer non-zero at offset 52
  if (u32BE(buf, 52) === 0) return false;

  // subsongs count non-zero at offset 56
  if (u32BE(buf, 56) === 0) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Ben Daglish SID module file into a TrackerSong.
 *
 * The format is a compiled 68k Amiga executable. This parser creates a
 * metadata-only TrackerSong with placeholder instruments. Actual audio
 * playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseBenDaglishSIDFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  if (!isBenDaglishSIDFormat(buffer, filename)) {
    throw new Error('Not a Ben Daglish SID module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "BDS." prefix (case-insensitive)
  const moduleName = baseName.replace(/^bds\./i, '') || baseName;

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
    channels: Array.from({ length: 3 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 ? -50 : ch === 1 ? 0 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 3,
      originalPatternCount: 1,
      originalInstrumentCount: DEFAULT_INSTRUMENTS,
    },
  };

  return {
    name: `${moduleName} [Ben Daglish SID]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
