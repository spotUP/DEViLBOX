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
 * The grid: nuade's loader (nw_bds_layout) finds the order lists and the track table; benDaglishSIDGrid.ts decodes
 * every track into byte-exact carrier rows and lays the three voices on one tick timeline
 * (docs/FORMAT_COMMAND_STREAM_GRID.md). Each note cell is paired with its note byte (`noteBytes`) for
 * BenDaglishSIDExporter. Playback is the vendored player, never this grid.
 *
 * Reference:
 *   third-party/uade-3.05/amigasrc/players/wanted_team/BennDaglishSID/Benn Daglish SID_v2.asm
 * Reference parsers: BenDaglishParser.ts
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { benDaglishSIDEncoder } from '@/engine/uade/encoders/BenDaglishSIDEncoder';
import { bdsLayout } from '@/engine/nuade/nuadeBdsLayout';
import { buildBdsGrid, BDS_ROWS_PER_PATTERN } from './benDaglishSIDGrid';
// SID synthesis format — no PCM samples to extract
// createSamplerInstrument not needed for this format

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_FILE_SIZE = 60; // need at least through offset 56+4

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

  // ── Extension check (optional fast-reject) ───────────────────────────────
  // UADE eagleplayer.conf lists these with a "BDS" prefix convention, but in
  // practice the reference files use a ".bds" suffix (e.g. "chubbygristle.bds").
  if (filename !== undefined) {
    const base = (filename.split('/').pop() ?? filename).toLowerCase();
    if (!base.endsWith('.bds')) return false;
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
 * The format is a compiled 68k Amiga executable. Subsong 0 becomes a tick grid (one row per player tick).
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive module name)
 */
export async function parseBenDaglishSIDFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isBenDaglishSIDFormat(buffer, filename)) {
    throw new Error('Not a Ben Daglish SID module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip ".bds" suffix (case-insensitive)
  let moduleName = baseName.replace(/\.bds$/i, '') || baseName;

  // ── Subsong count from header ─────────────────────────────────────────────
  //
  // u32BE at offset 56 = subsong count (validated non-zero by detection).
  // Clamp to a sane range (1..64) as a safety measure.

  const rawSubsongs = u32BE(buf, 56);
  const subsongCount = Math.min(Math.max(rawSubsongs, 1), 64);

  // ── Extract additional header pointers for metadata ───────────────────────
  //
  // +44: interrupt pointer
  // +48: audio interrupt pointer
  // +52: InitSong pointer

  const initSongPtr = u32BE(buf, 52);

  // ── Grid: nuade's loader finds the tables (nw_bds_layout), benDaglishSIDGrid.ts walks them ─────────────

  const layout = await bdsLayout(buf);
  const grid = layout && layout.orderLists.length > 0 ? buildBdsGrid(buf, layout, 0) : null;

  // ── Instruments: the 16 instrument commands (0x80..0x8F) of the tracks ────

  const instruments: InstrumentConfig[] = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    name: '',
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig));

  const blankRow = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  const ticks = grid?.ticks ?? BDS_ROWS_PER_PATTERN;
  const patternCount = Math.max(1, Math.ceil(ticks / BDS_ROWS_PER_PATTERN));
  const patterns: Pattern[] = Array.from({ length: patternCount }, (_, p) => {
    const length = Math.min(BDS_ROWS_PER_PATTERN, ticks - p * BDS_ROWS_PER_PATTERN);
    return {
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length,
      channels: Array.from({ length: 3 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `SID Voice ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 ? -50 : ch === 1 ? 0 : 50,
        instrumentId: null,
        color: null,
        rows: Array.from({ length }, (_, r) => {
          const cell = grid?.timeline[ch][p * BDS_ROWS_PER_PATTERN + r];
          return cell ? { ...cell } : blankRow();
        }),
      })),
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: 3,
        originalPatternCount: patternCount,
        originalInstrumentCount: 16,
        subsongCount,
        initSongPtr,
      },
    };
  });

  // ── Display name ──────────────────────────────────────────────────────────

  let displayName = `${moduleName} [Ben Daglish SID]`;
  if (subsongCount > 1) {
    displayName += ` (${subsongCount} subsongs)`;
  }

  const song: TrackerSong = {
    name: displayName,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 1,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
  if (!layout || !grid) {
    song.gridUnmatchedReason = 'nuade does not load this Ben Daglish SID module';
    return song;
  }

  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  for (let ch = 0; ch < 3; ch++) {
    grid.noteAt[ch].forEach((offset, tick) => {
      if (offset < 0) return;
      noteBytes.push({
        pattern: Math.floor(tick / BDS_ROWS_PER_PATTERN), channel: ch, row: tick % BDS_ROWS_PER_PATTERN,
        offset, note: grid.timeline[ch][tick].note,
      });
    });
  }
  song.uadePlayerTickGrid = true;
  song.uadeVariableLayout = {
    formatId: 'benDaglishSID',
    numChannels: 3,
    numFilePatterns: grid.filePatternAddrs.length,
    rowsPerPattern: patterns.map((p) => p.length),
    moduleSize: buf.length,
    encoder: benDaglishSIDEncoder,
    filePatternAddrs: grid.filePatternAddrs,
    filePatternSizes: grid.filePatternSizes,
    trackMap: patterns.map(() => [-1, -1, -1]),
    blockRows: grid.blockRows,
    noteBytes,
    propagateSharedCells: true,
  };
  return song;
}
