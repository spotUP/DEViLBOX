/**
 * buzGrid.ts - Buzzic 1 (.buz) / Buzzic 2 (.buz2) song bytes <-> tracker grid.
 *
 * Layout and stream rule are those of the clean-room replayer (buz-wasm/src/buz_engine.cpp,
 * open_b1 / open_b2 / b1_stream / b2_stream):
 *  - Buzzic 1: 128 instrument records of 148 (1.0, file 44712 bytes) or 152 (1.1, 45224) bytes, then
 *    at base = 128 * record: int32 instruments, 64 patterns x 16 values, 64 sequences x 128 entries.
 *    Instrument byte 129 = note stream, 131 = length (a stream in 1.1 only), 128 = mute.
 *  - Buzzic 2: "buz2", 156-byte header, int32 pats, int32 sc, (revision >= 1: int32 P, S, Ls), P x 16
 *    pattern bytes, S x Ls sequence bytes, 8192 bytes, int32 n, then per instrument 9232 bytes +
 *    552 x le32(rec + 388). Record byte 129 = note stream, 130 = length stream.
 *  - A stream value v >= 0 is a constant; v < 0 reads sequence -v at block row / 16, which names
 *    pattern k (1..64), whose value row % 16 is the value.
 *
 * Grid: pattern = block (16 rows, row time = 60 / (4 * bpm) s, the replayer's ROW), one channel per
 * instrument. A cell shows the note stream where the instrument sounds (note != 0, length > 0):
 * note = value + 13 (value 45 is the replayer's 440 Hz, A-4), before the instrument's own transpose.
 * A note edit writes the pattern byte the cell reads; every other byte is carried, so an unedited
 * song encodes byte-identical. Cells that read a constant or an empty sequence slot hold no byte.
 */
import type { TrackerCell } from '@/types';

export const BUZ_ROWS = 16;
const NOTE_BIAS = 13;

const le32 = (b: Uint8Array, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24));
const le16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const s8 = (v: number): number => (v << 24) >> 24;

export interface BuzInstrument { name: string; at: number }

export interface BuzLayout {
  v2: boolean; v11: boolean; bpm: number; first: number; last: number;
  patAt: number; patCount: number;
  seqAt: number; seqStride: number; seqLen: number; seqCount: number;
  instruments: BuzInstrument[];
}

const nameAt = (b: Uint8Array, at: number): string => {
  let s = '';
  for (let i = 0; i < 64 && b[at + i]; i++) s += String.fromCharCode(b[at + i]);
  return s;
};

/** The song's layout, with the same checks as synthw_buz_open; null when it is not a Buzzic song. */
export function buzLayout(b: Uint8Array): BuzLayout | null {
  if (b.length === 44712 || b.length === 45224) {
    const q = b.length === 44712 ? 148 : 152;
    const base = 128 * q;
    const n = le32(b, base);
    if (n < 1 || n > 128) return null;
    const first = le32(b, base + 17564), last = le32(b, base + 17568);
    if (first < 0 || last < first || last > 127) return null;
    return {
      v2: false, v11: q === 152, bpm: le32(b, base + 17560), first, last,
      patAt: base + 4, patCount: 64, seqAt: base + 1156, seqStride: 128, seqLen: 128, seqCount: 64,
      instruments: Array.from({ length: n }, (_, i) => ({ name: nameAt(b, i * q), at: i * q })),
    };
  }
  if (b.length < 156 || b[0] !== 0x62 || b[1] !== 0x75 || b[2] !== 0x7a || b[3] !== 0x32 || le16(b, 4) !== 2) return null;
  const first = le32(b, 16), last = le32(b, 20);
  if (first < 0 || last < first || last >= 256) return null;
  let at = 156;
  const have = (n: number) => at + n <= b.length;
  if (!have(8)) return null;
  const sc = le32(b, at + 4);
  at += 8;
  let P = 64, S = 64, Ls = 128;
  if (le16(b, 6) >= 1) {
    if (!have(12)) return null;
    P = le32(b, at); S = le32(b, at + 4); Ls = le32(b, at + 8);
    at += 12;
    if (P < 1 || P > 4096 || S < 1 || S > 4096 || Ls < 1 || Ls > 65536) return null;
  }
  if (sc < 0 || sc > 64) return null;
  const patAt = at;
  at += 16 * P;
  const seqAt = at;
  at += S * Ls + 8192;
  if (!have(4)) return null;
  const n = le32(b, at);
  at += 4;
  if (n < 1 || n > 128) return null;
  const instruments: BuzInstrument[] = [];
  for (let i = 0; i < n; i++) {
    if (!have(9232)) return null;
    const e = le32(b, at + 388);
    if (e < 0 || e > 64) return null;
    instruments.push({ name: nameAt(b, at), at });
    at += 9232 + 552 * e;
  }
  if (at > b.length) return null;
  return {
    v2: true, v11: false, bpm: le32(b, 12), first, last,
    patAt, patCount: Math.min(P, 64), seqAt, seqStride: Ls, seqLen: Math.min(Ls, 256), seqCount: Math.min(sc, S, 64),
    instruments,
  };
}

