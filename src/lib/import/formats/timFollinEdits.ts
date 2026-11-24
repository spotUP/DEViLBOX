/**
 * timFollinEdits.ts - write the Tim Follin grid's note edits back into the module (phase B).
 *
 * A grid note is a note byte 1..0x7F in a voice stream. The replayer plays period table entry
 * (transpose + byte) & 0x7F, so an edited note cell is a same-length patch of that one byte, chosen so the table
 * entry lands on the new note given the transpose in force when the note starts (recorded per row by the grid).
 * A note typed on an empty row inside a held note splits that note: [note][length] becomes [note][d][new][length - d]
 * (2 bytes inserted; the new note plays with the instrument and transpose in force). A different cell instrument that the
 * song already plays adds [0x81][new] before the new note and [0x81][old] behind it (6 bytes), so later notes keep theirs. The module's voice streams are its last data, so every later byte moves by 2 and the song table stream
 * addresses and Call/Jump address longs at or after the cut are raised by 2. Written only if the reloaded song has the same
 * tick length, the cell reads back as the note and nothing else changed (repeats of the stream show the note too).
 * A stream run by several voices or loops is shared by every place that plays it. Edits the stream cannot hold at its
 * length - a note removed or turned into a note off, the volume and effect columns (not stored per row) - are refused
 * with a warning and nothing is written for them. An instrument edit rewrites the operand byte of the Instrument command
 * [0x81][number] in force for the note (same length), to an instrument another note of the song already plays; that
 * command sets every note until the next one, so every row it covers must carry the same new instrument or the edit is
 * refused. After patching, the grid is decoded again: every edited cell must read back
 * as edited and every cell that does not share an edited byte must be unchanged, otherwise the edit is taken out again.
 */
import type { Pattern, TrackerCell } from '@/types';
import { getColumnField, maxNoteColumns } from '@/lib/tracker/noteColumns';
import { buildTimFollinGrid, locateTimFollin, timFollinShownNote, type TfolGrid } from './timFollinGrid';

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

interface AddNote { pattern: number; channel: number; row: number; note: number; instrument: number }
/** A note byte edit, or (instrument set) an Instrument command operand edit. */
interface Edit { pattern: number; channel: number; row: number; col: number; note: number; instrument?: number; offset: number; value: number }

const where = (e: { pattern: number; channel: number; row: number }): string => `voice ${e.channel + 1}, pattern ${e.pattern}, row ${e.row}`;

export function otherFieldsDiffer(a: TrackerCell, b: TrackerCell): boolean {
  const x = a as unknown as Record<string, number | undefined>;
  const y = b as unknown as Record<string, number | undefined>;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (k === 'note' || k === 'instrument' || k === 'extraNotes') continue;
    if ((x[k] ?? 0) !== (y[k] ?? 0)) return true;
  }
  // Notes and instruments of every column are handled by the caller; volume and delay of the further columns are "other".
  const cols = maxNoteColumns([a, b]);
  for (let col = 1; col < cols; col++) {
    for (const f of ['volume', 'delay'] as const) if ((getColumnField(a, col, f) ?? 0) !== (getColumnField(b, col, f) ?? 0)) return true;
  }
  return false;
}

