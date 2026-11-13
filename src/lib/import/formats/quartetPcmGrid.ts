/**
 * Quartet (Amiga, qpa.*): read-only tracker grid decoded from the song's rows, plus real sampler instruments
 * from the companion SMP.<song> / SMP.set sample set.
 *
 * Byte meanings follow the nuade C port of the UADE eagleplayer (third-party/nuade/players/quartet/qt_module.c,
 * quartet.c), checked against Dan Lennard's PlayModule.S from the Quartet 1.3 program disk:
 *
 * - Song: byte 0 = tempo (ticks per row, 1..30, divides 3000), byte 1 = 'P'. Rows of 8 bytes follow from offset 2,
 *   one big-endian word per voice. The song ends at the first row holding a 0xFFFF word (the file ends with
 *   four 0xFFFF words).
 * - Voice word: first byte = octave (bits 7-6) | volume code (bits 5-0); second byte = sample (high nibble) |
 *   note (low nibble). The voice starts a note when the first byte is non-zero and the second is not 0xFE.
 *   Volume = volume code + 1 (1..64).
 * - 0xFE as second byte = glide marker: the note in the row before slides towards the next note of the voice.
 * - Period: table note_periods[note]; octave bit 1 halves it, octave 0 doubles it (note_period in quartet.c).
 * - Player tick: 50 Hz CIA timer (QT_TICK_LENGTH 14187 at 709379 Hz); one row = `tempo` ticks.
 *
 * Sample set (qt_samples_parse): "lock" at +4, 16 names of 16 bytes in four blocks of four (each block led by a
 * 16-byte "Block n:" label, from offset 0), loop mask word at 0x150 (bit n = sample n repeats whole), PCM from 0x162.
 * 16 length words (in words) at size - 0x60, 16 (offset, length override) word pairs at size - 0x40.
 * A sample of more than 0x32 words takes 2 * (length + 2) bytes; a shorter one takes no room and plays 0x32 words.
 * PCM is signed 8-bit.
 */
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import { periodToGridNote } from '@/lib/amiga/periodNotes';
import { createSamplerInstrument } from './AmigaUtils';

export const QUARTET_PCM_ROWS_PER_PATTERN = 64;
export const QUARTET_PCM_VOICES = 4;
/** DeliTracker's default CIA rate the eagleplayer runs the replayer at. */
export const QUARTET_PCM_TICK_HZ = 50;

const HEADER = 2;
const ROW_BYTES = 8;
const END_WORD = 0xffff;
const GLIDE_MARKER = 0xfe;
const SAMPLES = 16;
const SET_HEADER = 0x162;
const SET_LOOP_MASK = 0x150;
const SET_LENGTHS_FROM_END = 0x60;
const SET_PAIRS_FROM_END = 0x40;
const SET_MIN_WORDS = 0x32;
/** Sample rate that makes the grid's C-2 (period 428) play a sample at its stored pitch. */
const GRID_SAMPLE_RATE = 8363;

/** note_periods in quartet.c; notes 0 and 13..15 read words outside the replayer's table (kept as it reads them). */
const NOTE_PERIODS = [
  0x33c3, 0x00cc, 0x00d8, 0x00e5, 0x00f2, 0x0101, 0x0110, 0x0120,
  0x0131, 0x0143, 0x0157, 0x016b, 0x0180, 0x666c, 0x7279, 0x8088,
];

const u16 = (b: Uint8Array, o: number): number => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** Paula period of a note word (note_period in quartet.c). */
export function quartetPcmPeriod(octave: number, note: number): number {
  let period = NOTE_PERIODS[note & 15];
  if (octave & 2) period >>= 1;
  if (octave === 0) period = (period << 1) & 0xffff;
  return period;
}

/** Rows before the first row holding a 0xFFFF word, or null when the song never ends inside the file. */
export function quartetPcmRowCount(buf: Uint8Array): number | null {
  for (let row = 0; HEADER + row * ROW_BYTES + ROW_BYTES <= buf.length; row++) {
    const o = HEADER + row * ROW_BYTES;
    for (let v = 0; v < QUARTET_PCM_VOICES; v++) if (u16(buf, o + v * 2) === END_WORD) return row;
  }
  return null;
}

export interface QuartetPcmGrid {
  patterns: Pattern[];
  /** ticks per row (song byte 0) */
  tempo: number;
  rows: number;
  /** sample numbers (0-based) the song plays */
  usedSamples: number[];
}