/** File offset of the pattern byte stream value `v` reads at song row `row`, or -1 (a constant, an empty slot). */
function streamByte(b: Uint8Array, L: BuzLayout, v: number, row: number): number {
  if (v >= 0) return -1;
  const n = -v;
  if (n > L.seqCount) return -1;
  const e = row >> 4;
  if (e >= L.seqLen) return -1;
  const k = s8(b[L.seqAt + (n - 1) * L.seqStride + e]);
  if (k < 1 || k > 64 || k > L.patCount) return -1;
  return L.patAt + (k - 1) * 16 + (row & 15);
}

function stream(b: Uint8Array, L: BuzLayout, v: number, row: number): number {
  if (v >= 0) return v;
  const at = streamByte(b, L, v, row);
  return at < 0 ? 0 : s8(b[at]);
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

/** The grid cell of instrument `ch` at block `pattern`, row `row`. */
export function buzCell(b: Uint8Array, L: BuzLayout, pattern: number, row: number, ch: number): TrackerCell {
  const cell = emptyCell();
  const ins = L.instruments[ch];
  if (!ins) return cell;
  const r = pattern * BUZ_ROWS + row;
  const note = stream(b, L, s8(b[ins.at + 129]), r);
  const len = L.v2 ? stream(b, L, s8(b[ins.at + 130]), r) : L.v11 ? stream(b, L, s8(b[ins.at + 131]), r) : b[ins.at + 131];
  // shortcut: a negative note byte plays (replayer only skips 0) but shows empty and is not editable; upgrade if a song uses one.
  if (note <= 0 || len <= 0) return cell;
  cell.note = Math.min(96, note + NOTE_BIAS);
  cell.instrument = ch + 1;
  return cell;
}

/** File offset of the note byte the cell reads, or -1 when the cell holds none. */
export function buzCellByte(b: Uint8Array, L: BuzLayout, pattern: number, row: number, ch: number): number {
  const ins = L.instruments[ch];
  return ins ? streamByte(b, L, s8(b[ins.at + 129]), pattern * BUZ_ROWS + row) : -1;
}

export interface BuzGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

/**
 * Writes every edit whose note differs from what the file shows into a copy of the song.
 * Returns `bytes` itself when nothing changed.
 */
export function applyBuzGridEdits(bytes: Uint8Array, edits: readonly BuzGridEdit[], warnings: string[] = []): Uint8Array {
  const L = buzLayout(bytes);
  if (!L) return bytes;
  let out: Uint8Array | null = null;
  for (const e of edits) {
    const note = e.cell.note ?? 0;
    if (note === buzCell(bytes, L, e.pattern, e.row, e.channel).note) continue;
    const at = buzCellByte(bytes, L, e.pattern, e.row, e.channel);
    if (at < 0) {
      warnings.push(`Buzzic: block ${e.pattern} row ${e.row} of instrument ${e.channel + 1} reads no pattern byte; note not written`);
      continue;
    }
    // note-off and an empty cell both silence the row (value 0); values below 1 cannot be stored as a note.
    const value = note === 0 || note === 97 ? 0 : note - NOTE_BIAS;
    if (value < 0 || value > 127) {
      warnings.push(`Buzzic: note ${note} at block ${e.pattern} row ${e.row} is below the lowest note; not written`);
      continue;
    }
    out ??= bytes.slice();
    out[at] = value;
  }
  return out ?? bytes;
}

type GridPattern = { channels: Array<{ rows: TrackerCell[] }> };
export interface BuzLinkedEdit { pattern: number; row: number; channel: number; values: Partial<TrackerCell> }

/**
 * A pattern byte is read by every block and instrument whose sequence names that pattern: the other
 * grid cells reading the byte an edit in `patternIndex` wrote, with what they now show.
 */
export function buzLinkedEdits(bytes: Uint8Array, patternIndex: number, before: GridPattern, after: GridPattern, patterns: readonly GridPattern[]): BuzLinkedEdit[] {
  const L = buzLayout(bytes);
  if (!L) return [];
  const edits: BuzGridEdit[] = [];
  after.channels.forEach((ch, channel) => ch.rows.forEach((cell, row) => {
    if ((before.channels[channel]?.rows[row]?.note ?? 0) !== (cell.note ?? 0)) edits.push({ pattern: patternIndex, row, channel, cell });
  }));
  if (edits.length === 0) return [];
  const next = applyBuzGridEdits(bytes, edits);
  const out: BuzLinkedEdit[] = [];
  for (const e of edits) {
    const at = buzCellByte(bytes, L, e.pattern, e.row, e.channel);
    if (at < 0) continue;
    patterns.forEach((p, pattern) => p.channels.forEach((c, channel) => {
      if ((pattern === e.pattern && channel === e.channel) || buzCellByte(bytes, L, pattern, e.row, channel) !== at) return;
      const there = c.rows[e.row];
      const want = buzCell(next, L, pattern, e.row, channel);
      if (there && (there.note !== want.note || there.instrument !== want.instrument)) {
        out.push({ pattern, row: e.row, channel, values: { note: want.note, instrument: want.instrument } });
      }
    }));
  }
  return out;
}
