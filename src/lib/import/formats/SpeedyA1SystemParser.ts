/**
 * SpeedyA1SystemParser.ts - Speedy A1 System (.sas) song as an editable grid (third-party/nuade/players/speedya1system,
 * sa_internal.h). Layout: header of four longs (speed, start position, end position, 0x200); order list at 0x10 with 8
 * bytes per position (a pattern number word per voice, 0xFFFF ends the song); patterns at 0x1010, 16 cells of 3 bytes each.
 * A note cell is [byte, delays, sample]; byte < 0x50 indexes the replayer's period table (0 entries are no note), 0x50..0xFE
 * is an effect and 0xFF ends the song. The grid is the order list as it plays: one display pattern per position. Every
 * played file pattern is a block of 16 carrier rows (the three file bytes), so unedited blocks encode back byte-exact;
 * `noteBytes` pair each note cell with its file byte for the exporter. Period slides 0x50/0x51 show as MOD 2xx/1xx
 * (amount low byte; `columnBytes` name that byte); other effects and the delays are not shown or edited.
 * Pitch: the replayer writes the table period to Paula unchanged, so the grid note is periodToNote(period).
 */
import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { speedyA1Encoder } from '@/engine/uade/encoders/SpeedyA1Encoder';
import { periodToNote } from '@/lib/amiga/periodNotes';

const NUM_CHANNELS = 4;
export const SA1_ROWS = 16;
const ORDER_OFFSET = 0x10;
const PATTERNS_OFFSET = 0x1010;
const PATTERN_BYTES = 0x30;
const CELL_BYTES = 3;
const ORDER_END = 0xffff;
const END_CELL = 0xff;
const EFFECT_FIRST = 0x50;
/** Effect byte -> grid effect: 0x50 adds to the period every tick (pitch down, MOD 2xx), 0x51 subtracts (pitch up, MOD 1xx). */
export const SA1_SLIDE_EFFTYP: Readonly<Record<number, number>> = { 0x50: 2, 0x51: 1 };
const TAG = 0x200;
const FORM_TAG = 0x464f524d;
const TABLES_TO_FORM = 0x280;
const MAX_POSITIONS = 512;
const MAX_SAMPLE = 0x1f;

/** The replayer's period table (sa_module.c k_periods): 16 entries per octave, 0 where the number is not a note. */
export const SA1_PERIODS: readonly number[] = [
  0, 3416, 3232, 3048, 2872, 2712, 2360, 2416, 2280, 2152, 2032, 1920, 1808, 1712, 0, 0,
  0, 1708, 1616, 1524, 1436, 1356, 1280, 1208, 1140, 1076, 1016, 960, 904, 856, 0, 0,
  0, 854, 808, 762, 718, 678, 640, 604, 570, 538, 508, 480, 452, 428, 0, 0,
  0, 427, 404, 381, 359, 339, 320, 302, 285, 269, 254, 240, 226, 214, 0, 0,
  0, 214, 202, 191, 180, 170, 160, 151, 143, 135, 127, 120, 113, 107, 0, 0,
];

const u32 = (b: Uint8Array, o: number): number => (o >= 0 && o + 4 <= b.length ? ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 : 0);
const u16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : 0xffff);

/** Grid note of a note byte, 0 when the byte plays no note. */
export const speedyA1GridNote = (byte: number): number => (byte < EFFECT_FIRST ? periodToNote(SA1_PERIODS[byte]) : 0);

