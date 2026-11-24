/**
 * soundProgrammingLanguageEdits.ts - write the Sound Programming Language grid's note edits back into the module (phase B).
 *
 * A grid note is a stream byte below 0xC0 (octave nibble, semitone nibble) that the replayer transposes by the build's
 * steps plus the instrument record's, then looks up in the period table shifted by the record's octave. An edited note
 * cell is a same-length patch of that one byte, chosen so the grid's own lookup lands on the new note. The instrument
 * is a 0x22-byte record copied inline into the stream, not a per-note byte: an instrument change overwrites that record
 * with the bytes of another instrument's record (same length, no relocations inside), and only when every note the record
 * covers is changed to that instrument and still reads back at the same pitch. A stream
 * run is shared by every place that calls it, so an edit shows wherever the run plays. Edits the stream cannot hold
 * at its length - a note on a row without one splits the held note ahead of it (addNote, using the 0xF4 padding after it), a note removed when it and the note before it each carry their own length byte (their lengths merge into the held note, 0xF4 fills the freed byte), length or volume / effect changes, note off - are refused with a
 * warning and nothing is written for them. After patching the grid is decoded again: every edited cell must read back
 * as edited and every cell that does not share an edited byte must be unchanged, otherwise the edit is taken out again.
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellEffects, effectEditPatches } from './cellEffectSlots';
import { buildSplGrid, readSplHunk, type SplGrid } from './soundProgrammingLanguageGrid';

const NOTE_OFF = 97;
const ROWS_PER_PATTERN = 64;
const VOICES = 4;
const PREFIX = 'Sound Programming Language';

export interface SplEditResult { data: Uint8Array; patched: number; warnings: string[] }
interface Edit { pattern: number; channel: number; row: number; note: number; at: number; byte: number; fx: Array<[number, number]>; fxPatches: Array<[number, number]>;
  /** instrument edit: the 0x22 record in force is overwritten with the record of instrument `inst`; every note it covers must read back as `inst` */
  record?: number; inst?: number; covered?: Array<{ pattern: number; channel: number; row: number }> }

const where = (e: { pattern: number; channel: number; row: number }): string => `voice ${e.channel + 1}, pattern ${e.pattern}, row ${e.row}`;
const cellAt = (g: SplGrid, channel: number, row: number): TrackerCell | undefined =>
  g.patterns[Math.floor(row / ROWS_PER_PATTERN)]?.channels[channel]?.rows[row % ROWS_PER_PATTERN];

function otherFieldsDiffer(a: TrackerCell, b: TrackerCell): boolean {
  const x = a as unknown as Record<string, number | undefined>;
  const y = b as unknown as Record<string, number | undefined>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (k === 'note' || k === 'instrument' || k.startsWith('eff')) continue; // the effect slots are handled by effectEditPatches
    if ((x[k] ?? 0) !== (y[k] ?? 0)) return true;
  }
  return false;
}

const CODE = 0x20;

/**
 * A note on an empty row inside a held plain note. The note [N] under length H becomes [Cd][N][C(H-d)][new][CH] (+4
 * bytes): the new note starts d rows in and the length in force is restored. The module has no room to grow, so the 4
 * bytes come out of the 0xF4 no-op padding that follows in the same run; the bytes between are moved up, and the
 * relocations of the call / jump operands among them are raised. Returns the new module or a refusal reason.
 */
