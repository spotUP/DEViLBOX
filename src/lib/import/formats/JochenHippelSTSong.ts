/**
 * JochenHippelSTSong.ts - a Jochen Hippel ST song as the grid shows it, the
 * image UADE plays, and the writes and the export a grid edit becomes.
 *
 * The grid is the player's own reading (JochenHippelSTModule.runHstSequencer):
 * one pattern per step, three channels, a row per player row. A cell is a
 * note event of the step's pattern for that voice: note = pattern note +
 * the step's transpose, instrument = volume sequence (info & $1F) + the
 * step's sound transpose, as the player computes them (lbC000854).
 *
 * The player reads a packed stream: a note's empty rows are its wait, so
 * adding a note changes the bytes of every row after it. UADE therefore
 * plays a PLAYBACK IMAGE of the same song, in which every pattern is stored
 * one event per row (an empty row is FD 00, the wait is always 0) in a slot
 * with room for every row to hold a three-byte note. It plays the same
 * notes on the same rows (proven per voice against UADE in
 * jochenHippelSTGridMatchesPlayer.test.ts); a grid edit is then a write of
 * that row's bytes (and of the rows after it only when the row's length
 * changes). The image carries the file it was built from, so the export is
 * that file with the edits written into its own encoding (raw pattern rows,
 * or the packed COSO stream), byte-exact where nothing was edited.
 */

import type { TrackerCell } from '@/types';
import {
  decodeHstModule, encodeHstModule, compressHstSong, hstHeader, hstStep, hstStepCount,
  hstPatternRows, hstPatternStreams, packHstRows, perRowHstStream,
  perRowHstOffsets, hstU16, hstU32, hstW16, hstW32,
  type HstModule, type HstRow, type HstStepVoice, type HstCosoSong,
} from './JochenHippelSTModule';

/** XM note of YM period table index 0 ($EEE, 32.7 Hz = C-1). */
export const HST_NOTE_BASE = 13;
const XM_NOTE_OFF = 97;

/** Volume sequences in the song (header +6, n - 1). */
export function hstVolSeqCount(m: HstModule): number { return hstU16(hstHeader(m), 6) + 1; }

/** The grid cell of a pattern row on a step's voice. */
export function hstCellFromRow(row: HstRow, sv: HstStepVoice, volSeqs: number): TrackerCell {
  const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  if (row.note === null) return cell;
  const idx = ((row.note & 0x7f) + sv.transpose) & 0x7f;
  cell.note = Math.min(96, idx + HST_NOTE_BASE);
  if (row.note < 0x80) {
    // ANDI.W #$1F,D1; ADD.B $20(A0),D1; CMP.W nVol-1,D1; BLS - else sequence 0.
    const v = ((row.info & 0x1f) + sv.soundTranspose) & 0xff;
    cell.instrument = (v > volSeqs - 1 ? 0 : v) + 1;
  }
  return cell;
}

/**
 * The pattern row for a grid cell, or null when the cell cannot be written:
 * a note the step's transpose cannot reach, an instrument its sound
 * transpose cannot reach. Bits the grid does not show stay: a note without
 * an instrument trigger (note byte bit 7), the info byte's top bits and the
 * byte they add. `raw` - a raw TFMX pattern, where note byte 0 is empty and
 * 1 ends the pattern.
 */
export function hstRowFromCell(cell: TrackerCell, old: HstRow, sv: HstStepVoice, raw: boolean): HstRow | null {
  const note = cell.note ?? 0;
  if (note === 0 || note >= XM_NOTE_OFF) return { note: null, info: old.info, extra: null };
  const nb = note - HST_NOTE_BASE - sv.transpose;
  if (nb < (raw ? 2 : 0) || nb > 0x7f) return null;
  const porta = old.note !== null && old.note >= 0x80;
  const noteByte = porta ? nb | 0x80 : nb;
  if (noteByte >= 0xfd) return null;
  let info = old.info;
  const inst = cell.instrument ?? 0;
  if (!porta && inst > 0) {
    const low = (inst - 1 - sv.soundTranspose) & 0xff;
    if (low > 0x1f) return null;
    info = (old.info & 0xe0) | low;
  }
  const extra = info & 0xe0 ? (old.extra ?? 0) : null;
  return { note: noteByte, info, extra };
}

