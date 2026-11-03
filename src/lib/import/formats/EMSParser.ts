/**
 * EMS (Editeur Musical Sequentiel 1.24) parser.
 *
 * Format (from third-party/nuade/players/ems/ems.c): byte 1, a version byte (<= 0x25), the position count and the
 * highest pattern number (u16 each), a 0x80-byte position list of pattern numbers, four bytes, fifteen 12-byte
 * instrument records (0x86), then from 0x13A the patterns, each 64 rows of 4 voices x 4 bytes:
 * period (u16), instrument << 4 | effect, parameter.
 *
 * The stored period is the note. The grid shows the nearest table note; encodeCell keeps the stored period whenever the
 * cell's grid note is unchanged, so slide targets and off-table periods survive an edit of another field and the file
 * stays byte-exact. Cells keep their file offsets through uadePatternLayout, so edits patch only the changed cells.
 *
 * Not EMS v6 ("E.M.S. V6.05" tag, shares the .ems extension): that one fails the header test and stays with UADE.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { periodToNote, cellPeriod } from '@/lib/amiga/periodNotes';

const POSITION_COUNT_OFFSET = 2;
const PATTERN_MAX_OFFSET = 4;
const POSITION_LIST_OFFSET = 6;
const POSITION_LIST_SIZE = 0x80;
const PATTERNS_OFFSET = 0x13a;
const ROWS = 64;
const VOICES = 4;
const CELL_BYTES = 4;
const ROW_BYTES = VOICES * CELL_BYTES;
const PATTERN_BYTES = ROWS * ROW_BYTES;
const PATTERN_LIMIT = 0x3f;
const VERSION_LIMIT = 0x25;
const DEFAULT_SPEED = 6;
const INSTRUMENT_COUNT = 15;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

/** True when the header passes the EMS player's own check (first byte 1, bounded version, position list within the highest pattern). */
export function isEMSFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length <= PATTERNS_OFFSET + PATTERN_BYTES) return false;
  const positionCount = u16BE(buf, POSITION_COUNT_OFFSET);
  const patternMax = u16BE(buf, PATTERN_MAX_OFFSET);
  if (buf[0] !== 1 || buf[1] > VERSION_LIMIT || positionCount === 0 || positionCount > POSITION_LIST_SIZE || patternMax > PATTERN_LIMIT) return false;
  for (let i = 0; i < POSITION_LIST_SIZE; i++) if (buf[POSITION_LIST_OFFSET + i] > patternMax) return false;
  let periods = 0;
  for (let i = 0; i < ROWS * VOICES; i++) {
    const period = u16BE(buf, PATTERNS_OFFSET + i * CELL_BYTES);
    if (period & 0x8000) return false;
    if (period !== 0) periods++;
  }
  return periods > 0;
}

/** Stored cell bytes to a grid cell. */
export function decodeEMSCell(bytes: Uint8Array): TrackerCell {
  return {
    note: periodToNote(u16BE(bytes, 0)),
    instrument: bytes[2] >> 4,
    volume: 0,
    effTyp: bytes[2] & 0x0f,
    eff: bytes[3],
    effTyp2: 0,
    eff2: 0,
  };
}

/** Grid cell to stored bytes; the stored period is kept while it still names the cell's note. */
export function encodeEMSCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const out = new Uint8Array(CELL_BYTES);
  const keep = stored !== undefined && decodeEMSCell(stored).note === cell.note;
  const period = keep ? u16BE(stored, 0) : cellPeriod({ note: cell.note });
  out[0] = period >> 8;
  out[1] = period & 0xff;
  out[2] = ((cell.instrument & 0x0f) << 4) | (cell.effTyp & 0x0f);
  out[3] = cell.eff & 0xff;
  return out;
}

export function parseEMSFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isEMSFormat(buf)) throw new Error('Not an EMS module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^ems\./i, '').replace(/\.ems$/i, '') || baseName;

  const positionCount = u16BE(buf, POSITION_COUNT_OFFSET);
  const patternMax = u16BE(buf, PATTERN_MAX_OFFSET);
  const patternCount = Math.min(patternMax + 1, Math.floor((buf.length - PATTERNS_OFFSET) / PATTERN_BYTES));
  const patternBase = (p: number): number => PATTERNS_OFFSET + p * PATTERN_BYTES;

  const patterns = Array.from({ length: patternCount }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
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
        const off = patternBase(p) + row * ROW_BYTES + ch * CELL_BYTES;
        return decodeEMSCell(buf.subarray(off, off + CELL_BYTES));
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: VOICES,
      originalPatternCount: patternCount,
      originalInstrumentCount: INSTRUMENT_COUNT,
    },
  }));

  const songPositions: number[] = [];
  for (let o = 0; o < positionCount; o++) {
    const p = buf[POSITION_LIST_OFFSET + o];
    songPositions.push(p < patternCount ? p : 0);
  }

  const instruments: InstrumentConfig[] = Array.from({ length: INSTRUMENT_COUNT }, (_, i) => ({
    id: i + 1,
    name: '',
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig));

  const layout: UADEPatternLayout = {
    formatId: 'ems',
    patternDataFileOffset: PATTERNS_OFFSET,
    bytesPerCell: CELL_BYTES,
    rowsPerPattern: ROWS,
    numChannels: VOICES,
    numPatterns: patternCount,
    moduleSize: buffer.byteLength,
    encodeCell: encodeEMSCell,
    encodeOverStored: true,
    decodeCell: decodeEMSCell,
    getCellFileOffset: (pattern, row, channel) => patternBase(pattern) + row * ROW_BYTES + channel * CELL_BYTES,
  };

  return {
    name: `${moduleName} [EMS]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: VOICES,
    initialSpeed: DEFAULT_SPEED,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: layout,
  };
}
