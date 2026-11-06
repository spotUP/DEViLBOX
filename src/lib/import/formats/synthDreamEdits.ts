/**
 * synthDreamEdits.ts - write the SynthDream tick grid's edits back into the sdr. module (phase B).
 *
 * The grid (synthDreamGrid.ts) is the replayer's own walk, and every row records the file offsets of the note and
 * instrument words that set the note and instrument shown there. An edited cell is therefore a same-length patch of
 * one 16-bit word, never a re-pack:
 *   - note: the low byte of the note word, so that the replayer's transposition (entry transpose, unless the
 *     instrument is fixed-pitch) lands on the pitch the cell now shows;
 *   - instrument: the low byte of the instrument word (the entry's substitution is accounted for).
 * A word is shared by every tick that replays its stream (repeats, loops, other entries), so an edit shows
 * wherever the stream plays: that is the module's structure, not a copy.
 * Edits the module cannot hold at its length - a note where no command plays one, a note removed or turned into a
 * rest, a volume or effect (the format has no such column) - and edits the replayer would play differently than the
 * cell shows are refused with a warning; nothing is written for them. After patching, the grid is decoded again and
 * every edited cell must read back as edited, otherwise its patch is taken out again.
 */
import type { Pattern, TrackerCell } from '@/types';
import { buildSdrGrid, sdrShownNote, sdrSubstitutedInstrument, type SdrGrid } from './synthDreamGrid';

const NOTE_OFF = 97;
const FIRST_NOTE = 13;
const LAST_NOTE = 96;
/** Tracker note 13 is table note 60 (synthDreamGrid.ts). */
const NOTE_C1 = 60;

export interface SdrEditResult {
  data: Uint8Array;
  /** Words changed in the module. */
  patched: number;
  warnings: string[];
}

interface Edit {
  pattern: number; channel: number; row: number;
  note: number; instrument: number;
  /** Word offsets this edit wrote, with the bytes they held before. */
  words: Map<number, number>;
}

const getWord = (b: Uint8Array, o: number): number => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const setWord = (b: Uint8Array, o: number, w: number): void => { b[o] = (w >> 8) & 0xff; b[o + 1] = w & 0xff; };

/** True when a cell differs in a field other than note and instrument (SynthDream has no volume or effect column). */
function otherFieldsDiffer(a: TrackerCell, b: TrackerCell): boolean {
  const x = a as unknown as Record<string, number | undefined>;
  const y = b as unknown as Record<string, number | undefined>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (k === 'note' || k === 'instrument' || k === 'extraNotes') continue;
    if ((x[k] ?? 0) !== (y[k] ?? 0)) return true;
  }
  // further note columns are read-only here: any change in them counts as an edit that is not written
  const ea = JSON.stringify(a.extraNotes ?? []);
  const eb = JSON.stringify(b.extraNotes ?? []);
  return ea !== eb;
}

function where(e: { pattern: number; channel: number; row: number }): string {
  return `voice ${e.channel + 1}, pattern ${e.pattern}, row ${e.row}`;
}

/** The edits of `patterns` against the grid decoded from the untouched module, as byte patches in `data`. */
export function applySdrGridEdits(original: Uint8Array, patterns: readonly Pattern[], subsong = 0): SdrEditResult {
  const data = new Uint8Array(original);
  const warnings: string[] = [];
  const base = buildSdrGrid(original, subsong);
  if (!base) return { data, patched: 0, warnings };
  if (patterns.length !== base.patterns.length) {
    warnings.push(`SynthDream: the grid has ${patterns.length} patterns, the module decodes to ${base.patterns.length}; nothing was written.`);
    return { data, patched: 0, warnings };
  }

  const claimed = new Map<number, number>(); // word offset -> value an accepted edit wants
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
      warnings.push(`SynthDream ${where(at)}: volume and effect columns are not stored in this format; that change was not written.`);
      if (!noteChanged && !instChanged) return;
    }
    const src = base.rowSources[pi]?.[c]?.[r];
    const wants = new Map<number, number>();

    if (noteChanged) {
      if (!src || was.note < 1 || was.note >= NOTE_OFF) {
        warnings.push(`SynthDream ${where(at)}: no note command plays on this row, and adding one would lengthen the stream; the note was not written.`);
        return;
      }
      if (cell.note < FIRST_NOTE || cell.note > LAST_NOTE) {
        warnings.push(`SynthDream ${where(at)}: a note can only be changed to another note from C-1 to B-7; removing a note or making it a rest would change the stream length, so it was not written.`);
        return;
      }
      if (src.noteAt < 0) { warnings.push(`SynthDream ${where(at)}: the note word of this row was not found; the note was not written.`); return; }
      const index = cell.note - FIRST_NOTE + NOTE_C1;
      const low = src.fixedPitch ? index : (index - src.transpose) & 0xff;
      const old = getWord(original, src.noteAt);
      const word = (old & 0xff00) | low;
      if (sdrShownNote(word, src.transpose, src.fixedPitch) !== cell.note) {
        warnings.push(`SynthDream ${where(at)}: the replayer cannot play note ${cell.note} here; the note was not written.`);
        return;
      }
      wants.set(src.noteAt, word);
    }

    if (instChanged) {
      const number = cell.instrument - 1;
      if (!src || was.note < 1 || was.note >= NOTE_OFF || src.instrumentAt < 0 || number < 0 || number > 0xff) {
        warnings.push(`SynthDream ${where(at)}: this row has no instrument word to change in place; the instrument was not written.`);
        return;
      }
      const old = getWord(original, src.instrumentAt);
      const word = (old & 0xff00) | number;
      if (sdrSubstitutedInstrument(word, src.substituteOf, src.substituteBy) !== number) {
        warnings.push(`SynthDream ${where(at)}: the track entry replaces instrument ${number + 1}; it cannot be written here.`);
        return;
      }
      wants.set(src.instrumentAt, word);
    }

    for (const [off, w] of wants) {
      const other = claimed.get(off);
      if (other !== undefined && other !== w) {
        warnings.push(`SynthDream ${where(at)}: another edited row shares this command word with a different value; this edit was not written.`);
        return;
      }
    }
    for (const [off, w] of wants) claimed.set(off, w);
    accepted.push({ ...at, note: cell.note, instrument: cell.instrument, words: wants });
  })));

  const writeAll = (edits: Edit[]): void => {
    data.set(original);
    for (const e of edits) for (const [off, w] of e.words) setWord(data, off, w);
  };

  // Decode again: every edited cell must read back as edited, or its patch comes out.
  let live = accepted;
  for (let pass = 0; pass < 3 && live.length > 0; pass++) {
    writeAll(live);
    const again: SdrGrid | null = buildSdrGrid(data, subsong);
    const failed = live.filter((e) => {
      const got = again?.patterns[e.pattern]?.channels[e.channel]?.rows[e.row];
      const was = base.patterns[e.pattern].channels[e.channel].rows[e.row];
      const noteOk = got?.note === e.note;
      const instOk = e.instrument === was.instrument || got?.instrument === e.instrument;
      return !(noteOk && instOk);
    });
    if (failed.length === 0) break;
    for (const e of failed) warnings.push(`SynthDream ${where(e)}: the replayer would play this row differently than it is shown after the change; it was not written.`);
    live = live.filter((e) => !failed.includes(e));
  }
  writeAll(live);
  const patched = new Set(live.flatMap((e) => [...e.words.keys()])).size;
  return { data, patched, warnings };
}