function sameCell(a: TrackerCell, b: TrackerCell): boolean {
  return (a.note ?? 0) === (b.note ?? 0) && (a.instrument ?? 0) === (b.instrument ?? 0);
}

// ── The song being edited ─────────────────────────────────────────────────

/**
 * Raw pattern bytes as rows: a row's extra byte is the byte before its note
 * (the previous row's info; row 0 takes the pattern's last byte), Compress.
 */
function rawRows(pat: Uint8Array, n: number): HstRow[] {
  return Array.from({ length: n }, (_, r) => {
    const note = pat[r * 2];
    const info = pat[r * 2 + 1];
    if (note === 0) return { note: null, info, extra: null };
    return { note, info, extra: info & 0xe0 ? (r === 0 ? pat[pat.length - 1] : pat[r * 2 - 1]) : null };
  });
}

export class HstSongEdit {
  readonly source: Uint8Array;
  readonly module: HstModule;
  readonly volSeqs: number;
  /** Rows per step (null: a step no run reaches). */
  readonly stepRows: Array<number | null>;
  /** Rows of each pattern, as edited. */
  readonly rows: Array<HstRow[] | null>;
  /** Raw TFMX patterns, as edited (null for a COSO song). */
  readonly raw: Uint8Array[] | null;
  private readonly originalStreams: Uint8Array[];
  /** The playback image, as edited, and where each pattern's slot is in it. */
  image: Uint8Array;
  private slotOffsets: number[] = [];

  constructor(source: Uint8Array) {
    this.source = source;
    this.module = decodeHstModule(source);
    this.volSeqs = hstVolSeqCount(this.module);
    const { patterns, stepRows } = hstPatternRows(this.module);
    this.stepRows = stepRows;
    this.rows = patterns.map((p) => (p ? p.map((r) => ({ ...r })) : null));
    this.originalStreams = hstPatternStreams(this.module).map((p) => p.bytes);
    this.raw = this.module.song.kind === 'raw' ? this.module.song.patterns.map((p) => p.slice()) : null;
    this.image = this.buildImage();
  }

  /** The grid cell of step `step`, voice `voice`, row `row`. */
  cell(step: number, row: number, voice: number): TrackerCell {
    const sv = hstStep(this.module, step, voice);
    const r = this.rows[sv.pattern]?.[row];
    return r ? hstCellFromRow(r, sv, this.volSeqs) : hstCellFromRow({ note: null, info: 0, extra: null }, sv, this.volSeqs);
  }

  /** Offset in the image of a cell's row event (-1 when the step has no such row). */
  cellOffset(step: number, row: number, voice: number): number {
    if (step < 0 || step >= hstStepCount(this.module) || voice < 0 || voice > 2) return -1;
    const pt = hstStep(this.module, step, voice).pattern;
    const rows = this.rows[pt];
    if (!rows || row < 0 || row >= rows.length) return -1;
    return this.slotOffsets[pt] + perRowHstOffsets(rows)[row];
  }

