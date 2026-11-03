/**
 * dynamicSynthesizerEdits.ts - write the Dynamic Synthesizer grid's edits back into the module (phase B).
 *
 * A pattern word is `note << 8 | sample` (0 = nothing, 0x8000 = note off). The grid shows the note looked up as
 * (high byte + the position's note add + 1) in the 64 entry period table, and the instrument as (low nibble + the
 * position's sample add). An edited cell is a same-length patch of that one 16-bit word:
 *   - note: the high byte, chosen so the lookup lands on a table entry that reads as the new note;
 *   - instrument: the low nibble (the sample add is subtracted; the result must fit a nibble).
 * A pattern is shared by every position that plays it, so an edit shows wherever the pattern plays. Edits the stream
 * cannot hold at its length - a note on an empty row, a note removed or turned into a note off, a volume or effect
 * (the format has none) - are refused with a warning and nothing is written for them. After patching, the grid is
 * decoded again and every edited cell must read back as edited, otherwise its patch is taken out again.
 */
import type { Pattern, TrackerCell } from '@/types';
import { buildDnsGrid, dnsShownCell, type DnsGrid } from './dynamicSynthesizerGrid';

const NOTE_OFF = 97;
const NOTE_OFF_WORD = 0x8000;

export interface DnsEditResult {
  data: Uint8Array;
  /** Words changed in the module. */
  patched: number;
  warnings: string[];
}

interface Edit { pattern: number; channel: number; row: number; note: number; instrument: number; offset: number; word: number }

const getWord = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const setWord = (b: Uint8Array, o: number, w: number): void => { b[o] = (w >> 8) & 0xff; b[o + 1] = w & 0xff; };
const where = (e: { pattern: number; channel: number; row: number }): string => `voice ${e.channel + 1}, position ${e.pattern}, row ${e.row}`;

function otherFieldsDiffer(a: TrackerCell, b: TrackerCell): boolean {
  const x = a as unknown as Record<string, number | undefined>;
  const y = b as unknown as Record<string, number | undefined>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (k === 'note' || k === 'instrument') continue;
    if ((x[k] ?? 0) !== (y[k] ?? 0)) return true;
  }
  return false;
}

/** The edits of `patterns` against the grid decoded from the untouched module, as byte patches in `data`. */
export function applyDnsGridEdits(original: Uint8Array, patterns: readonly Pattern[]): DnsEditResult {
  const data = new Uint8Array(original);
  const warnings: string[] = [];
  const base = buildDnsGrid(original);
  if (typeof base === 'string') return { data, patched: 0, warnings };
  if (patterns.length !== base.patterns.length) {
    warnings.push(`Dynamic Synthesizer: the grid has ${patterns.length} positions, the module decodes to ${base.patterns.length}; nothing was written.`);
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
    if (otherChanged) {
      warnings.push(`Dynamic Synthesizer ${where(at)}: volume and effect columns are not stored in this format; that change was not written.`);
      if (!noteChanged && !instChanged) return;
    }
    const src = base.rowSources[pi]?.[c]?.[r];
    if (!src || was.note < 1 || was.note >= NOTE_OFF) {
      warnings.push(`Dynamic Synthesizer ${where(at)}: no note plays on this row, and adding or turning one into a rest or note off would change what the fixed-size pattern holds; the edit was not written.`);
      return;
    }
    let word = getWord(original, src.wordAt);
    if (noteChanged) {
      const idx = cell.note >= 1 && cell.note < NOTE_OFF ? base.tableNotes.indexOf(cell.note) : -1;
      if (idx < 0) {
        warnings.push(`Dynamic Synthesizer ${where(at)}: note ${cell.note} is not in the module's period table; the note was not written.`);
        return;
      }
      word = (word & 0x00ff) | (((idx - src.noteAdd - 1) & 0xff) << 8);
    }
    if (instChanged) {
      const nibble = (cell.instrument - src.sampleAdd) & 0xff;
      if (nibble > 0xf) {
        warnings.push(`Dynamic Synthesizer ${where(at)}: instrument ${cell.instrument} is out of reach of this position's sample add; the instrument was not written.`);
        return;
      }
      word = (word & 0xfff0) | nibble;
    }
    if (word === 0 || word === NOTE_OFF_WORD || dnsShownCell(word, src.noteAdd, src.sampleAdd, base.tableNotes).note !== (noteChanged ? cell.note : was.note)) {
      warnings.push(`Dynamic Synthesizer ${where(at)}: the replayer cannot play this note here; the edit was not written.`);
      return;
    }
    const other = claimed.get(src.wordAt);
    if (other !== undefined && other !== word) {
      warnings.push(`Dynamic Synthesizer ${where(at)}: another edited row shares this pattern word with a different value; this edit was not written.`);
      return;
    }
    claimed.set(src.wordAt, word);
    accepted.push({ ...at, note: cell.note, instrument: cell.instrument, offset: src.wordAt, word });
  })));

  const writeAll = (edits: Edit[]): void => {
    data.set(original);
    for (const e of edits) setWord(data, e.offset, e.word);
  };

  let live = accepted;
  for (let pass = 0; pass < 3 && live.length > 0; pass++) {
    writeAll(live);
    const again: DnsGrid | string = buildDnsGrid(data);
    const failed = live.filter((e) => {
      const got = typeof again === 'string' ? undefined : again.patterns[e.pattern]?.channels[e.channel]?.rows[e.row];
      return !(got?.note === e.note && got.instrument === e.instrument);
    });
    if (failed.length === 0) break;
    for (const e of failed) warnings.push(`Dynamic Synthesizer ${where(e)}: the replayer would play this row differently than it is shown after the change; it was not written.`);
    live = live.filter((e) => !failed.includes(e));
  }
  writeAll(live);
  return { data, patched: new Set(live.map((e) => e.offset)).size, warnings };
}