export function buildQuartetPcmGrid(buf: Uint8Array, sourceFile: string): QuartetPcmGrid | null {
  if (buf.length < HEADER + ROW_BYTES || buf[1] !== 0x50) return null;
  const tempo = buf[0];
  if (tempo < 1 || tempo > 30) return null;
  const rows = quartetPcmRowCount(buf);
  if (rows === null || rows === 0) return null;
  const used = new Set<number>();
  const cellAt = (row: number, v: number): TrackerCell => {
    const o = HEADER + row * ROW_BYTES + v * 2;
    const first = buf[o], second = buf[o + 1];
    if (second === GLIDE_MARKER) return { ...emptyCell(), effTyp: 3 }; // glide from the note above (display only)
    if (first === 0) return emptyCell();
    const sample = second >> 4;
    used.add(sample);
    return {
      ...emptyCell(),
      note: periodToGridNote(quartetPcmPeriod(first >> 6, second & 15)),
      instrument: sample + 1,
      volume: 0x10 + (first & 0x3f) + 1,
    };
  };
  const numPatterns = Math.ceil(rows / QUARTET_PCM_ROWS_PER_PATTERN);
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: QUARTET_PCM_ROWS_PER_PATTERN,
    channels: Array.from({ length: QUARTET_PCM_VOICES }, (_, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: ch === 0 || ch === 3 ? -50 : 50, instrumentId: null, color: null,
      rows: Array.from({ length: QUARTET_PCM_ROWS_PER_PATTERN }, (_, r) => {
        const at = p * QUARTET_PCM_ROWS_PER_PATTERN + r;
        return at < rows ? cellAt(at, ch) : emptyCell();
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: QUARTET_PCM_VOICES, originalPatternCount: numPatterns,
      originalInstrumentCount: Math.max(1, used.size),
    },
  }));
  return { patterns, tempo, rows, usedSamples: [...used].sort((a, b) => a - b) };
}

export interface QuartetPcmSample {
  slot: number;
  name: string;
  /** signed 8-bit PCM, as the replayer starts it (start + offset, override or stored length) */
  pcm: Uint8Array;
  loops: boolean;
}

/** Samples of a sample set the replayer accepts ("lock", size = sum of its lengths); [] otherwise. */
export function readQuartetPcmSamples(set: Uint8Array): QuartetPcmSample[] {
  const size = set.length;
  if (size <= SET_HEADER + SET_LENGTHS_FROM_END || size & 1 || u32(set, 4) !== 0x6c6f636b) return [];
  const lengths = size - SET_LENGTHS_FROM_END;
  const pairs = size - SET_PAIRS_FROM_END;
  let words = 0;
  for (let i = 0; i < SAMPLES; i++) { const l = u16(set, lengths + i * 2); if (l) words += l + 2; }
  if (2 * words - 2 + SET_HEADER + SET_LENGTHS_FROM_END !== size) return [];
  const loopMask = u16(set, SET_LOOP_MASK);
  const out: QuartetPcmSample[] = [];
  let start = SET_HEADER;
  for (let slot = 0; slot < SAMPLES; slot++) {
    const stored = u16(set, lengths + slot * 2);
    const lengthWords = stored > SET_MIN_WORDS ? stored : SET_MIN_WORDS;
    const offset = u16(set, pairs + slot * 4);
    const override = u16(set, pairs + slot * 4 + 2);
    if (stored > 0) {
      const from = (start + offset) & ~1;
      const pcm = set.slice(from, Math.min(size, from + 2 * (override || lengthWords)));
      const nameAt = 0x10 + (slot >> 2) * 0x50 + (slot & 3) * 0x10;
      const name = String.fromCharCode(...set.subarray(nameAt, nameAt + 16)).replace(/[^\x20-\x7e]/g, '').trim();
      if (pcm.length > 0) out.push({ slot, name: name || `Sample ${slot + 1}`, pcm, loops: ((loopMask >> slot) & 1) === 1 });
    }
    if (stored > SET_MIN_WORDS) start += 2 * (stored + 2);
  }
  return out;
}

/**
 * Instruments for the grid: instrument number = sample + 1. Real samples when the set is given and accepted;
 * otherwise empty named placeholders so the grid's instrument numbers still resolve.
 */
export function buildQuartetPcmInstruments(grid: QuartetPcmGrid, set: Uint8Array | null): InstrumentConfig[] {
  const samples = set ? readQuartetPcmSamples(set) : [];
  const bySlot = new Map(samples.map(s => [s.slot, s]));
  const slots = new Set<number>([...samples.map(s => s.slot), ...grid.usedSamples]);
  return [...slots].sort((a, b) => a - b).map(slot => {
    const s = bySlot.get(slot);
    return s
      ? createSamplerInstrument(slot + 1, s.name, s.pcm, 64, GRID_SAMPLE_RATE, 0, s.loops ? s.pcm.length : 0)
      : createSamplerInstrument(slot + 1, `Sample ${slot + 1}`, new Uint8Array(2), 64, GRID_SAMPLE_RATE, 0, 0);
  });
}