  /**
   * Write a grid cell into the song. Returns the image's changed byte run
   * (offset from the image start), [] when nothing changed, null when the
   * cell cannot be written.
   */
  edit(step: number, row: number, voice: number, cell: TrackerCell): Array<{ offset: number; bytes: Uint8Array }> | null {
    if (step < 0 || step >= hstStepCount(this.module) || voice < 0 || voice > 2) return null;
    const sv = hstStep(this.module, step, voice);
    const rows = this.rows[sv.pattern];
    if (!rows || row < 0 || row >= rows.length) return null;
    const next = hstRowFromCell(cell, rows[row], sv, !!this.raw);
    if (!next) return null;
    if (this.raw) {
      const pat = this.raw[sv.pattern];
      pat[row * 2] = next.note === null ? 0 : next.note;
      pat[row * 2 + 1] = next.info;
      // The row's info is the extra byte of the row after it (and, for the
      // pattern's last byte, of row 0).
      const fresh = rawRows(pat, rows.length);
      for (let r = 0; r < rows.length; r++) rows[r] = fresh[r];
    } else {
      rows[row] = next;
    }
    const at = this.slotOffsets[sv.pattern];
    const before = this.image.subarray(at, at + slotSize(rows.length)).slice();
    const after = slotBytes(rows);
    let a = 0;
    while (a < after.length && after[a] === before[a]) a++;
    if (a === after.length) return [];
    let z = after.length;
    while (z > a && after[z - 1] === before[z - 1]) z--;
    this.image.set(after, at);
    return [{ offset: at + a, bytes: after.slice(a, z) }];
  }

  /** The file with its edits, in its own encoding. Byte-exact when nothing was edited. */
  exportFile(): Uint8Array {
    const m = this.module;
    if (m.song.kind === 'raw') {
      return encodeHstModule({ ...m, song: { ...m.song, patterns: this.raw! } });
    }
    const coso = m.song;
    const streams = this.originalStreams.map((orig, i) => {
      const rows = this.rows[i];
      if (!rows) return orig;
      const packed = packHstRows(rows);
      return packed.length === orig.length && packed.every((b, k) => b === orig[k]) ? orig : packed;
    });
    if (streams.every((s, i) => s === this.originalStreams[i])) return this.source.slice();
    return encodeHstModule({ ...m, song: relayoutCosoPatterns(coso, streams) });
  }

