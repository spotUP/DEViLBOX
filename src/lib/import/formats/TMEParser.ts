/**
 * TMEParser.ts — The Musical Enlightenment (TME) Amiga music format native parser
 *
 * TME is an Amiga music format created by N.J. Luuring jr (1989-90),
 * adapted by Wanted Team for EaglePlayer / DeliTracker compatibility.
 * Files are typically named with a "TME." prefix (e.g. "TME.SomeSong").
 *
 * Detection (from DTP_Check2 in TME_v3.s):
 *   1. File must be >= 7000 bytes
 *   2. buf[0] must equal 0 (first byte is zero)
 *   3. At least one of the following structural patterns must match:
 *      Pattern 1: u32BE(0x3C) == 0x0000050F  AND  u32BE(0x40) == 0x0000050F
 *      Pattern 2: u32BE(0x1284) == 0x00040B11 AND u32BE(0x1188) == 0x181E2329
 *                 AND u32BE(0x128C) == 0x2F363C41
 *   (The 7000-byte minimum implies the file is always large enough for pattern 2
 *   checks at offset 0x1290 = 4752, so both patterns are checked unconditionally.)
 *
 * Metadata extraction (from DTP_InitPlayer in TME_v3.s):
 *   Subsong count: read buf[5] (second byte of the longword at offset 4).
 *   Valid range is 0-15; a value of 0 means one subsong (slot 0 only).
 *   Total subsong count = buf[5] + 1, clamped to 1-16.
 *
 * Single-file format: player code + music data in one binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/TME/src/TME_v3.s
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { decodeTmeCell, encodeTmeCell, tmeStoredNote, TME_STEP_SIZE } from '@/engine/uade/encoders/TMEEncoder';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size required by DTP_Check2. */
const MIN_FILE_SIZE = 7000;

/** Layout (third-party/nuade/players/musicalenlightenment/musicalenlightenment.c): 32 instrument records of 128 bytes. */
const INSTRUMENT_COUNT = 32;
const INSTRUMENTS_OFFSET = 0x44;
const INSTRUMENT_SIZE = 0x80;
/** The instrument name: a NUL-terminated string in the record at +0x18 (32 bytes). */
const INSTRUMENT_NAME_AT = 0x18;
const POSITION_COUNT_OFFSET = 0x1a84;
const STEP_COUNT_OFFSET = 0x1a86;
const POSITIONS_OFFSET = 0x1aaa;
const VOICES = 4;
const POSITION_SIZE = VOICES * 3;
const ROWS = 32;
const TRACK_SIZE = ROWS * TME_STEP_SIZE;
const FLAG_ABSOLUTE_NOTE = 0x04;

/** Maximum subsong count (slots 0-15 → max 16 subsongs). */
const MAX_SUBSONGS = 16;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return (buf[off] << 8) | buf[off + 1];
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a The Musical Enlightenment (TME) module.
 *
 * Detection mirrors DTP_Check2 from TME_v3.s:
 *   - File length >= 7000 bytes
 *   - First byte is 0x00
 *   - Structural magic matches Pattern 1 or Pattern 2
 */
