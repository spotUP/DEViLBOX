/**
 * EMS v6 ("E.M.S. V6.05", Editeur Musical Sequentiel, shares the .ems extension with EMS 1.24) parser.
 *
 * Format (from third-party/nuade/players/emsv6/emsv6_sequencer.c and the perception.ems fixture): the tag at 0, the sub-song
 * count (u16) at 0x0C, the byte sizes (u32) of the arpeggio, sub-song and pattern sections at 0x0E / 0x12 / 0x16, then from
 * 0x22 the arpeggios, the sub-songs, the patterns (a u32 offset table, then command streams) and the instruments. A sub-song
 * is a u16 channel count and 32 u32 track-list offsets (relative to the sub-song) from +4. A track list is u16 words: a
 * pattern number, 0xFFFF + position (loop), 0xFFFE (end), 0xFDnn transpose, 0xFCnn instrument shift, 0xFBnn repeat (nn plays),
 * 0xFAnn + word master fade. A pattern is a command stream: a note byte (< 0xEF), or 0xEF..0xFF commands of 1..5 bytes.
 *
 * The grid is a reading of the player (a simulation, like SidMon II): sub-song 0, each channel's list walked once (repeats
 * followed, stopped at the loop or end), and a note, glide or tie lasting `track speed` rows (one row = one sequencer step).
 * A note cell sits on the first row of its event. Each representable note cell carries the file byte of the command that
 * played it (`noteBytes`); the exporter moves that byte by the cell's change. Not editable: instruments, volumes, effects, the
 * length of an event, notes below grid note 1 (period table index < 36) and note-offs. The fine-tune command is ignored for the
 * pitch shown. Tempo commands change the playing speed only, not the row structure. A pattern shared by several plays shares its
 * note bytes, so editing one play edits them all (the first edited cell wins).
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout, VariableLengthEncoder } from '@/engine/uade/UADEPatternEncoder';
import { registerVariableEncoder } from '@/engine/uade/UADEPatternEncoder';
import { periodToNote } from '@/lib/amiga/periodNotes';

const TAG = 'E.M.S. V6';
const SUBSONG_COUNT_OFFSET = 0x0c;
const ARPEGGIO_SIZE_OFFSET = 0x0e;
const SUBSONG_SIZE_OFFSET = 0x12;
const PATTERN_SIZE_OFFSET = 0x16;
const HEADER_SIZE = 0x22;
const TRACK_LIST_TABLE = 4;
const VOICES = 4;
const ROWS = 64;
const INSTRUMENTS = 64;
const MAX_ROWS = 4096;
const MAX_STEPS = 8192;
const NOTE_MASK = 0x7f;
/** Period table index of the first note the grid can show (grid note 1). */
const FIRST_INDEX = 36;
/** Period table index 60 plays period 428; the grid names that note by the shared period table. */
const GRID_NOTE_OFFSET = periodToNote(428) - 60;
const NOTE_OFF = 97;

const u16 = (b: Uint8Array, o: number): number => (o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0xfffe);
const u32 = (b: Uint8Array, o: number): number => (o + 3 < b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : 0);

export function isEMSv6Format(buffer: ArrayBuffer | Uint8Array): boolean {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (b.length < HEADER_SIZE) return false;
  for (let i = 0; i < TAG.length; i++) if (b[i] !== TAG.charCodeAt(i)) return false;
  const arp = u32(b, ARPEGGIO_SIZE_OFFSET);
  const sub = u32(b, SUBSONG_SIZE_OFFSET);
  const pat = u32(b, PATTERN_SIZE_OFFSET);
  return u16(b, SUBSONG_COUNT_OFFSET) > 0 && sub >= 0x84 && HEADER_SIZE + arp + sub + pat <= b.length;
}

