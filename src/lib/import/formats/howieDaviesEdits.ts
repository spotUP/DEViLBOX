/**
 * howieDaviesEdits.ts - write the Howie Davies grid's edits back into the module (phase B).
 *
 * A grid note is a pattern byte below 0x80 (period table index) followed by a rest byte. An edited note cell is a same-length patch of that one note byte, chosen so the replayer's own period lookup
 * lands on the new note. An edited instrument cell patches the argument byte of the Instrument command that chose it,
 * and only when the stream holds one (an instrument that is the voice's start state has no byte to patch). A pattern is
 * shared by every place that plays it, so an edit shows wherever the pattern byte plays. Edits the stream cannot hold
 * at its length - a note on a row inside a held note that is not in the start pattern, a note turned into a note off (a removed note becomes the Delay command, same two bytes), a rest change,
 * the volume column (not stored per row), a stream command added, removed or retyped - are refused with a warning and nothing is written for them.
 * After patching, the grid is decoded again: every edited cell must read back as edited, and every cell that does not
 * share an edited byte must be unchanged, otherwise the edit is taken out again.
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellEffects, effectEditPatches } from './cellEffectSlots';
import { buildHowieDaviesGrid, type HowieDaviesGrid } from './howieDaviesGrid';

const HUNK_BYTES = 0x20;
const NOTE_OFF = 97;
const COMMAND_BASE = 0x80;
const ROWS_PER_PATTERN = 64;
const PREFIX = 'Howie Davies';

export interface HowieDaviesEditResult {
  data: Uint8Array;
  /** Bytes changed in the module. */
  patched: number;
  warnings: string[];
}

interface Edit { pattern: number; channel: number; row: number; note: number; instrument: number; noteAt: number; noteByte: number; instrumentAt: number; instrumentByte: number; fxPatches: Array<[number, number]>; fx: Array<[number, number]> }

interface Add { pattern: number; channel: number; row: number; note: number; instrument: number }

const where = (e: { pattern: number; channel: number; row: number }): string => `voice ${e.channel + 1}, pattern ${e.pattern}, row ${e.row}`;

/** Fields other than note, instrument and the effect slots differ (the volume column and the rest). */
export function otherFieldsDiffer(a: TrackerCell, b: TrackerCell): boolean {
  const x = a as unknown as Record<string, number | undefined>;
  const y = b as unknown as Record<string, number | undefined>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (k === 'note' || k === 'instrument' || k.startsWith('eff')) continue; // the effect slots are handled by effectEditPatches
    if ((x[k] ?? 0) !== (y[k] ?? 0)) return true;
  }
  return false;
}

const cellAt = (g: HowieDaviesGrid, channel: number, row: number): TrackerCell | undefined =>
  g.patterns[Math.floor(row / ROWS_PER_PATTERN)]?.channels[channel]?.rows[row % ROWS_PER_PATTERN];