/** Check2 of the eagleplayer (sa_module.c find_tables): header tag, order list bounds and the first sample's FORM tag. */
export function isSpeedyA1Format(buf: Uint8Array): boolean {
  if (buf.length < PATTERNS_OFFSET || u32(buf, 0) >>> 16 !== 0 || u32(buf, 0xc) !== TAG) return false;
  let highest = 0;
  for (let o = ORDER_OFFSET; o < PATTERNS_OFFSET; o += 2) {
    const w = u16(buf, o);
    if (w === ORDER_END) break;
    if (w > 0xff) return false;
    highest = Math.max(highest, w);
  }
  let tables = PATTERNS_OFFSET + (highest + 1) * PATTERN_BYTES;
  while (tables + 4 <= buf.length && u32(buf, tables) === 0) tables += 4;
  return tables + 4 <= buf.length && u32(buf, tables + TABLES_TO_FORM) === FORM_TAG;
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

export function parseSpeedyA1File(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isSpeedyA1Format(buf)) throw new Error('Not a Speedy A1 System module');
  const start = u32(buf, 4);
  const end = u32(buf, 8);

  const patterns: Pattern[] = [];
  const blocks = new Set<number>(); // played file pattern numbers
  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  const columnBytes: NonNullable<UADEVariablePatternLayout['columnBytes']> = [];
  const usedInstruments = new Set<number>();
  for (let position = start, walked = 0; walked < MAX_POSITIONS; walked++) {
    const nums = [0, 1, 2, 3].map((v) => u16(buf, ORDER_OFFSET + position * 8 + v * 2));
    if (nums.some((n) => n === ORDER_END || PATTERNS_OFFSET + (n + 1) * PATTERN_BYTES > buf.length)) break;
    let length = SA1_ROWS;
    for (let row = 0; row < SA1_ROWS && length === SA1_ROWS; row++) {
      if (nums.some((n) => buf[PATTERNS_OFFSET + n * PATTERN_BYTES + row * CELL_BYTES] === END_CELL)) length = row;
    }
    const pi = patterns.length;
    patterns.push({
      id: `pattern-${pi}`, name: `Position ${position}`, length: Math.max(1, length),
      channels: nums.map((n, ch) => {
        blocks.add(n);
        const rows = Array.from({ length: Math.max(1, length) }, (_, row): TrackerCell => {
          const offset = PATTERNS_OFFSET + n * PATTERN_BYTES + row * CELL_BYTES;
          const slide = SA1_SLIDE_EFFTYP[buf[offset]];
          if (slide) {
            // amount = (second << 8) | third, added to / subtracted from the period every tick; the grid shows the low byte
            columnBytes.push({ pattern: pi, channel: ch, row, offset: offset + 2, fields: ['effTyp', 'eff'] });
            return { ...emptyCell(), effTyp: slide, eff: buf[offset + 2] };
          }
          const note = length > 0 ? speedyA1GridNote(buf[offset]) : 0;
          if (note === 0) return emptyCell();
          const sample = buf[offset + 2];
          if (sample > MAX_SAMPLE) return emptyCell();
          usedInstruments.add(sample + 1);
          noteBytes.push({ pattern: pi, channel: ch, row, offset, note });
          return { ...emptyCell(), note, instrument: sample + 1 };
        });
        return {
          id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 100,
          pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null, rows,
        };
      }),
    } as Pattern);
    if (length < SA1_ROWS || ++position === end) break;
  }

  const sorted = [...blocks].sort((a, b) => a - b);
  const layout: UADEVariablePatternLayout | undefined = patterns.length ? {
    formatId: 'sonicArrangerSas',
    numChannels: NUM_CHANNELS,
    numFilePatterns: sorted.length,
    rowsPerPattern: SA1_ROWS,
    moduleSize: buf.length,
    encoder: speedyA1Encoder,
    filePatternAddrs: sorted.map((n) => PATTERNS_OFFSET + n * PATTERN_BYTES),
    filePatternSizes: sorted.map(() => PATTERN_BYTES),
    // The display is the order list, not the file blocks: edits reach the file through noteBytes.
    trackMap: patterns.map(() => Array.from({ length: NUM_CHANNELS }, () => -1)),
    blockRows: sorted.map((n) => Array.from({ length: SA1_ROWS }, (_, row): TrackerCell => {
      const p = PATTERNS_OFFSET + n * PATTERN_BYTES + row * CELL_BYTES;
      return { ...emptyCell(), cutoff: CELL_BYTES, period: buf[p], pan: buf[p + 1], resonance: buf[p + 2] } as TrackerCell;
    })),
    noteBytes,
    columnBytes,
    propagateSharedCells: true,
  } : undefined;

  const instruments: InstrumentConfig[] = [...usedInstruments].sort((a, b) => a - b).map((id) => ({
    id, name: `Sample ${id - 1}`, type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const baseName = filename.split('/').pop() ?? filename;
  const songPositions = patterns.map((_, i) => i);
  return {
    name: `${baseName.replace(/^sas\./i, '').replace(/\.sas$/i, '') || baseName} [Speedy A1 System]`,
    format: 'MOD' as TrackerFormat,
    patterns: patterns.length ? patterns : [{ id: 'pattern-0', name: 'Pattern 0', length: SA1_ROWS, channels: [] } as unknown as Pattern],
    instruments,
    songPositions: songPositions.length ? songPositions : [0],
    songLength: Math.max(1, songPositions.length),
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: u32(buf, 0) + 1, // header speed long + 1 = ticks per row (sa_module.c)
    initialBPM: 125,
    linearPeriods: false,
    ...(layout ? { uadeVariableLayout: layout } : {}),
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  } as TrackerSong;
}
