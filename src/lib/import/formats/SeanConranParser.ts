/**
 * SeanConranParser.ts — Sean Conran Amiga music format (SCR.*) native parser
 *
 * Sean Conran composed music for various Amiga games and demos. The format is a
 * compiled 68k executable where player code and music data are combined into a
 * single self-contained file.
 *
 * Detection (from Sean Conran_v3.asm, DTP_Check2 routine):
 *
 *   Three possible paths, all ending with a common scan loop.
 *
 *   Path A (fast path 1): u32BE(0) == 0x0FFF0FE2
 *     u32BE(4) == 0x0FC40FA7  (A0 post-incremented to 8)
 *     u32BE(8) == 0x0F8B0F6E  (A0 stays at 8)
 *     → scan start = 8 + 284 = 292
 *
 *   Path B (fast path 2): u32BE(0) == 0x10000FE2
 *     Same secondary checks as Path A (offsets 4 and 8)
 *     → scan start = 8 + 284 = 292
 *
 *   Path C (standard path):
 *     u32BE(0) == 0x0F1C0F0E AND u32BE(4) == 0x0F000EF2 AND u32BE(8) == 0x0EE40ED6
 *     A0 advanced to 8 by post-increment reads, then lea 160(A0) → A0 = 168
 *     → scan start = 168 + 284 = 452
 *
 *   Final scan (common to all paths): Starting at the calculated scan offset,
 *   check 128 consecutive 2-byte positions:
 *     u32BE(pos) != 0x7F7F7F7F  AND  u16BE(pos) != 0xFFFF
 *     Advance pos by 2 each iteration.
 *
 * The grid: nuade's build pick (nw_scr_layout, by the hash of the replayer's 68000 code) names the command
 * table and track lists; seanConranGrid.ts decodes every command stream into byte-exact carrier rows and lays the
 * voices on one tick timeline (docs/FORMAT_COMMAND_STREAM_GRID.md). A module whose build nuade does not know gets
 * metadata only, with gridUnmatchedReason set. Playback is the vendored player, never this grid.
 *
 * References:
 *   third-party/uade-3.05/amigasrc/players/wanted_team/SeanConran/
 *     src/Sean Conran_v3.asm  (DTP_Check2 routine)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { seanConranEncoder } from '@/engine/uade/encoders/SeanConranEncoder';
import { scrLayout } from '@/engine/nuade/nuadeScrLayout';
import { buildScrGrid, SCR_ROWS_PER_PATTERN } from './seanConranGrid';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

// Minimum file size: for paths A/B we need scan start 292 + 128*2 = 548.
// For path C we need 452 + 128*2 = 708. Use 548 as the general minimum.
const MIN_FILE_SIZE = 548;

// Secondary check values common to paths A and B
const PATH_AB_CHECK4  = 0x0FC40FA7;
const PATH_AB_CHECK8  = 0x0F8B0F6E;

// Scan parameters
const SCAN_STEP       = 2;
const SCAN_ITERATIONS = 128;
const SCAN_ADDEND     = 284; // lea 284(A0), from the assembly source

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Sean Conran format module (SCR.*).
 *
 * Mirrors the DTP_Check2 routine from Sean Conran_v3.asm. Three entry paths
 * (A, B, C) determine a scan start offset; the common scan loop at that offset
 * then verifies 128 consecutive 2-byte positions are neither 0x7F7F7F7F nor
 * 0xFFFF.
 */