/** The edits of `patterns` against the grid decoded from the untouched module, as byte patches in `data`. */
export function applyHowieDaviesGridEdits(original: Uint8Array, patterns: readonly Pattern[]): HowieDaviesEditResult {
  let data: Uint8Array = new Uint8Array(original);
  const warnings: string[] = [];
  const base = buildHowieDaviesGrid(original);
  if (typeof base === 'string') return { data, patched: 0, warnings };
  if (patterns.length !== base.patterns.length) {
    warnings.push(`${PREFIX}: the grid has ${patterns.length} patterns, the module decodes to ${base.patterns.length}; nothing was written.`);
    return { data, patched: 0, warnings };
  }

  const claimed = new Map<number, number>();
  const adds: Add[] = [];
  const accepted: Edit[] = [];

  patterns.forEach((pat, pi) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    const was = base.patterns[pi]?.channels[c]?.rows[r];
    if (!was) return;
    const noteChanged = cell.note !== was.note;
    const instChanged = cell.instrument !== was.instrument;
    const otherChanged = otherFieldsDiffer(cell, was);
    const fxChanged = JSON.stringify(cellEffects(cell)) !== JSON.stringify(cellEffects(was));
    if (!noteChanged && !instChanged && !otherChanged && !fxChanged) return;
    const at = { pattern: pi, channel: c, row: r };
    if (otherChanged) {
      warnings.push(`${PREFIX} ${where(at)}: the volume column is not stored per row in this format; that change was not written.`);
      if (!noteChanged && !instChanged && !fxChanged) return;
    }
    let fxPatches: Array<[number, number]> = [];
    if (fxChanged) {
      const fxr = effectEditPatches(cell, was, base.effectSources[c]?.[pi * ROWS_PER_PATTERN + r] ?? []);
      if (fxr.refusal) warnings.push(`${PREFIX} ${where(at)}: ${fxr.refusal}; the effect change was not written.`);
      else fxPatches = fxr.patches;
      if (!noteChanged && !instChanged) {
        if (fxPatches.length === 0) return;
        // an effect-only edit: the effect byte is the whole patch, no note byte is involved
        for (const [offset, value] of fxPatches) {
          const other = claimed.get(offset);
          if (other !== undefined && other !== value) {
            warnings.push(`${PREFIX} ${where(at)}: another edited row shares a stream command byte with this one and wants a different value; this edit was not written.`);
            return;
          }
        }
        for (const [offset, value] of fxPatches) claimed.set(offset, value);
        accepted.push({ ...at, note: cell.note, instrument: cell.instrument, noteAt: -1, noteByte: -1, instrumentAt: -1, instrumentByte: -1, fxPatches, fx: cellEffects(cell) });
        return;
      }
    }
    const src = base.sources[c]?.[pi * ROWS_PER_PATTERN + r];
    if (!src && noteChanged && cell.note > 0 && cell.note < NOTE_OFF) {
      adds.push({ ...at, note: cell.note, instrument: cell.instrument });
      return;
    }
    if (!src || was.note < 1 || was.note >= NOTE_OFF) {
      warnings.push(`${PREFIX} ${where(at)}: no note plays on this row, and adding or removing one, or changing a rest or note off, would change the length of the stream; the edit was not written.`);
      return;
    }
    let noteByte = original[src.noteAt];
    // Removal: the driver's Delay command is [command][ticks], the same two bytes as a note and its rest byte, and sets the same rest.
    const removal = noteChanged && cell.note === 0 && base.delayByte >= 0;
    if (removal) noteByte = base.delayByte;
    else if (noteChanged) {
      if (cell.note < 1 || cell.note >= NOTE_OFF) {
        warnings.push(`${PREFIX} ${where(at)}: a note cannot be removed or turned into a note off without changing the stream length; the edit was not written.`);
        return;
      }
      let found = -1;
      for (let b = 0; b < COMMAND_BASE && found < 0; b++) if (base.noteForByte(b) === cell.note) found = b;
      if (found < 0) {
        warnings.push(`${PREFIX} ${where(at)}: note ${cell.note} is not in the module's period table; the note was not written.`);
        return;
      }
      noteByte = found;
    }
    let instrumentByte = -1;
    if (instChanged) {
      const index = cell.instrument - 1;
      if (src.instrumentAt < 0) {
        warnings.push(`${PREFIX} ${where(at)}: this note's instrument is the voice's start state, the stream has no Instrument command to change; the instrument was not written.`);
        return;
      }
      if (index < 0 || index > 0xff) {
        warnings.push(`${PREFIX} ${where(at)}: instrument ${cell.instrument} is outside the one-byte operand of the Instrument command; the instrument was not written.`);
        return;
      }
      instrumentByte = index;
    }
    for (const [offset, value] of [[src.noteAt, noteByte], [src.instrumentAt, instrumentByte]] as const) {
      if (offset < 0 || value < 0) continue;
      const other = claimed.get(offset);
      if (other !== undefined && other !== value) {
        warnings.push(`${PREFIX} ${where(at)}: another edited row shares a pattern byte with this one and wants a different value; this edit was not written.`);
        return;
      }
    }
    claimed.set(src.noteAt, noteByte);
    if (instrumentByte >= 0) claimed.set(src.instrumentAt, instrumentByte);
    for (const [offset, value] of fxPatches) {
      const other = claimed.get(offset);
      if (other !== undefined && other !== value) {
        warnings.push(`${PREFIX} ${where(at)}: another edited row shares a stream command byte with this one and wants a different value; this edit was not written.`);
        return;
      }
    }
    for (const [offset, value] of fxPatches) claimed.set(offset, value);
    accepted.push({ ...at, note: cell.note, instrument: removal ? 0 : cell.instrument, noteAt: src.noteAt, noteByte, instrumentAt: instChanged ? src.instrumentAt : -1, instrumentByte, fxPatches, fx: cellEffects(cell) });
  })));

  const writeAll = (edits: Edit[]): void => {
    data.set(original);
    for (const e of edits) {
      if (e.noteAt >= 0) data[e.noteAt] = e.noteByte;
      if (e.instrumentAt >= 0) data[e.instrumentAt] = e.instrumentByte;
      for (const [offset, value] of e.fxPatches) data[offset] = value;
    }
  };

  // Source bytes of every cell, to know which cells share an edited byte (they legitimately change with it).
  const shared = new Set<string>();
  const touched = new Set<number>();
  for (const e of accepted) { if (e.noteAt >= 0) touched.add(e.noteAt); if (e.instrumentAt >= 0) touched.add(e.instrumentAt); for (const [offset] of e.fxPatches) touched.add(offset); }
  base.sources.forEach((col, c) => col.forEach((s, row) => {
    if (s && (touched.has(s.noteAt) || touched.has(s.instrumentAt))) shared.add(`${c}:${row}`);
  }));
  base.effectSources.forEach((col, c) => col.forEach((list, row) => {
    if (list.some((s) => touched.has(s.at))) shared.add(`${c}:${row}`);
  }));

  const sameCell = (a: TrackerCell | undefined, b: TrackerCell | undefined): boolean => !!a && !!b && a.note === b.note && a.instrument === b.instrument && JSON.stringify(cellEffects(a)) === JSON.stringify(cellEffects(b));
  const failing = (edits: Edit[]): Edit[] => {
    writeAll(edits);
    const again = buildHowieDaviesGrid(data);
    if (typeof again === 'string' || again.rows !== base.rows) return edits;
    const bad = edits.filter((e) => {
      const got = cellAt(again, e.channel, e.pattern * ROWS_PER_PATTERN + e.row);
      return !(got?.note === e.note && got.instrument === e.instrument && (e.fxPatches.length === 0 || JSON.stringify(cellEffects(got)) === JSON.stringify(e.fx)));
    });
    if (bad.length > 0) return bad;
    for (let c = 0; c < base.sources.length; c++) {
      for (let row = 0; row < base.rows; row++) {
        if (shared.has(`${c}:${row}`)) continue;
        if (!sameCell(cellAt(again, c, row), cellAt(base, c, row))) return edits; // something else moved: no edit can be trusted alone
      }
    }
    return [];
  };

  // an edit that alone moves something else, or does not read back, is refused
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
  for (const a of adds) data = addNote(data, a, warnings);
  let patched = 0;
  for (let i = 0; i < data.length; i++) if (data[i] !== original[i]) patched++;
  return { data, patched, warnings };
}