export function isTMEFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (buf.length < MIN_FILE_SIZE) return false;
  if (buf[0] !== 0x00) return false;

  // Pattern 1: u32BE(0x3C) == 0x0000050F AND u32BE(0x40) == 0x0000050F
  const pattern1 =
    u32BE(buf, 0x3c) === 0x0000050f &&
    u32BE(buf, 0x40) === 0x0000050f;

  if (pattern1) return true;

  // Pattern 2: u32BE(0x1284) == 0x00040B11 AND u32BE(0x1188) == 0x181E2329
  //            AND u32BE(0x128C) == 0x2F363C41
  // (0x1290 = 4752 < 7000, so these offsets are always in bounds)
  const pattern2 =
    u32BE(buf, 0x1284) === 0x00040b11 &&
    u32BE(buf, 0x1188) === 0x181e2329 &&
    u32BE(buf, 0x128c) === 0x2f363c41;

  return pattern2;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a TME module file into a TrackerSong.
 *
 * Extracts the subsong count from the binary header and builds 31 placeholder
 * instruments. Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseTMEFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isTMEFormat(buf)) {
    throw new Error('Not a TME module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "TME." prefix (case-insensitive) or ".tme" extension
  const moduleName =
    baseName.replace(/^tme\./i, '').replace(/\.tme$/i, '') || baseName;

  // ── Metadata extraction ───────────────────────────────────────────────────

  // From InitPlayer: subsong slots are encoded in byte 5 (second byte of the
  // longword at offset 4). Valid range is 0-15; add 1 for total subsong count.
  const rawSubsongs = buf[5];
  const subsongCount = Math.min(Math.max(rawSubsongs + 1, 1), MAX_SUBSONGS);

  // ── Instruments: the names the module stores ────────────────────────────

  const instruments: InstrumentConfig[] = Array.from({ length: INSTRUMENT_COUNT }, (_, i) => {
    const at = INSTRUMENTS_OFFSET + i * INSTRUMENT_SIZE + INSTRUMENT_NAME_AT;
    let name = '';
    for (let j = 0; j < 32 && buf[at + j] !== 0; j++) {
      const c = buf[at + j];
      if (c >= 0x20 && c < 0x7f) name += String.fromCharCode(c);
    }
    return { id: i + 1, name, type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig;
  });

  // ── Grid: one pattern per position, four voices of the position's tracks (32 rows) ──

  const positionCount = Math.min(u16BE(buf, POSITION_COUNT_OFFSET), Math.floor((buf.length - POSITIONS_OFFSET) / POSITION_SIZE));
  const stepsOffset = POSITIONS_OFFSET + u16BE(buf, POSITION_COUNT_OFFSET) * POSITION_SIZE;
  const stepCount = u16BE(buf, STEP_COUNT_OFFSET);
  const trackOf = (pos: number, ch: number) => buf[POSITIONS_OFFSET + pos * POSITION_SIZE + ch * 3];
  const stepAt = (pos: number, row: number, ch: number): number => {
    const off = stepsOffset + trackOf(pos, ch) * TRACK_SIZE + row * TME_STEP_SIZE;
    return off + TME_STEP_SIZE <= buf.length && off + TME_STEP_SIZE <= stepsOffset + stepCount * TME_STEP_SIZE ? off : -1;
  };
  // The position's note transpose moves a step's note unless the step is absolute; release/stop notes do not move.
  const noteOffset = (pattern: number, row: number, channel: number): number | null => {
    const off = stepAt(pattern, row, channel);
    if (off < 0) return 0;
    const n = tmeStoredNote(buf[off]);
    if (n === 97) return null;
    if (buf[off + 4] & FLAG_ABSOLUTE_NOTE) return 0;
    return (buf[POSITIONS_OFFSET + pattern * POSITION_SIZE + channel * 3 + 2] << 24) >> 24;
  };

  const empty = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  const patterns: Pattern[] = Array.from({ length: positionCount }, (_, pos) => ({
    id: `pattern-${pos}`,
    name: `Position ${pos}`,
    length: ROWS,
    channels: Array.from({ length: VOICES }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: ROWS }, (_, row) => {
        const off = stepAt(pos, row, ch);
        if (off < 0) return { ...empty };
        const cell = decodeTmeCell(buf.subarray(off, off + TME_STEP_SIZE));
        const shift = noteOffset(pos, row, ch) ?? 0;
        if (cell.note > 0 && shift !== 0) cell.note = Math.min(96, Math.max(1, cell.note + shift));
        return cell;
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: VOICES,
      originalPatternCount: positionCount,
      originalInstrumentCount: INSTRUMENT_COUNT,
    },
  })) as Pattern[];

  const layout: UADEPatternLayout = {
    formatId: 'tme',
    patternDataFileOffset: stepsOffset,
    bytesPerCell: TME_STEP_SIZE,
    rowsPerPattern: ROWS,
    numChannels: VOICES,
    numPatterns: positionCount,
    moduleSize: buf.length,
    encodeCell: encodeTmeCell,
    decodeCell: decodeTmeCell,
    getCellFileOffset: stepAt,
    propagateSharedCells: true,
    noteOffset,
  };

  const nameParts: string[] = [`${moduleName} [TME]`];
  if (subsongCount > 1) nameParts.push(`(${subsongCount} subsongs)`);

  return {
    name: nameParts.join(' '),
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: VOICES,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: layout,
  };
}