  /**
   * [prefix][COSO head][sound and volume regions][pattern pointers][one slot
   * per pattern][source][steps][subsongs][table][trailing]. A raw song is
   * packed first (Compress, the player's own conversion).
   */
  private buildImage(): Uint8Array {
    const m = this.module;
    const coso: HstCosoSong = m.song.kind === 'coso'
      ? m.song
      : (decodeHstModule(compressHstSong(m.song)).song as HstCosoSong);
    const head = coso.head.slice();
    const ptrSize = coso.longPointers ? 4 : 2;
    const patBase = hstU32(head, 12);
    const nPat = this.originalStreams.length;
    const out: number[] = [];
    const push = (a: ArrayLike<number>) => { for (let i = 0; i < a.length; i++) out.push(a[i]); };
    push(head); push(coso.sndRegion); push(coso.volRegion);
    if (out.length !== patBase) throw new Error('Hippel ST: COSO regions are not contiguous');
    for (let i = 0; i < nPat * ptrSize; i++) out.push(0);
    this.slotOffsets = [];
    for (let i = 0; i < nPat; i++) {
      const at = out.length;
      if (ptrSize === 4) {
        out[patBase + i * 4] = (at >>> 24) & 0xff; out[patBase + i * 4 + 1] = (at >>> 16) & 0xff;
        out[patBase + i * 4 + 2] = (at >>> 8) & 0xff; out[patBase + i * 4 + 3] = at & 0xff;
      } else {
        if (at > 0xffff) throw new Error('Hippel ST: playback image too large for word pointers');
        out[patBase + i * 2] = (at >>> 8) & 0xff; out[patBase + i * 2 + 1] = at & 0xff;
      }
      this.slotOffsets.push(m.prefix.length + at);
      const rows = this.rows[i];
      push(rows ? slotBytes(rows) : this.originalStreams[i]);
      if (out.length & 1) out.push(0);
    }
    // The source file, for the export: data, length, tag, then the steps.
    push(this.source);
    if (out.length & 1) out.push(0);
    const len = this.source.length;
    push([(len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff]);
    push(SOURCE_TAG);
    const steps = out.length;
    push(coso.steps);
    const subs = out.length;
    push(coso.subsongs);
    const table = out.length;
    push(coso.table);
    const end = out.length;
    const song = new Uint8Array(out);
    hstW32(song, 16, steps); hstW32(song, 20, subs); hstW32(song, 24, table); hstW32(song, 28, end);
    const image = new Uint8Array(m.prefix.length + song.length + m.trailing.length);
    image.set(m.prefix, 0);
    image.set(song, m.prefix.length);
    image.set(m.trailing, m.prefix.length + song.length);
    return image;
  }
}

const SOURCE_TAG = [0x44, 0x56, 0x42, 0x58, 0x48, 0x53, 0x54, 0x53]; // 'DVBXHSTS'

/** Bytes of a pattern slot: the per-row stream, zero-filled to room for every row as a three-byte note. */
function slotSize(rows: number): number { return (rows * 3 + 2) & ~1; }
function slotBytes(rows: HstRow[]): Uint8Array {
  const out = new Uint8Array(slotSize(rows.length));
  out.set(perRowHstStream(rows));
  return out;
}

/**
 * The file a playback image was built from (HstSongEdit.image), or null for
 * any other file.
 */
export function hstSourceOfImage(image: Uint8Array): Uint8Array | null {
  try {
    const m = decodeHstModule(image);
    if (m.song.kind !== 'coso') return null;
    const steps = m.prefix.length + hstU32(m.song.head, 16);
    const tag = steps - SOURCE_TAG.length;
    if (tag < 4 || !SOURCE_TAG.every((b, i) => image[tag + i] === b)) return null;
    const len = hstU32(image, tag - 4);
    const start = tag - 4 - (len & 1) - len;
    if (start < 0) return null;
    return image.slice(start, start + len);
  } catch {
    return null;
  }
}

/**
 * A COSO song with new pattern streams: the pointer table is rewritten, each
 * stream stored in pattern order, and every section after the pattern region
 * moves by the size change.
 */
function relayoutCosoPatterns(s: HstCosoSong, streams: Uint8Array[]): HstCosoSong {
  const ptrSize = s.longPointers ? 4 : 2;
  const patBase = hstU32(s.head, 12);
  const out: number[] = [];
  for (let i = 0; i < streams.length * ptrSize; i++) out.push(0);
  const offsets: number[] = [];
  streams.forEach((st) => { offsets.push(patBase + out.length); for (const b of st) out.push(b); });
  if (out.length & 1) out.push(0);
  const pat = new Uint8Array(out);
  offsets.forEach((o, i) => { if (ptrSize === 4) hstW32(pat, i * 4, o); else hstW16(pat, i * 2, o); });
  const oldEnd = patBase + s.patRegion.length;
  const delta = pat.length - s.patRegion.length;
  const head = s.head.slice();
  for (let k = 4; k < 32; k += 4) {
    const v = hstU32(head, k);
    if (v >= oldEnd) hstW32(head, k, v + delta);
  }
  return { ...s, head, patRegion: pat };
}

/** The grid of every step: rows by [step][voice][row]; null for a step no run reaches. */
export function hstGrid(edit: HstSongEdit): Array<TrackerCell[][] | null> {
  return edit.stepRows.map((n, step) => (n === null ? null
    : [0, 1, 2].map((v) => Array.from({ length: n }, (_, r) => edit.cell(step, r, v)))));
}

/**
 * Write every grid cell that differs from the song as decoded into the song
 * (the export). Only edited cells are written: a pattern shown by two steps
 * keeps the edit made in either. Grid pattern i is step i. Returns the cells
 * that could not be written, as `pattern:channel:row`.
 */
export function applyHstGrid(edit: HstSongEdit, patterns: ReadonlyArray<{ channels: Array<{ rows: TrackerCell[] }> }>): string[] {
  const baseline = hstGrid(edit);
  const refused: string[] = [];
  patterns.forEach((p, step) => {
    const base = baseline[step];
    if (!base) return;
    p.channels.slice(0, 3).forEach((ch, v) => ch.rows.forEach((cell, r) => {
      const was = base[v][r];
      if (!was || sameCell(cell, was)) return;
      if (edit.edit(step, r, v, cell) === null) refused.push(`${step}:${v}:${r}`);
    }));
  });
  return refused;
}