const be32 = (d: Uint8Array, o: number): number => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
const put32 = (d: Uint8Array, o: number, v: number): void => { d[o] = v >>> 24; d[o + 1] = (v >>> 16) & 0xff; d[o + 2] = (v >>> 8) & 0xff; d[o + 3] = v & 0xff; };

/**
 * A note on a row no note starts on. The covering note (rest byte r holds r + 1 steps) is cut after d steps: its rest
 * byte becomes d - 1 and a new note byte with rest r - d follows, so the voice keeps its timing. d is the first split
 * the decoded grid shows as the note on that row. The pattern stream grows by two bytes, so it moves to the end of the
 * code hunk (hunk size words and the file grow with it) and every pattern table long that named it is repointed.
 * The start pattern lives inside the replayer data and is refused. Unless the cell reads back as the note and the grid
 * keeps its length, nothing is written.
 */
function addNote(file: Uint8Array, a: Add, warnings: string[]): Uint8Array {
  const g = buildHowieDaviesGrid(file);
  if (typeof g === 'string') return file;
  const row = a.pattern * ROWS_PER_PATTERN + a.row;
  const refuse = (why: string): Uint8Array => { warnings.push(`${PREFIX} ${where(a)}: ${why}; the note was not written.`); return file; };
  const cov = g.covers[a.channel]?.[row];
  if (!cov) return refuse('no note sounds on this row');
  if (cov.stream < 0) return refuse("the start pattern lives inside the replayer's data and cannot grow");
  if (a.instrument !== 0 && a.instrument !== cov.instrument + 1) return refuse('a different instrument would need an Instrument command');
  const byte = Array.from({ length: COMMAND_BASE }, (_, b) => b).find((b) => g.noteForByte(b) === a.note) ?? -1;
  if (byte < 0) return refuse(`note ${a.note} is not in the module's period table`);
  const stream = g.streams.find((s) => s.kind === 'pattern' && s.offset - HUNK_BYTES === cov.stream);
  if (!stream) return refuse('the pattern stream is not known');
  const pointers = g.patternPointerAts(cov.stream);
  if (pointers.length === 0) return refuse('no pattern table entry names this pattern');
  const rest = (file[cov.noteAt + 1] << 24) >> 24;
  if (rest < 1) return refuse('the held note is too short to split');
  const cut = cov.noteAt - stream.offset;
  const old = file.subarray(stream.offset, stream.offset + stream.size);
  const hunk = be32(file, 28) * 4;
  for (let d = 1; d <= rest; d++) {
    const grown = new Uint8Array(stream.size + 2);
    grown.set(old.subarray(0, cut + 2));
    grown.set([d - 1], cut + 1);
    grown.set([byte, rest - d], cut + 2);
    grown.set(old.subarray(cut + 2), cut + 4);
    const added = Math.ceil(grown.length / 4) * 4;
    const moved = new Uint8Array(file.length + added);
    moved.set(file.subarray(0, HUNK_BYTES + hunk));
    moved.set(grown, HUNK_BYTES + hunk);
    moved.set(file.subarray(HUNK_BYTES + hunk), HUNK_BYTES + hunk + added);
    put32(moved, 28, hunk / 4 + added / 4);
    put32(moved, 20, be32(file, 20) + added / 4); // the hunk table size word keeps its memory flag bits
    for (const at of pointers) put32(moved, at, hunk);
    const again = buildHowieDaviesGrid(moved);
    const got = typeof again === 'string' ? undefined : cellAt(again, a.channel, row);
    if (typeof again !== 'string' && again.rows === g.rows && got?.note === a.note) return moved;
  }
  return refuse('no split of the held note reads back as the new note on this row');
}