export function isSeanConranFormat(buf: Uint8Array): boolean {
  if (buf.length < MIN_FILE_SIZE) return false;

  const first = u32BE(buf, 0);

  let scanStart: number;

  if (first === 0x0FFF0FE2 || first === 0x10000FE2) {
    // Path A or Path B — verify secondary longwords at offsets 4 and 8
    if (u32BE(buf, 4) !== PATH_AB_CHECK4) return false;
    if (u32BE(buf, 8) !== PATH_AB_CHECK8) return false;
    scanStart = 8 + SCAN_ADDEND; // 292
  } else if (
    first === 0x0F1C0F0E &&
    u32BE(buf, 4) === 0x0F000EF2 &&
    u32BE(buf, 8) === 0x0EE40ED6
  ) {
    // Path C — lea 160(A0) after reading three longwords (A0 ends at 8)
    // A0 = 8 + 160 = 168
    scanStart = 168 + SCAN_ADDEND; // 452
  } else {
    return false;
  }

  // Final scan: 128 iterations of 2-byte steps starting at scanStart.
  // Each position must have u32BE != 0x7F7F7F7F AND u16BE != 0xFFFF.
  const scanEnd = scanStart + SCAN_ITERATIONS * SCAN_STEP;
  if (buf.length < scanEnd) return false;

  for (let pos = scanStart; pos < scanEnd; pos += SCAN_STEP) {
    if (u32BE(buf, pos) === 0x7F7F7F7F) return false;
    if (u16BE(buf, pos) === 0xFFFF)     return false;
  }

  return true;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Sean Conran module into a TrackerSong: subsong 0 as a tick grid (one row per player tick), each note
 * cell paired with the file offset of its pitch byte (`noteBytes`) for SeanConranExporter.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export async function parseSeanConranFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  if (!isSeanConranFormat(buf)) throw new Error('Not a Sean Conran module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^scr\./i, '').replace(/\.scr$/i, '') || baseName;
  const layout = await scrLayout(buf);
  const grid = layout && layout.trackLists.length > 0 ? buildScrGrid(buf, layout, 0) : null;

  const instruments: InstrumentConfig[] = Array.from({ length: grid?.instrumentCount ?? 1 }, (_, i) => ({
    id: i + 1,
    name: '',
    type: 'sample' as const,
    synthType: 'Sampler' as const,
    effects: [],
    volume: -6,
    pan: 0,
  } as InstrumentConfig));

  const blankRow = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
  const ticks = grid?.ticks ?? SCR_ROWS_PER_PATTERN;
  const patternCount = Math.max(1, Math.ceil(ticks / SCR_ROWS_PER_PATTERN));
  const patterns: Pattern[] = Array.from({ length: patternCount }, (_, p) => {
    const length = Math.min(SCR_ROWS_PER_PATTERN, ticks - p * SCR_ROWS_PER_PATTERN);
    return {
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length,
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
        rows: Array.from({ length }, (_, r) => {
          const cell = grid?.timeline[ch][p * SCR_ROWS_PER_PATTERN + r];
          return cell ? { ...cell } : blankRow();
        }),
      })),
    };
  });

  const song: TrackerSong = {
    name: `${moduleName} [Sean Conran]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 1,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
  if (!layout || !grid) {
    song.gridUnmatchedReason = layout ? 'the module has no subsong' : 'no known Sean Conran build matches the replayer code';
    return song;
  }

  // every tick that plays a stored note names its pitch byte; a stream played again shows the same byte again
  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  for (let ch = 0; ch < 4; ch++) {
    grid.biasAt[ch].forEach((offset, tick) => {
      const note = grid.timeline[ch][tick].note;
      if (offset < 0 || note === 0 || note === 97) return;
      noteBytes.push({ pattern: Math.floor(tick / SCR_ROWS_PER_PATTERN), channel: ch, row: tick % SCR_ROWS_PER_PATTERN, offset, note });
    });
  }
  song.uadePlayerTickGrid = true;
  song.uadeVariableLayout = {
    formatId: 'seanConran',
    numChannels: 4,
    numFilePatterns: grid.filePatternAddrs.length,
    rowsPerPattern: patterns.map((p) => p.length),
    moduleSize: buf.length,
    encoder: seanConranEncoder,
    filePatternAddrs: grid.filePatternAddrs,
    filePatternSizes: grid.filePatternSizes,
    trackMap: patterns.map(() => [-1, -1, -1, -1]),
    blockRows: grid.blockRows,
    noteBytes,
    propagateSharedCells: true,
  };
  return song;
}