function addNote(data: Uint8Array, g: SplGrid, pattern: number, channel: number, row: number, cell: TrackerCell): Uint8Array | string {
  const target = pattern * ROWS_PER_PATTERN + row;
  let cover = -1;
  for (let t = target - 1; t >= 0 && cover < 0; t--) if (g.rowSources[Math.floor(t / ROWS_PER_PATTERN)]?.[channel]?.[t % ROWS_PER_PATTERN]) cover = t;
  const src = cover < 0 ? null : g.rowSources[Math.floor(cover / ROWS_PER_PATTERN)][channel][cover % ROWS_PER_PATTERN];
  const covering = cover < 0 ? undefined : cellAt(g, channel, cover);
  if (!src || !covering || covering.note < 1 || covering.note >= NOTE_OFF) return 'no note is being held on this row, so a note added here has nothing to split';
  if (cell.instrument !== 0 && cell.instrument !== covering.instrument) return 'the instrument is chosen by an instrument record in the stream, not by the note; the instrument differs from the one in force';
  const d = target - cover;
  if (src.length !== 1 || d >= src.hold) return 'the covering note carries extra note bytes or is not held across this row';
  let byte = -1;
  for (let b = 0; b < 0xc0 && byte < 0; b++) if (g.noteForByte(b, src.octave, src.steps) === cell.note) byte = b;
  if (byte < 0) return `note ${cell.note} is not in the module's period table for this instrument`;
  const run = g.streams[src.stream];
  const runEnd = run.offset + run.size;
  let pos = src.offset + 1;
  let block = -1;
  while (pos < runEnd && block < 0) {
    const b = data[pos];
    if (b === 0xf4) { let k = 0; while (pos + k < runEnd && data[pos + k] === 0xf4) k++; if (k >= 4) block = pos; else pos += k; }
    else if (b === 0xf2 || b === 0xf3) break;
    else pos += b === 0xf1 ? 5 : b === 0xf0 ? 1 + 0x22 : 1;
  }
  if (block < 0) return 'the run holds no 4 bytes of no-op padding after this note to take the added bytes';
  if (g.streams.some((s) => s.offset > src.offset && s.offset < block + 4)) return 'another command stream starts inside the bytes that would have to move';
  const hunk = readSplHunk(data);
  if (typeof hunk === 'string') return hunk;
  const out = new Uint8Array(data);
  out.set([0xc0 + d, data[src.offset], 0xc0 + src.hold - d, byte, 0xc0 + src.hold], src.offset);
  out.set(data.subarray(src.offset + 1, block), src.offset + 5);
  const relAt = CODE + hunk.size + 12;
  hunk.relocations.forEach((r, i) => { if (r > src.offset - CODE && r < block - CODE) { out[relAt + 4 * i] = ((r + 4) >>> 24) & 0xff; out[relAt + 4 * i + 1] = ((r + 4) >>> 16) & 0xff; out[relAt + 4 * i + 2] = ((r + 4) >>> 8) & 0xff; out[relAt + 4 * i + 3] = (r + 4) & 0xff; } });
  return out;
}

