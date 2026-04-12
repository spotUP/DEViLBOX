/**
 * FashionTrackerParser.ts — Fashion Tracker Amiga music format native parser
 *
 * Fashion Tracker is an Amiga music format by Richard van der Veen (1988),
 * adapted by Wanted Team. Files are named with an "EX." prefix.
 *
 * Detection (from UADE FashionTracker.asm, DTP_Check2 routine):
 *   1. u32BE(0)  == 0x13FC0040  (MOVE.B #$40,abs.l — volume init)
 *   2. u32BE(8)  == 0x4E710439  (NOP; TRAP #9)
 *   3. u16BE(12) == 0x0001      (word constant == 1)
 *   4. u32BE(18) == 0x66F44E75  (BNE -12; RTS)
 *   5. u32BE(22) == 0x48E7FFFE  (MOVEM.L d0-d7/a0-a6,-(sp))
 *
 * These are specific 68k instruction sequences at fixed byte offsets in the
 * compiled executable, unique to this format.
 *
 * Binary layout:
 *   0x0000-0x0293: Player code (68k executable)
 *   0x0294-0x02D3: Song order table (128 bytes, one byte per position = pattern index)
 *   0x02D4+:       Pattern data (1024 bytes per pattern, standard MOD cell encoding:
 *                   4 bytes/cell × 4 channels × 64 rows)
 *   After patterns: Sample PCM data
 *
 * File prefix: "EX."  (e.g. "EX.songname")
 *
 * Single-file format: compiled 68k executable.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/FashionTracker-v1.0/FashionTracker.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell } from '@/types';
import type { InstrumentConfig } from '@/types/instrument';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell as decodeStdMODCell } from '@/engine/uade/encoders/MODEncoder';
import { periodToNoteIndex, amigaNoteToXM } from './AmigaUtils';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size: needs bytes through offset 25 (22 + 4 bytes = 26). */
const MIN_FILE_SIZE = 26;

/** Offset of the 128-byte song order table */
const SONG_ORDER_OFF = 0x0294;

/** Length of the song order table in bytes */
const SONG_ORDER_LEN = 128;

/** Offset where pattern data begins (immediately after order table) */
const PATTERN_DATA_OFF = SONG_ORDER_OFF + SONG_ORDER_LEN; // 0x0314

/** Rows per pattern */
const ROWS_PER_PATTERN = 64;

/** Number of channels */
const NUM_CHANNELS = 4;

/** Bytes per row (4 channels × 4 bytes/cell) */
const BYTES_PER_ROW = NUM_CHANNELS * 4;

/** Bytes per pattern (64 rows × 16 bytes/row) */
const PATTERN_SIZE = ROWS_PER_PATTERN * BYTES_PER_ROW; // 1024

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── MOD cell decoder ───────────────────────────────────────────────────────

/**
 * Decode a standard 4-byte ProTracker MOD cell.
 *
 * Cell encoding:
 *   byte[0] = (instrHi & 0xF0) | ((period >> 8) & 0x0F)
 *   byte[1] = period & 0xFF
 *   byte[2] = ((instrLo & 0x0F) << 4) | (effTyp & 0x0F)
 *   byte[3] = eff & 0xFF
 */