/** The note shown in note column `col` (0 = first) of a cell. */
const noteIn = (cell: TrackerCell | undefined, col: number): number => (cell ? getColumnField(cell, col, 'note') : undefined) ?? 0;

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
  // rows (voice:row:col) each Instrument command operand covers, and the instruments the song plays
  const covered = new Map<number, Array<{ c: number; row: number; col: number }>>();
  const used = new Set<number>();
  [base.rowSources, ...base.rowSourcesExtra].forEach((srcs, col) => srcs.forEach((pat, pi) => pat.forEach((voice, c) => voice.forEach((s, r) => {
    if (!s) return;
    if (s.instrument > 0) used.add(s.instrument);
    if (s.instrumentAt < 0) return;
    const list = covered.get(s.instrumentAt) ?? [];
    list.push({ c, row: pi * ROWS_PER_PATTERN + r, col });
    covered.set(s.instrumentAt, list);
  }))));
  const accepted: Edit[] = [];
  const adds: AddNote[] = [];

  patterns.forEach((pat, pi) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
    const was = base.patterns[pi]?.channels[c]?.rows[r];
    if (!was) return;
    const otherChanged = otherFieldsDiffer(cell, was);
    const at = { pattern: pi, channel: c, row: r };
    for (let col = 0; col < maxNoteColumns([cell, was]); col++) {
      const want = getColumnField(cell, col, 'instrument') ?? 0;
      if (want === (getColumnField(was, col, 'instrument') ?? 0)) continue;
      const src = (col === 0 ? base.rowSources : base.rowSourcesExtra[col - 1])?.[pi]?.[c]?.[r];
      if (!src) continue; // a new note's instrument is checked by addNote
      if (src.instrumentAt < 0) { warnings.push(`${PREFIX} ${where(at)}: no Instrument command sets this note's instrument; the instrument was not written.`); continue; }
      if (!used.has(want)) { warnings.push(`${PREFIX} ${where(at)}: instrument ${want} is not played anywhere in this song; the instrument was not written.`); continue; }
      const rows = covered.get(src.instrumentAt) ?? [];
      const unmatched = rows.filter((x) => getColumnField(patterns[Math.floor(x.row / ROWS_PER_PATTERN)]?.channels[x.c]?.rows[x.row % ROWS_PER_PATTERN] ?? cell, x.col, 'instrument') !== want).length;
      if (unmatched > 0) { warnings.push(`${PREFIX} ${where(at)}: the Instrument command of this note also sets ${unmatched} other note(s); give them all instrument ${want} to write it. The instrument was not written.`); continue; }
      const value = want - 1;
      const other = claimed.get(src.instrumentAt);
      if (other !== undefined && other !== value) { warnings.push(`${PREFIX} ${where(at)}: another edited row shares this Instrument command and wants a different value; this edit was not written.`); continue; }
      claimed.set(src.instrumentAt, value);
      accepted.push({ ...at, col, note: noteIn(cell, col), instrument: want, offset: src.instrumentAt, value });
    }
    if (otherChanged) warnings.push(`${PREFIX} ${where(at)}: volume and effect columns are not stored per row in this format; that change was not written.`);
    for (let col = 0; col < base.noteCols[c]; col++) {
      const now = noteIn(cell, col);
      const wasNote = noteIn(was, col);
      if (now === wasNote) continue;
      const src = (col === 0 ? base.rowSources : base.rowSourcesExtra[col - 1])?.[pi]?.[c]?.[r];
      if (!src && wasNote === 0 && col === 0 && now >= 1 && now < NOTE_OFF) {
        adds.push({ ...at, note: now, instrument: getColumnField(cell, 0, 'instrument') ?? 0 });
        continue;
      }
      if (!src || wasNote < 1 || wasNote >= NOTE_OFF) {
        warnings.push(`${PREFIX} ${where(at)}: no note plays on this row, and adding or removing one, or changing a rest or note off, would change the length of the stream; the edit was not written.`);
        continue;
      }
      if (now < 1 || now >= NOTE_OFF) {
        warnings.push(`${PREFIX} ${where(at)}: a note cannot be removed or turned into a note off without changing the stream length; the edit was not written.`);
        continue;
      }
      const value = byteFor(now, src.base, src.noteByte);
      if (value < 0) {
        warnings.push(`${PREFIX} ${where(at)}: note ${now} is not in the player's period table; the note was not written.`);
        continue;
      }
      const other = claimed.get(src.offset);
      if (other !== undefined && other !== value) {
        warnings.push(`${PREFIX} ${where(at)}: another edited row shares a stream byte with this one and wants a different value; this edit was not written.`);
        continue;
      }
      claimed.set(src.offset, value);
      accepted.push({ ...at, col, note: now, offset: src.offset, value });
    }
  })));

  const writeAll = (edits: Edit[]): void => {
    data.set(original);
    for (const e of edits) data[e.offset] = e.value;
  };

  // cells that share an edited byte legitimately change with it
  const touched = new Set(accepted.map((e) => e.offset));
  const shared = new Set<string>();
  for (const srcs of [base.rowSources, ...base.rowSourcesExtra]) srcs.forEach((pat, pi) => pat.forEach((voice, c) => voice.forEach((s, r) => {
    if (s && (touched.has(s.offset) || touched.has(s.instrumentAt))) shared.add(`${c}:${pi * ROWS_PER_PATTERN + r}`);
  })));

  const failing = (edits: Edit[]): Edit[] => {
    writeAll(edits);
    const again = buildTimFollinGrid(data, subsong);
    if (!again || again.rows !== base.rows) return edits;
    const bad = edits.filter((e) => {
      const now = cellAt(again, e.channel, e.pattern * ROWS_PER_PATTERN + e.row);
      return e.instrument !== undefined ? (now ? getColumnField(now, e.col, 'instrument') : undefined) !== e.instrument : noteIn(now, e.col) !== e.note;
    });
    if (bad.length > 0) return bad;
    for (let c = 0; c < 4; c++) {
      for (let row = 0; row < base.rows; row++) {
        if (shared.has(`${c}:${row}`)) continue;
        const a = cellAt(again, c, row);
        const b = cellAt(base, c, row);
        if (a?.note !== b?.note || a?.instrument !== b?.instrument || Array.from({ length: Math.max(maxNoteColumns([a, b].filter((x): x is TrackerCell => !!x)), 1) }, (_, k) => k).some((k) => noteIn(a, k) !== noteIn(b, k))) return edits; // something else moved
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
  let out: Uint8Array = data;
  for (const a of adds) {
    const r = addNote(out, subsong, a);
    if (typeof r === 'string') warnings.push(`${PREFIX} ${where(a)}: ${r}; the note was not written.`);
    else out = r;
  }
  if (out !== data) patched = Math.max(patched, out.length - original.length);
  return { data: out, patched, warnings };
}

const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const put32 = (b: Uint8Array, o: number, v: number): void => { b[o] = v >>> 24; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; };

/** Split the note covering an empty row and insert the note after it; a reason string when refused. */
function addNote(data: Uint8Array, subsong: number, a: AddNote): Uint8Array | string {
  const g = buildTimFollinGrid(data, subsong);
  const m = locateTimFollin(data);
  if (!g || !m) return 'the module no longer decodes';
  const tos = data[0] === 0x60 && data[1] === 0x1a;
  if (tos) {
    // header: text size at +2; the empty relocation table (one zero long) must be the file's last 4 bytes
    const reloc = 0x1c + u32(data, 2) + u32(data, 6) + u32(data, 14);
    if (reloc + 4 !== data.length || u32(data, reloc) !== 0) return 'a program file with a relocation table cannot grow';
  }
  if (Array.from({ length: g.noteCols[a.channel] }, (_, k) => noteIn(cellAt(g, a.channel, a.pattern * ROWS_PER_PATTERN + a.row), k)).some((n) => n !== 0)) return 'the row already holds a note';
  const at = a.pattern * ROWS_PER_PATTERN + a.row;
  // the note column sources of a row; the covering note is the latest one that starts before this row
  const srcsAt = (row: number) => [g.rowSources, ...g.rowSourcesExtra].map((t) => t[Math.floor(row / ROWS_PER_PATTERN)]?.[a.channel]?.[row % ROWS_PER_PATTERN]).filter((x): x is NonNullable<typeof x> => !!x);
  let rowA = at - 1;
  while (rowA >= 0 && srcsAt(rowA).length === 0) rowA--;
  const A = rowA >= 0 ? srcsAt(rowA).sort((x, y) => y.tick - x.tick)[0] : null;
  if (!A) return 'no note is held on this row to split';
  const T = g.clock.rowToTick(at);
  const d = T - A.tick;
  if (d < 1 || d >= A.hold) return 'the row is not inside the held note';
  if (A.length !== 2) return 'the voice uses a fixed note length command, so a note has no length byte to split';
  const ins = A.instrument;
  // another instrument: [0x81][n] in front of the new note, [0x81][old] behind it so later notes keep theirs
  const swap = a.instrument !== 0 && a.instrument !== ins;
  if (swap) {
    if (ins === 0) return 'no Instrument command is in force to restore after the new note';
    const played = new Set<number>();
    [g.rowSources, ...g.rowSourcesExtra].forEach((t) => t.forEach((p) => p.forEach((v) => v.forEach((s) => { if (s && s.instrument > 0) played.add(s.instrument); }))));
    if (!played.has(a.instrument)) return `instrument ${a.instrument} is not played anywhere in this song`;
  }
  const grow = swap ? 6 : 2;
  const value = byteFor(a.note, A.nextBase, A.noteByte);
  if (value < 0) return `note ${a.note} is not in the player's period table`;
  const cut = A.offset + 2;
  const len = data.length;
  const off = (v: number): number => (v + m.delta) >>> 0;
  if (m.table + 0x194 + 4 > cut || (u32(data, m.table + 0x194) >>> 16) !== 0) return 'the module has a relocation list';
  for (let i = 0; i < 16; i++) { const t = off(u32(data, m.table + 0x104 + i * 4)); if (t >= cut && t < len) return 'an instrument table lies after the streams'; }
  const out = new Uint8Array(len + grow);
  out.set(data.subarray(0, cut));
  out.set(data.subarray(cut), cut + grow);
  if (tos) put32(out, 2, u32(data, 2) + grow);
  out[A.offset + 1] = d;
  let w = cut;
  if (swap) { out[w++] = 0x81; out[w++] = a.instrument - 1; }
  out[w++] = value;
  out[w++] = A.hold - d;
  if (swap) { out[w++] = 0x81; out[w++] = ins - 1; }
  const bump = (site: number): void => {
    const v = u32(data, site);
    const t = off(v);
    if (t >= cut && t < len) put32(out, site >= cut ? site + grow : site, v + grow);
  };
  for (let i = 0; i < 64; i++) bump(m.table + 4 + i * 4);
  for (let s = 0; s < m.subsongCount; s++) for (const site of buildTimFollinGrid(data, s)?.links ?? []) bump(site);
  const again = buildTimFollinGrid(out, subsong);
  if (!again || again.rows !== g.rows) return 'the song length would change';
  for (let s = 0; s < m.subsongCount; s++) {
    if (s === subsong) continue;
    const x = buildTimFollinGrid(data, s);
    const y = buildTimFollinGrid(out, s);
    if (!x !== !y || (x && y && x.rows !== y.rows)) return 'another subsong would change';
  }
  let changed = 0;
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < g.rows; row++) {
      const was = cellAt(g, c, row);
      const now = cellAt(again, c, row);
      if (!was || !now) return 'the grid shape would change';
      const cols = Math.max(maxNoteColumns([was, now]), 1);
      let same = true;
      for (let k = 0; k < cols; k++) {
        const wn = noteIn(was, k);
        const nn = noteIn(now, k);
        if (wn === nn && getColumnField(was, k, 'instrument') === getColumnField(now, k, 'instrument')) continue;
        // an empty column that gained the new note: the target row, or a repeat of the same stream
        if (wn === 0 && nn === a.note && getColumnField(now, k, 'instrument') === (swap ? a.instrument : ins)) { changed++; continue; }
        same = false;
      }
      if (same) continue;
      return 'other rows would change';
    }
  }
  if (swap && cellAt(again, a.channel, at)?.instrument !== a.instrument) return 'the instrument does not read back on this row';
  if (cellAt(again, a.channel, at)?.note !== a.note || changed < 1) return 'the note does not read back on this row';
  return out;
}
