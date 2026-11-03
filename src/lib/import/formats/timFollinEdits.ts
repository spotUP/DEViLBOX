/**
 * timFollinEdits.ts - write the Tim Follin grid's note edits back into the module (phase B).
 *
 * A grid note is a note byte 1..0x7F in a voice stream. The replayer plays period table entry
 * (transpose + byte) & 0x7F, so an edited note cell is a same-length patch of that one byte, chosen so the table
 * entry lands on the new note given the transpose in force when the note starts (recorded per row by the grid).
 * A stream run by several voices or loops is shared by every place that plays it. Edits the stream cannot hold at its
 * length - a note on a row without one, a note removed or turned into a note off, the instrument, volume and
 * effect columns (instruments are chosen by commands, volume and effects are not stored per row) - are refused with a
 * warning and nothing is written for them. After patching, the grid is decoded again: every edited cell must read back
 * as edited and every cell that does not share an edited byte must be unchanged, otherwise the edit is taken out again.
 */
import type { Pattern, TrackerCell } from '@/types';
import { buildTimFollinGrid, timFollinShownNote, type TfolGrid } from './timFollinGrid';

const NOTE_OFF = 97;
const ROWS_PER_PATTERN = 64;
const MAX_NOTE_BYTE = 0x7f;
const PREFIX = 'Tim Follin';

export interface TimFollinEditResult {
  data: Uint8Array;
  /** Bytes changed in the module. */
  patched: number;
  warnings: string[];
}

interface Edit { pattern: number; channel: number; row: number; note: number; offset: number; value: number }

const where = (e: { pattern: number; channel: number; row: number }): string => `voice ${e.channel + 1}, pattern ${e.pattern}, row ${e.row}`;

function otherFieldsDiffer(a: TrackerCell, b: TrackerCell): boolean {
  const x = a as unknown as Record<string, number | undefined>;
  const y = b as unknown as Record<string, number | undefined>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (k === 'note' || k === 'instrument') continue;
    if ((x[k] ?? 0) !== (y[k] ?? 0)) return true;
  }
  return false;
}

const cellAt = (g: TfolGrid, channel: number, row: number): TrackerCell | undefined =>
  g.patterns[Math.floor(row / ROWS_PER_PATTERN)]?.channels[channel]?.rows[row % ROWS_PER_PATTERN];

/** The note byte whose table entry shows `note` under `base`, nearest to `current`; -1 when the table has none. */
function byteFor(note: number, base: number, current: number): number {
  let best = -1;
  for (let b = 1; b <= MAX_NOTE_BYTE; b++) {
    if (timFollinShownNote((base + b) & 0xff) !== note) continue;
    if (best < 0 || Math.abs(b - current) < Math.abs(best - current)) best = b;
  }
  return best;
}

/** The edits of `patterns` against the grid decoded from the untouched module, as byte patches in `data`. */
export function applyTimFollinGridEdits(original: Uint8Array, patterns: readonly Pattern[], subsong = 0): TimFollinEditResult {
  const data = new Uint8Array(original);
  const warnings: string[] = [];
  const base = buildTimFollinGrid(original, subsong);
  if (!base) return { data, patched: 0, warnings };
  if (patterns.length !== base.patterns.length) {
    warnings.push(`${PREFIX}: the grid has ${patterns.length} patterns, the module decodes to ${base.patterns.length}; nothing was written.`);
    return { data, patched: 0, warnings };
  }

  const claimed = new Map<number, number>();
  const accepted: Edit[] = [];

  patterns.forEach((pat, pi) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    const was = base.patterns[pi]?.channels[c]?.rows[r];
    if (!was) return;
    const noteChanged = cell.note !== was.note;
    const instChanged = cell.instrument !== was.instrument;
    const otherChanged = otherFieldsDiffer(cell, was);
    if (!noteChanged && !instChanged && !otherChanged) return;
    const at = { pattern: pi, channel: c, row: r };
    if (instChanged) warnings.push(`${PREFIX} ${where(at)}: the instrument is chosen by an Instrument command shared by many notes; that change was not written.`);
    if (otherChanged) warnings.push(`${PREFIX} ${where(at)}: volume and effect columns are not stored per row in this format; that change was not written.`);
    if (!noteChanged) return;
    const src = base.rowSources[pi]?.[c]?.[r];
    if (!src || was.note < 1 || was.note >= NOTE_OFF) {
      warnings.push(`${PREFIX} ${where(at)}: no note plays on this row, and adding or removing one, or changing a rest or note off, would change the length of the stream; the edit was not written.`);
      return;
    }
    if (cell.note < 1 || cell.note >= NOTE_OFF) {
      warnings.push(`${PREFIX} ${where(at)}: a note cannot be removed or turned into a note off without changing the stream length; the edit was not written.`);
      return;
    }
    const value = byteFor(cell.note, src.base, src.noteByte);
    if (value < 0) {
      warnings.push(`${PREFIX} ${where(at)}: note ${cell.note} is not in the player's period table; the note was not written.`);
      return;
    }
    const other = claimed.get(src.offset);
    if (other !== undefined && other !== value) {
      warnings.push(`${PREFIX} ${where(at)}: another edited row shares a stream byte with this one and wants a different value; this edit was not written.`);
      return;
    }
    claimed.set(src.offset, value);
    accepted.push({ ...at, note: cell.note, offset: src.offset, value });
  })));

  const writeAll = (edits: Edit[]): void => {
    data.set(original);
    for (const e of edits) data[e.offset] = e.value;
  };

  // cells that share an edited byte legitimately change with it
  const touched = new Set(accepted.map((e) => e.offset));
  const shared = new Set<string>();
  base.rowSources.forEach((pat, pi) => pat.forEach((voice, c) => voice.forEach((s, r) => {
    if (s && touched.has(s.offset)) shared.add(`${c}:${pi * ROWS_PER_PATTERN + r}`);
  })));

  const failing = (edits: Edit[]): Edit[] => {
    writeAll(edits);
    const again = buildTimFollinGrid(data, subsong);
    if (!again || again.rows !== base.rows) return edits;
    const bad = edits.filter((e) => cellAt(again, e.channel, e.pattern * ROWS_PER_PATTERN + e.row)?.note !== e.note);
    if (bad.length > 0) return bad;
    for (let c = 0; c < 4; c++) {
      for (let row = 0; row < base.rows; row++) {
        if (shared.has(`${c}:${row}`)) continue;
        const a = cellAt(again, c, row);
        const b = cellAt(base, c, row);
        if (a?.note !== b?.note || a?.instrument !== b?.instrument) return edits; // something else moved
      }
    }
    return [];
  };

  let live: Edit[] = [];
  for (const e of accepted) {
    if (failing([e]).length === 0) live.push(e);
    else warnings.push(`${PREFIX} ${where(e)}: the replayer would play this row differently than it is shown after the change, or the change moves other rows; it was not written.`);
  }
  for (let pass = 0; pass < 3 && live.length > 0; pass++) {
    const bad = failing(live);
    if (bad.length === 0) break;
    for (const e of bad) warnings.push(`${PREFIX} ${where(e)}: this edit conflicts with another edit once both are written; it was not written.`);
    live = bad.length === live.length ? [] : live.filter((e) => !bad.includes(e));
  }
  writeAll(live);
  let patched = 0;
  for (let i = 0; i < data.length; i++) if (data[i] !== original[i]) patched++;
  return { data, patched, warnings };
}