function decodeMODCell(buf: Uint8Array, off: number): TrackerCell {
  const b0 = buf[off];
  const b1 = buf[off + 1];
  const b2 = buf[off + 2];
  const b3 = buf[off + 3];

  const instrHi = b0 & 0xF0;
  const period  = ((b0 & 0x0F) << 8) | b1;
  const instrLo = (b2 >> 4) & 0x0F;
  const effTyp  = b2 & 0x0F;
  const eff     = b3;

  const instrument = instrHi | instrLo; // 0-31
  const amigaIdx   = periodToNoteIndex(period);
  const note       = amigaNoteToXM(amigaIdx);

  return {
    note,
    instrument,
    volume: 0,
    effTyp: (effTyp !== 0 || eff !== 0) ? effTyp : 0,
    eff:    (effTyp !== 0 || eff !== 0) ? eff : 0,
    effTyp2: 0,
    eff2: 0,
  };
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Fashion Tracker module.
 *
 * Detection mirrors DTP_Check2 from FashionTracker.asm:
 *   cmp.l #$13FC0040, (A0)    ; buf[0..3]
 *   cmp.l #$4E710439, 8(A0)   ; buf[8..11]
 *   cmp.w #1, 12(A0)          ; buf[12..13]
 *   cmp.l #$66F44E75, 18(A0)  ; buf[18..21]
 *   cmp.l #$48E7FFFE, 22(A0)  ; buf[22..25]
 */
export function isFashionTrackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  if (u32BE(buf, 0) !== 0x13fc0040) return false;
  if (u32BE(buf, 8) !== 0x4e710439) return false;
  if (u16BE(buf, 12) !== 0x0001) return false;
  if (u32BE(buf, 18) !== 0x66f44e75) return false;
  if (u32BE(buf, 22) !== 0x48e7fffe) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Fashion Tracker module file into a TrackerSong.
 *
 * Fashion Tracker modules are compiled 68k executables with embedded pattern
 * data in standard ProTracker MOD cell format. This parser extracts the song
 * order table, decodes all patterns, and creates placeholder instruments for
 * any sample indices referenced in pattern data.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseFashionTrackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isFashionTrackerFormat(buf)) {
    throw new Error('Not a Fashion Tracker module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "EX." prefix (case-insensitive) or .ex extension
  const moduleName = baseName.replace(/^ex\./i, '').replace(/\.ex$/i, '') || baseName;

  // ── Song order table ──────────────────────────────────────────────────────

  const songOrders: number[] = [];
  let maxPatIdx = 0;

  for (let i = 0; i < SONG_ORDER_LEN; i++) {
    const patIdx = buf[SONG_ORDER_OFF + i];
    songOrders.push(patIdx);
    if (patIdx > maxPatIdx) maxPatIdx = patIdx;
  }

  // Trim trailing zero entries to find actual song length.
  // Find the last non-zero entry (or keep at least 1 position).
  let songLength = SONG_ORDER_LEN;
  while (songLength > 1 && songOrders[songLength - 1] === 0) {
    songLength--;
  }
  const usedOrders = songOrders.slice(0, songLength);

  const numPatterns = maxPatIdx + 1;

  // Clamp to patterns that actually fit in the file
  const availablePatterns = Math.min(
    numPatterns,
    Math.floor((buf.length - PATTERN_DATA_OFF) / PATTERN_SIZE),
  );

  // ── Parse patterns ────────────────────────────────────────────────────────

  let maxSampleIdx = 0;
  const patterns: Pattern[] = [];

  for (let patIdx = 0; patIdx < availablePatterns; patIdx++) {
    const patOff = PATTERN_DATA_OFF + patIdx * PATTERN_SIZE;
    const channels: ChannelData[] = [];

    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const rows: TrackerCell[] = [];

      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cellOff = patOff + row * BYTES_PER_ROW + ch * 4;
        const cell = decodeMODCell(buf, cellOff);
        rows.push(cell);

        if (cell.instrument > maxSampleIdx) {
          maxSampleIdx = cell.instrument;
        }
      }

      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: (ch === 0 || ch === 3) ? -50 : 50, // Amiga LRRL panning
        instrumentId: null,
        color: null,
        rows,
      });
    }

    patterns.push({
      id: `pattern-${patIdx}`,
      name: `Pattern ${patIdx}`,
      length: ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat: 'MOD' as const,
        sourceFile: filename,
        importedAt: new Date().toISOString(),
        originalChannelCount: NUM_CHANNELS,
        originalPatternCount: availablePatterns,
        originalInstrumentCount: maxSampleIdx,
      },
    });
  }

  // ── Build song positions ──────────────────────────────────────────────────

  const songPositions: number[] = [];
  for (const patIdx of usedOrders) {
    if (patIdx < availablePatterns) {
      songPositions.push(patIdx);
    }
  }
  if (songPositions.length === 0) songPositions.push(0);

  // ── Instrument placeholders ───────────────────────────────────────────────
  // Sample PCM data follows pattern data; since Fashion Tracker is a compiled
  // 68k executable played by UADE, we create placeholder instruments for any
  // sample indices found in the pattern data. UADE handles actual sample playback.

  const numInstruments = Math.max(1, maxSampleIdx);
  const instruments: InstrumentConfig[] = [];

  for (let i = 1; i <= numInstruments; i++) {
    instruments.push({
      id: i,
      name: `Sample ${i}`,
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig);
  }

  // ── UADE pattern layout for chip RAM editing ──────────────────────────────

  const uadePatternLayout: UADEPatternLayout = {
    formatId: 'fashionTracker',
    patternDataFileOffset: PATTERN_DATA_OFF,
    bytesPerCell: 4,
    rowsPerPattern: ROWS_PER_PATTERN,
    numChannels: NUM_CHANNELS,
    numPatterns: availablePatterns,
    moduleSize: buf.length,
    encodeCell: encodeMODCell,
    decodeCell: decodeStdMODCell,
    getCellFileOffset: (pattern: number, row: number, channel: number): number => {
      return PATTERN_DATA_OFF + pattern * PATTERN_SIZE + row * BYTES_PER_ROW + channel * 4;
    },
  };

  return {
    name: `${moduleName} [Fashion Tracker]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePatternLayout,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  };
}
