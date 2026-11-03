/**
 * MCMDParser.ts - the MCMD module ("MCMD player module V1.0") as an editable grid.
 *
 * Layout (nuade players/mcmd/mcmd.c): "MCMD", seven big-endian counts (frequency sequences, volume sequences, patterns,
 * track rows, pattern size in bytes, subsongs, samples), then the tables in that order: frequency sequences and volume
 * sequences (64 bytes each), patterns (one fixed size, rows of two bytes: note, info), track rows (12 bytes: pattern,
 * note transpose, command for each of the four voices), subsongs (8 bytes) and samples (28 bytes).
 *
 * The grid is the first subsong: one grid pattern per track row, four channels, one grid row per pattern row. The cell
 * of a row is the two bytes it holds, so an edit lands in the pattern pool where the replayer reads it. A pattern that
 * several voices or track rows share shows once per use; an edit to one use is saved into the shared bytes.
 *
 * Cell: note byte bits 0-6 = note index (0 none, 1 pattern end, 2.. a note; shown as XM note = index + 1, the CoSo
 * convention where index 12 = C-1), bit 7 = keep the running instrument. Info byte bits 0-5 = instrument (volume
 * sequence number, shown + 1), bit 6 = portamento, bit 7 = alternative frequency sequence; both flags and the
 * parameter an info byte carries on a row without a note are kept from the stored bytes.
 */
import type { TrackerCell, Pattern, InstrumentConfig } from '@/types';
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';

const HEADER_SIZE = 0x12;
const SEQUENCE_SIZE = 64;
const TRACK_ROW_SIZE = 12;
const SUBSONG_SIZE = 8;
const SAMPLE_SIZE = 28;
const ROW_SIZE = 2;
const VOICES = 4;
const NOTE_MASK = 0x7F;
const NOTE_PATTERN_END = 1;
const NOTE_NO_INSTRUMENT = 0x80;
const INFO_INSTRUMENT = 0x3F;
const MAX_TABLE_SIZE = 0x7FFF;

interface McmdTables {
  patterns: number;
  patternCount: number;
  patternSize: number;
  tracks: number;
  trackRows: number;
  subsongs: number;
  vseqCount: number;
  first: number;
  last: number;
  speed: number;
}

function be16(b: Uint8Array, o: number): number {
  return ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
}

/** The table offsets, or null when the module is not one the nuade port takes. */
function layoutTables(b: Uint8Array): McmdTables | null {
  if (b.length < HEADER_SIZE || b[0] !== 0x4D || b[1] !== 0x43 || b[2] !== 0x4D || b[3] !== 0x44) return null;
  const fseqCount = be16(b, 4), vseqCount = be16(b, 6), patternCount = be16(b, 8), trackRows = be16(b, 10);
  const patternSize = be16(b, 12), subsongCount = be16(b, 14), sampleCount = be16(b, 16);
  const sizes = [fseqCount * SEQUENCE_SIZE, vseqCount * SEQUENCE_SIZE, patternCount * patternSize,
    trackRows * TRACK_ROW_SIZE, subsongCount * SUBSONG_SIZE, sampleCount * SAMPLE_SIZE];
  if (sizes.some((s) => s > MAX_TABLE_SIZE)) return null;
  if (patternSize === 0 || patternSize % ROW_SIZE !== 0 || subsongCount === 0) return null;
  const vseqs = HEADER_SIZE + sizes[0];
  const patterns = vseqs + sizes[1];
  const tracks = patterns + sizes[2];
  const subsongs = tracks + sizes[3];
  const sampleData = subsongs + sizes[4] + sizes[5];
  if (sampleData > b.length) return null;
  const first = be16(b, subsongs), last = be16(b, subsongs + 2), loop = be16(b, subsongs + 6);
  if (!(first <= loop && loop <= last && last < trackRows)) return null;
  return { patterns, patternCount, patternSize, tracks, trackRows, subsongs, vseqCount, first, last, speed: be16(b, subsongs + 4) };
}

export function isMcmdFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  return layoutTables(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)) !== null;
}

