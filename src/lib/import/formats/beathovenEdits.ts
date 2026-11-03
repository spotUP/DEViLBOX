/**
 * beathovenEdits.ts - write the Beathoven Synthesizer grid's note edits back into the module (phase B).
 *
 * A grid note is the 16-bit note number of a note command (the first note of an arpeggio in the legacy engine). The
 * player looks the number up in its period table at (number + the entry's note base - origin [+ bias]), so an edited note
 * cell is a same-length patch of that one word, chosen so the table entry lands on the new note under the base in force
 * for the row (recorded per row by the grid). A stream played by several voices or track entries is shared by every
 * place that plays it. Edits the stream cannot hold at its length - a note on a row without one, a note removed, the
 * instrument (chosen by an instrument command), volume and effect columns (not stored per row) - are refused with a
 * warning and nothing is written for them. After patching, the grid is decoded again: every edited cell must read back
 * as edited and every cell that does not share an edited word must be unchanged, otherwise the edit is taken out again.
 */
import type { Pattern, TrackerCell } from '@/types';
import { buildBthGrid, bthShownNote, readBthParams, type BthGrid } from './beathovenGrid';
import { otherFieldsDiffer } from './timFollinEdits';

const NOTE_OFF = 97;
const ROWS_PER_PATTERN = 64;
/** Note numbers 0x80 and above are commands. */
const MAX_NOTE_NUMBER = 0x7f;
const VOICES = 4;
const PREFIX = 'Beathoven Synthesizer';

export interface BeathovenEditResult {
  data: Uint8Array;
  /** Bytes changed in the module. */
  patched: number;
  warnings: string[];
}

interface Edit { pattern: number; channel: number; row: number; note: number; offset: number; value: number }

const where = (e: { pattern: number; channel: number; row: number }): string => `voice ${e.channel + 1}, pattern ${e.pattern}, row ${e.row}`;

const cellAt = (g: BthGrid, channel: number, row: number): TrackerCell | undefined =>
  g.patterns[Math.floor(row / ROWS_PER_PATTERN)]?.channels[channel]?.rows[row % ROWS_PER_PATTERN];

/** The note number that shows `note` under `base`, nearest to `current`; -1 when the table has none. */
function numberFor(buf: Uint8Array, note: number, base: number, current: number): number {
  const prm = readBthParams(buf);
  if (typeof prm === 'string') return -1;
  let best = -1;
  for (let n = 1; n <= MAX_NOTE_NUMBER; n++) {
    if (bthShownNote(buf, prm, n, base) !== note) continue;
    if (best < 0 || Math.abs(n - current) < Math.abs(best - current)) best = n;
  }
  return best;
}

/** The edits of `patterns` against the grid decoded from the untouched module, as word patches in `data`. */
export function applyBeathovenGridEdits(original: Uint8Array, patterns: readonly Pattern[]): BeathovenEditResult {
  const data = new Uint8Array(original);
  const warnings: string[] = [];
  const base = buildBthGrid(original);
  if (typeof base === 'string') return { data, patched: 0, warnings };
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
      warnings.push(`${PREFIX} ${where(at)}: no note plays on this row, and adding or removing one, or changing a rest, would change the length of the stream; the edit was not written.`);
      return;
    }
    if (cell.note < 1 || cell.note >= NOTE_OFF) {
      warnings.push(`${PREFIX} ${where(at)}: a note cannot be removed or turned into a note off without changing the stream length; the edit was not written.`);
      return;
    }
    const value = numberFor(original, cell.note, src.base, src.noteNum);
    if (value < 0) {
      warnings.push(`${PREFIX} ${where(at)}: note ${cell.note} is not in the player's period table; the note was not written.`);
      return;
    }
    const other = claimed.get(src.noteOffset);
    if (other !== undefined && other !== value) {
      warnings.push(`${PREFIX} ${where(at)}: another edited row shares a stream word with this one and wants a different value; this edit was not written.`);
      return;
    }
    claimed.set(src.noteOffset, value);
    accepted.push({ ...at, note: cell.note, offset: src.noteOffset, value });
  })));

  const writeAll = (edits: Edit[]): void => {
    data.set(original);
    for (const e of edits) { data[e.offset] = (e.value >> 8) & 0xff; data[e.offset + 1] = e.value & 0xff; }
  };

  // cells that share an edited word legitimately change with it
  const touched = new Set(accepted.map((e) => e.offset));
  const shared = new Set<string>();
  base.rowSources.forEach((pat, pi) => pat.forEach((voice, c) => voice.forEach((s, r) => {
    if (s && touched.has(s.noteOffset)) shared.add(`${c}:${pi * ROWS_PER_PATTERN + r}`);
  })));

  const failing = (edits: Edit[]): Edit[] => {
    writeAll(edits);
    const again = buildBthGrid(data);
    if (typeof again === 'string' || again.rows !== base.rows) return edits;
    const bad = edits.filter((e) => cellAt(again, e.channel, e.pattern * ROWS_PER_PATTERN + e.row)?.note !== e.note);
    if (bad.length > 0) return bad;
    for (let c = 0; c < VOICES; c++) {
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