/** Byte length of the pattern command whose code is at `b[at]`. */
function commandLength(code: number): number {
  if (code < 0xef) return 1;
  switch (code) {
    case 0xef: return 2;
    case 0xf0: case 0xf1: return 1;
    case 0xf2: return 5;
    case 0xf3: return 3;
    case 0xf4: return 2;
    case 0xf5: return 3;
    case 0xf6: return 1;
    case 0xf7: return 5;
    case 0xf8: return 4;
    case 0xf9: return 2;
    case 0xfa: case 0xfb: return 5;
    case 0xfc: case 0xfd: case 0xfe: return 2;
    default: return 1;
  }
}

interface NoteEvent { rowStart: number; note: number; instrument: number; offset: number | null; shown: number }
interface ChannelRead { events: NoteEvent[]; rows: number }

function walkChannel(b: Uint8Array, listAbs: number, patternBase: number, patternCount: number): ChannelRead {
  const events: NoteEvent[] = [];
  let rows = 0;
  let lp = 0;
  let transpose = 0, shift = 0, instrument = 0, repeat = 0, speed = 1, skip = 0;
  let steps = 0;
  const push = (offset: number | null, noteByte: number | null): void => {
    const span = speed === 0 ? 256 : speed;
    if (noteByte !== null) {
      const index = ((noteByte + transpose) & 0xff) & NOTE_MASK;
      let note = 0;
      if (index >= 97) note = NOTE_OFF;
      else if (index >= FIRST_INDEX) note = index + GRID_NOTE_OFFSET;
      events.push({ rowStart: rows, note, instrument: instrument + 1, offset: note >= 1 && note < NOTE_OFF ? offset : null, shown: note });
    }
    rows += span;
  };
  while (rows < MAX_ROWS && steps++ < MAX_STEPS) {
    let word = u16(b, listAbs + lp);
    let stop = false;
    while ((word & 0x8000) !== 0 && steps++ < MAX_STEPS) {
      const hi = word >> 8, lo = word & 0xff;
      if (word === 0xffff || word === 0xfffe) { stop = true; break; }
      if (hi === 0xfd) { transpose = lo; lp += 2; }
      else if (hi === 0xfc) { shift = lo; lp += 2; }
      else if (hi === 0xfb) { repeat = (lo - 1) & 0xff; lp += 2; }
      else if (hi === 0xfa) { lp += 4; }
      else { stop = true; break; }
      word = u16(b, listAbs + lp);
    }
    if (stop || word >= patternCount) break;
    const pat = patternBase + u32(b, patternBase + word * 4);
    let pos = 0;
    let ended = false;
    while (!ended && rows < MAX_ROWS && steps++ < MAX_STEPS) {
      const at = pat + pos;
      if (at >= b.length) { ended = true; break; }
      const code = b[at];
      if (code < 0xef) {
        push(at, code);
        if (skip !== 0) skip--; else pos += 1;
        continue;
      }
      switch (code) {
        case 0xff:
          pos = 0;
          if (repeat === 0) lp += 2; else repeat--;
          ended = true;
          break;
        case 0xfe: instrument = (b[at + 1] + shift) & 0x3f; pos += 2; break;
        case 0xfd: speed = b[at + 1]; pos += 2; break;
        case 0xfa: case 0xfb: push(at, b[at + 1]); pos += 5; break;
        case 0xf6: push(null, null); pos += 1; break;
        case 0xf4: skip = (b[at + 1] - 1) & 0xff; pos += 2; break;
        default: pos += commandLength(code);
      }
    }
    if (!ended) break;
  }
  return { events, rows: Math.min(rows, MAX_ROWS) };
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** The block of a pattern as the carriers hold it: every byte, verbatim. */
export const emsV6Encoder: VariableLengthEncoder = {
  formatId: 'emsv6',
  encodePattern(rows: TrackerCell[]): Uint8Array {
    return Uint8Array.from(rows, (r) => (r.period ?? 0) & 0xff);
  },
  canEncode(rows: TrackerCell[]): boolean {
    return rows.every((r) => r.cutoff === 1);
  },
};
registerVariableEncoder(emsV6Encoder);

export function parseEMSv6File(buffer: ArrayBuffer, filename: string): TrackerSong {
  const b = new Uint8Array(buffer);
  if (!isEMSv6Format(b)) throw new Error('Not an EMS v6 module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^emsv6\./i, '').replace(/\.ems$/i, '') || baseName;

  const arpSize = u32(b, ARPEGGIO_SIZE_OFFSET);
  const subSize = u32(b, SUBSONG_SIZE_OFFSET);
  const patSize = u32(b, PATTERN_SIZE_OFFSET);
  const subBase = HEADER_SIZE + arpSize;
  const patternBase = subBase + subSize;
  const patternCount = Math.floor(u32(b, patternBase) / 4);
  const channels = Math.min(VOICES, u16(b, subBase));

  const reads: ChannelRead[] = [];
  for (let c = 0; c < VOICES; c++) {
    const rel = c < channels ? u32(b, subBase + TRACK_LIST_TABLE + c * 4) : 0;
    reads.push(c < channels && rel > 0 && subBase + rel + 2 <= b.length
      ? walkChannel(b, subBase + rel, patternBase, patternCount)
      : { events: [], rows: 0 });
  }
  const longest = Math.max(...reads.map((r) => r.rows), 1);
  const patternTotal = Math.ceil(longest / ROWS);

  const grid: TrackerCell[][][] = Array.from({ length: patternTotal }, () =>
    Array.from({ length: VOICES }, () => Array.from({ length: ROWS }, emptyCell)));
  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  reads.forEach((r, ch) => {
    for (const e of r.events) {
      if (e.rowStart >= patternTotal * ROWS) continue;
      const pattern = Math.floor(e.rowStart / ROWS), row = e.rowStart % ROWS;
      const cell = grid[pattern][ch][row];
      cell.note = e.note;
      cell.instrument = e.instrument;
      if (e.offset !== null) noteBytes.push({ pattern, channel: ch, row, offset: e.offset, note: e.note });
    }
  });

  const trackerPatterns = grid.map((chs, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: ROWS,
    channels: chs.map((rows, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: VOICES,
      originalPatternCount: patternTotal,
      originalInstrumentCount: INSTRUMENTS,
    },
  }));

  const instruments: InstrumentConfig[] = Array.from({ length: INSTRUMENTS }, (_, i) => ({
    id: i + 1,
    name: '',
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig));

  // Per-byte carriers: every file pattern's command stream verbatim (the block the encoder writes back).
  const filePatternAddrs: number[] = [];
  const filePatternSizes: number[] = [];
  const starts = Array.from({ length: patternCount }, (_, i) => patternBase + u32(b, patternBase + i * 4));
  const patternEnd = Math.min(patternBase + patSize, b.length);
  for (let i = 0; i < patternCount; i++) {
    const next = i + 1 < patternCount ? starts[i + 1] : patternEnd;
    filePatternAddrs.push(starts[i]);
    filePatternSizes.push(Math.max(0, Math.min(next, b.length) - starts[i]));
  }
  const blockRows: TrackerCell[][] = filePatternAddrs.map((addr, i) => {
    const cells: TrackerCell[] = [];
    for (let k = 0; k < filePatternSizes[i]; k++) {
      cells.push({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, cutoff: 1, period: b[addr + k] });
    }
    return cells;
  });

  const layout: UADEVariablePatternLayout = {
    formatId: 'emsv6',
    numChannels: VOICES,
    numFilePatterns: patternCount,
    rowsPerPattern: ROWS,
    moduleSize: buffer.byteLength,
    encoder: emsV6Encoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap: trackerPatterns.map(() => reads.map(() => -1)),
    blockRows,
    noteBytes,
    propagateSharedCells: true,
  };

  return {
    name: `${moduleName} [EMS v6]`,
    format: 'MOD' as TrackerFormat,
    patterns: trackerPatterns,
    instruments,
    songPositions: trackerPatterns.map((_, i) => i),
    songLength: trackerPatterns.length,
    restartPosition: 0,
    numChannels: VOICES,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadeVariableLayout: layout,
  };
}