/** Decode a row's two bytes. A note index below 2 or above 95 has no XM note and shows empty; the encoder keeps its bytes. */
export function decodeMcmdCell(bytes: Uint8Array): TrackerCell {
  const index = (bytes[0] ?? 0) & NOTE_MASK;
  const hasNote = index > NOTE_PATTERN_END && index + 1 <= 96;
  return {
    note: hasNote ? index + 1 : 0,
    instrument: hasNote ? ((bytes[1] ?? 0) & INFO_INSTRUMENT) + 1 : 0,
    volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  };
}

/** Encode a cell over the row's stored bytes; fields the grid does not show (flags, parameter, no-instrument bit) are kept. */
export function encodeMcmdCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const out = new Uint8Array(ROW_SIZE);
  const s0 = stored?.[0] ?? 0, s1 = stored?.[1] ?? 0;
  const shown = decodeMcmdCell(stored ?? out);
  if (cell.note === shown.note && cell.instrument === shown.instrument) {
    out[0] = s0; out[1] = s1;
    return out;
  }
  if (cell.note <= 0) {
    // Cleared note: the note byte goes, the info byte stays (it may be the parameter of a portamento row).
    out[0] = 0; out[1] = s1;
    return out;
  }
  const keepsInstrument = (s0 & NOTE_PATTERN_END) !== 0 ? 0 : s0 & NOTE_NO_INSTRUMENT;
  out[0] = ((cell.note - 1) & NOTE_MASK) | keepsInstrument;
  const instrument = Math.max(1, cell.instrument || 1) - 1;
  out[1] = (s1 & ~INFO_INSTRUMENT & 0xFF) | (instrument & INFO_INSTRUMENT);
  return out;
}

export function parseMcmdFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const b = new Uint8Array(buffer);
  const t = layoutTables(b);
  if (!t) throw new Error('Not an MCMD module');
  const rowsPerPattern = t.patternSize / ROW_SIZE;
  const trackRowCount = t.last - t.first + 1;
  const patternAt = (trackRow: number, voice: number): number =>
    b[t.tracks + (t.first + trackRow) * TRACK_ROW_SIZE + voice * 3] ?? 0;
  const cellOffset = (pattern: number, row: number, channel: number): number => {
    if (pattern < 0 || pattern >= trackRowCount || row < 0 || row >= rowsPerPattern || channel < 0 || channel >= VOICES) return -1;
    const pool = patternAt(pattern, channel);
    return pool >= t.patternCount ? -1 : t.patterns + pool * t.patternSize + row * ROW_SIZE;
  };

  const baseName = filename.split('/').pop() ?? filename;
  const patterns: Pattern[] = Array.from({ length: trackRowCount }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Track row ${t.first + p}`,
    length: rowsPerPattern,
    channels: Array.from({ length: VOICES }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Voice ${ch + 1}`,
      muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: Array.from({ length: rowsPerPattern }, (_, r) => {
        const off = cellOffset(p, r, ch);
        return off < 0 ? decodeMcmdCell(new Uint8Array(ROW_SIZE)) : decodeMcmdCell(b.subarray(off, off + ROW_SIZE));
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: VOICES,
      originalPatternCount: trackRowCount,
      originalInstrumentCount: t.vseqCount,
    },
  }));

  const instruments: InstrumentConfig[] = Array.from({ length: Math.max(1, t.vseqCount) }, (_, i) => ({
    id: i + 1, name: `MCMD ${i + 1}`, type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const layout: UADEPatternLayout = {
    formatId: 'mcmd',
    patternDataFileOffset: t.patterns,
    bytesPerCell: ROW_SIZE,
    rowsPerPattern,
    numChannels: VOICES,
    numPatterns: trackRowCount,
    moduleSize: buffer.byteLength,
    encodeCell: encodeMcmdCell,
    encodeOverStored: true,
    decodeCell: decodeMcmdCell,
    getCellFileOffset: cellOffset,
  };

  return {
    name: `${baseName.replace(/\.[^/.]+$/, '')} [MCMD]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: trackRowCount,
    restartPosition: 0,
    numChannels: VOICES,
    initialSpeed: Math.max(1, t.speed),
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename,
    uadePatternLayout: layout,
  };
}
