/**
 * Where each tracker-grid cell of a Jochen Hippel module lives in its file.
 *
 * Hippel songs play from their own bytes in libtfmxaudiodecoder, so a grid edit
 * is heard only once it is written back into those bytes and the module is
 * reloaded. The grid is not a plain view of the bytes: each track step adds a
 * note transpose (and in 7V an instrument transpose) on the way to the grid,
 * and a 7V pattern or CoSo block is shared by every step that references it.
 *
 * Each parser's decode loop records, for every cell it decodes, the byte span
 * it came from, the cell as decoded, and how to encode a new cell into that
 * span with the step's transpose undone. The patcher then writes only cells
 * that differ from what was decoded, so an unedited cell never rewrites its
 * bytes (which would lose bits the grid does not show, and would overwrite an
 * edit made through another step sharing the same pattern).
 */
import type { TrackerCell } from '@/types';

export interface HippelCellSpan {
  /** File offset of the cell's bytes. */
  offset: number;
  /** Byte length of the span; an encoding of another length cannot be written. */
  length: number;
  /** The cell as the parser decoded it from these bytes. */
  baseline: TrackerCell;
  /**
   * Bytes for `cell` in this span, or null when it cannot be written in place.
   * `file` is the module being patched, for bits the grid does not carry.
   */
  encode(cell: TrackerCell, file: Uint8Array): Uint8Array | null;
  /**
   * Bytes outside the cell's span that the cell's volume column shows: in 7V
   * the step's voice-volume command in the track table, drawn on row 0.
   * Absent when the cell shows no volume; a volume edit on such a cell is
   * refused.
   */
  aux?: HippelAuxSpan;
}

/** A byte run elsewhere in the file that one cell's volume column edits. */
export interface HippelAuxSpan {
  offset: number;
  length: number;
  encode(cell: TrackerCell, file: Uint8Array): Uint8Array | null;
}

/** Spans by [pattern][channel][row]; null where a row has no bytes behind it. */
export type HippelCellSpans = (HippelCellSpan | null)[][][];

export interface HippelPatchResult {
  bytes: Uint8Array;
  /** Cells written. */
  written: number;
  /** Edited cells that could not be written in place, as `pattern:channel:row`. */
  refused: string[];
}

interface GridPattern { channels: Array<{ rows: TrackerCell[] }> }

/** The fields the cell's own bytes carry; anything else is not in the file. */
function differs(a: TrackerCell, b: TrackerCell): boolean {
  return (a.note ?? 0) !== (b.note ?? 0) || (a.instrument ?? 0) !== (b.instrument ?? 0);
}

/** The volume column, which lives in other bytes (see `HippelCellSpan.aux`). */
function volumeDiffers(a: TrackerCell, b: TrackerCell): boolean {
  return (a.volume ?? 0) !== (b.volume ?? 0);
}

function isEmpty(c: TrackerCell): boolean {
  return (c.note ?? 0) === 0 && (c.instrument ?? 0) === 0;
}

/** Write every edited cell of `patterns` into a copy of `original`. */
export function patchEditedCells(
  original: Uint8Array,
  spans: HippelCellSpans,
  patterns: readonly GridPattern[],
): HippelPatchResult {
  const bytes = original.slice();
  const refused: string[] = [];
  let written = 0;
  for (let p = 0; p < patterns.length; p++) {
    const channels = patterns[p]?.channels ?? [];
    for (let ch = 0; ch < channels.length; ch++) {
      const rows = channels[ch]?.rows ?? [];
      for (let r = 0; r < rows.length; r++) {
        const cell = rows[r];
        if (!cell) continue;
        const span = spans[p]?.[ch]?.[r] ?? null;
        if (!span) {
          if (!isEmpty(cell) || (cell.volume ?? 0) !== 0) refused.push(`${p}:${ch}:${r}`);
          continue;
        }
        if (differs(cell, span.baseline)) {
          const enc = span.encode(cell, bytes);
          if (!enc || enc.length !== span.length) { refused.push(`${p}:${ch}:${r}`); continue; }
          bytes.set(enc, span.offset);
          written++;
        }
        if (volumeDiffers(cell, span.baseline)) {
          const aux = span.aux;
          const enc = aux ? aux.encode(cell, bytes) : null;
          if (!aux || !enc || enc.length !== aux.length) { refused.push(`${p}:${ch}:${r}`); continue; }
          bytes.set(enc, aux.offset);
          written++;
        }
      }
    }
  }
  return { bytes, written, refused };
}

/**
 * The grid row a voice is on, from where it reads: the last cell whose bytes
 * start before `offset`, the file offset of the voice's next pattern byte.
 * Row 0 when the step has no cells before it.
 */
export function hippelRowAt(spans: HippelCellSpans, step: number, offset: number, channel = 0): number {
  const cells = spans[step]?.[channel];
  if (!cells) return 0;
  let row = 0;
  for (let r = 0; r < cells.length; r++) {
    const c = cells[r];
    if (c && c.offset < offset) row = r;
  }
  return row;
}