export function applySplGridEdits(original: Uint8Array, patterns: readonly Pattern[]): SplEditResult {
  const data = new Uint8Array(original);
  const warnings: string[] = [];
  const base = buildSplGrid(original);
  if (typeof base === 'string') return { data, patched: 0, warnings };
  if (patterns.length !== base.patterns.length) {
    warnings.push(`${PREFIX}: the grid has ${patterns.length} patterns, the module decodes to ${base.patterns.length}; nothing was written.`);
    return { data, patched: 0, warnings };
  }
  const claimed = new Map<number, number>();
  const accepted: Edit[] = [];
  const instEdits: Array<{ pattern: number; channel: number; row: number; record: number; inst: number }> = [];
  const adds: Array<{ pattern: number; channel: number; row: number; cell: TrackerCell }> = [];

  patterns.forEach((pat, pi) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    const was = base.patterns[pi]?.channels[c]?.rows[r];
    if (!was) return;
    const noteChanged = cell.note !== was.note;
    const instChanged = cell.instrument !== was.instrument;
    const otherChanged = otherFieldsDiffer(cell, was);
    const fxChanged = JSON.stringify(cellEffects(cell)) !== JSON.stringify(cellEffects(was));
    if (!noteChanged && !instChanged && !otherChanged && !fxChanged) return;
    const at = { pattern: pi, channel: c, row: r };
    if (otherChanged) warnings.push(`${PREFIX} ${where(at)}: volume and effect edits are refused: the volume (start, decay and release) sits in the 0x22-byte instrument record shared by every note that uses it, and this build has no per-note volume or effect byte, so a row cannot carry its own; that change was not written.`);
    const instSrc = base.rowSources[pi]?.[c]?.[r];
    const instEdit = instChanged && !noteChanged && was.note >= 1 && was.note < NOTE_OFF && !!instSrc;
    if (instEdit && instSrc) {
      if (cell.instrument < 1 || cell.instrument > base.instrumentRecords.length) warnings.push(`${PREFIX} ${where(at)}: instrument ${cell.instrument} is not one the module plays; the instrument was not written.`);
      else instEdits.push({ ...at, record: instSrc.record, inst: cell.instrument });
    } else if (instChanged) warnings.push(`${PREFIX} ${where(at)}: the instrument is a record copied inline into the stream, not a byte per note; it can only change on a note, with the note left alone.`);
    let fxPatches: Array<[number, number]> = [];
    if (fxChanged) {
      const fxr = effectEditPatches(cell, was, base.effectSources[c]?.[pi * ROWS_PER_PATTERN + r] ?? []);
      if (fxr.refusal) warnings.push(`${PREFIX} ${where(at)}: ${fxr.refusal}; the effect change was not written.`);
      else fxPatches = fxr.patches;
    }
    if (!noteChanged) {
      if (fxPatches.length > 0) {
        for (const [off, val] of fxPatches) claimed.set(off, val);
        accepted.push({ ...at, note: cell.note, at: -1, byte: -1, fx: cellEffects(cell), fxPatches });
      }
      return;
    }
    if (was.note === 0 && cell.note >= 1 && cell.note < NOTE_OFF && !base.rowSources[pi]?.[c]?.[r]) { adds.push({ pattern: pi, channel: c, row: r, cell }); return; }
    const src = base.rowSources[pi]?.[c]?.[r];
    if (!src || was.note < 1 || was.note >= NOTE_OFF) {
      warnings.push(`${PREFIX} ${where(at)}: no note plays on this row, and adding or removing one would change the length of the stream; the edit was not written.`);
      return;
    }
    if (cell.note === 0) {
      // [Ca][A][Cb][B] -> [C(a+b)][A][Cb][F4]: the held note A absorbs B's length, Cb stays in force for the notes after B
      let prev: NonNullable<typeof src> | null = null;
      for (let t = pi * ROWS_PER_PATTERN + r - 1; t >= 0 && !prev; t--) prev = base.rowSources[Math.floor(t / ROWS_PER_PATTERN)]?.[c]?.[t % ROWS_PER_PATTERN] ?? null;
      const isLen = (o: number): boolean => original[o] >= 0xc0 && original[o] <= 0xef;
      if (!prev || prev.length !== 1 || src.length !== 1 || prev.stream !== src.stream || prev.offset + 2 !== src.offset || !isLen(prev.offset - 1) || !isLen(src.offset - 1)
        || original[prev.offset - 1] - 0xc0 + original[src.offset - 1] - 0xc0 > 0x2f || claimed.has(src.offset)) {
        warnings.push(`${PREFIX} ${where(at)}: a note can only be removed when the note before it directly precedes it in the stream, both have their own length byte and the lengths add up to at most 47; the edit was not written.`);
        return;
      }
      claimed.set(src.offset, 0xf4);
      accepted.push({ ...at, note: 0, at: src.offset, byte: 0xf4, fx: cellEffects(cell), fxPatches: [[prev.offset - 1, original[prev.offset - 1] + original[src.offset - 1] - 0xc0]] });
      return;
    }
    if (cell.note < 1 || cell.note >= NOTE_OFF) {
      warnings.push(`${PREFIX} ${where(at)}: a note cannot be removed or turned into a note off without changing the stream length; the edit was not written.`);
      return;
    }
    let found = -1;
    for (let b = 0; b < 0xc0 && found < 0; b++) if (base.noteForByte(b, src.octave, src.steps) === cell.note) found = b;
    if (found < 0) {
      warnings.push(`${PREFIX} ${where(at)}: note ${cell.note} is not in the module's period table for this instrument; the note was not written.`);
      return;
    }
    const other = claimed.get(src.offset);
    if (other !== undefined && other !== found) {
      warnings.push(`${PREFIX} ${where(at)}: another edited row shares a stream byte with this one and wants a different value; this edit was not written.`);
      return;
    }
    claimed.set(src.offset, found);
    accepted.push({ ...at, note: cell.note, at: src.offset, byte: found, fx: cellEffects(cell), fxPatches });
  })));

  // one record covers every note after it up to the next record: they all take the new instrument or none does
  const byRecord = new Map<number, typeof instEdits>();
  for (const e of instEdits) byRecord.set(e.record, [...(byRecord.get(e.record) ?? []), e]);
  for (const [record, list] of byRecord) {
    const covered: Array<{ pattern: number; channel: number; row: number }> = [];
    base.rowSources.forEach((pat, pi) => pat.forEach((col, c) => col.forEach((src, r) => { if (src && src.record === record) covered.push({ pattern: pi, channel: c, row: r }); })));
    const target = list[0].inst;
    const consistent = list.every((e) => e.inst === target) && covered.every((k) => list.some((e) => e.pattern === k.pattern && e.channel === k.channel && e.row === k.row));
    if (!consistent) { warnings.push(`${PREFIX} ${where(list[0])}: this instrument record also covers ${covered.length} notes, all of which must change to the same instrument; the instrument was not written.`); continue; }
    accepted.push({ ...list[0], note: cellAt(base, list[0].channel, list[0].pattern * ROWS_PER_PATTERN + list[0].row)?.note ?? 0, at: -1, byte: -1, fx: [], fxPatches: [], record, inst: target, covered });
  }

  const writeAll = (edits: Edit[]): void => {
    data.set(original);
    for (const e of edits) { if (e.record !== undefined && e.inst !== undefined) data.set(original.subarray(base.instrumentRecords[e.inst - 1], base.instrumentRecords[e.inst - 1] + 0x22), e.record); if (e.at >= 0) data[e.at] = e.byte; for (const [off, val] of e.fxPatches) data[off] = val; }
  };
  const touched = new Set(accepted.flatMap((e) => [e.at, ...e.fxPatches.map(([o]) => o)]));
  const records = new Set(accepted.flatMap((e) => (e.record === undefined ? [] : [e.record])));
  const shared = new Set<string>();
  base.rowSources.forEach((pat, pi) => pat.forEach((col, c) => col.forEach((s, r) => {
    if (s && (records.has(s.record) || touched.has(s.offset) || base.effectSources[c][pi * ROWS_PER_PATTERN + r].some((x) => touched.has(x.at)))) shared.add(`${c}:${pi * ROWS_PER_PATTERN + r}`);
  })));

  const failing = (edits: Edit[]): Edit[] => {
    writeAll(edits);
    const again = buildSplGrid(data);
    if (typeof again === 'string' || again.rows !== base.rows) return edits;
    const bad = edits.filter((e) => { const got = cellAt(again, e.channel, e.pattern * ROWS_PER_PATTERN + e.row); return got?.note !== e.note || (e.inst !== undefined && (e.covered ?? []).some((k) => { const x = cellAt(again, k.channel, k.pattern * ROWS_PER_PATTERN + k.row); return x?.instrument !== e.inst || x?.note !== cellAt(base, k.channel, k.pattern * ROWS_PER_PATTERN + k.row)?.note; })) || (e.fxPatches.length > 0 && JSON.stringify(cellEffects(got as TrackerCell)) !== JSON.stringify(e.fx)); });
    if (bad.length > 0) return bad;
    for (let c = 0; c < 4; c++) {
      for (let row = 0; row < base.rows; row++) {
        if (shared.has(`${c}:${row}`)) continue;
        const a = cellAt(again, c, row);
        const b = cellAt(base, c, row);
        if (!a || !b || a.note !== b.note || a.instrument !== b.instrument || JSON.stringify(cellEffects(a)) !== JSON.stringify(cellEffects(b))) return edits;
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
  let current: Uint8Array = data;
  for (const a of adds) {
    const before = buildSplGrid(current);
    if (typeof before === 'string') break;
    const res = addNote(current, before, a.pattern, a.channel, a.row, a.cell);
    if (typeof res === 'string') { warnings.push(`${PREFIX} ${where(a)}: ${res}; the note was not written.`); continue; }
    const after = buildSplGrid(res);
    const got = typeof after === 'string' ? undefined : cellAt(after, a.channel, a.pattern * ROWS_PER_PATTERN + a.row);
    let ok = typeof after !== 'string' && after.rows === before.rows && got?.note === a.cell.note;
    // the only other rows allowed to change are those another call of the same run plays
    const coverStream = (g: SplGrid, c: number, row: number): number => {
      for (let t = row; t >= 0; t--) { const s = g.rowSources[Math.floor(t / ROWS_PER_PATTERN)]?.[c]?.[t % ROWS_PER_PATTERN]; if (s) return s.stream; }
      return -1;
    };
    const edited = (() => { for (let t = a.pattern * ROWS_PER_PATTERN + a.row - 1; t >= 0; t--) { const s = before.rowSources[Math.floor(t / ROWS_PER_PATTERN)]?.[a.channel]?.[t % ROWS_PER_PATTERN]; if (s) return s.stream; } return -2; })();
    if (ok && typeof after !== 'string') {
      for (let c = 0; c < VOICES && ok; c++) for (let row = 0; row < before.rows && ok; row++) {
        const x = cellAt(before, c, row);
        const y = cellAt(after, c, row);
        if (!x || !y) { ok = false; break; }
        const same = x.note === y.note && x.instrument === y.instrument && JSON.stringify(cellEffects(x)) === JSON.stringify(cellEffects(y));
        if (!same && coverStream(before, c, row) !== edited) ok = false;
      }
    }
    if (!ok) { warnings.push(`${PREFIX} ${where(a)}: the module read back differently than the added note; it was not written.`); continue; }
    current = res;
  }
  if (current !== data) data.set(current);
  let patched = 0;
  for (let i = 0; i < data.length; i++) if (data[i] !== original[i]) patched++;
  return { data, patched, warnings };
}
