/**
 * noteColumns.ts - the one place that knows how a cell holds more than one note.
 *
 * Column 0 is the cell's own note / instrument / volume. Every further column lives in
 * `cell.extraNotes[col - 1]`. The count is limited only by the song (plan R5: no onset is
 * ever dropped). Consumers go through these functions; none switches on a column index.
 *
 * Dependency-free on purpose: the render worker imports it.
 */

export type NoteColumnField = 'note' | 'instrument' | 'volume' | 'delay';

/** One further note column of a cell (column 2 and up). */
export interface NoteColumnCell {
  note?: number;
  instrument?: number;
  volume?: number;
  /** Sub-row delay in ticks. */
  delay?: number;
}

interface ColumnHolder {
  note?: number;
  instrument?: number;
  volume?: number;
  extraNotes?: NoteColumnCell[];
}

const FIELDS: readonly NoteColumnField[] = ['note', 'instrument', 'volume', 'delay'];

/** Value of `field` in note column `col` (0 = the cell's own fields; it has no delay). */
export function getColumnField(cell: ColumnHolder, col: number, field: NoteColumnField): number | undefined {
  if (col <= 0) return field === 'delay' ? undefined : cell[field];
  return cell.extraNotes?.[col - 1]?.[field];
}

/** Set (or, with undefined, clear) `field` of note column `col`, growing `extraNotes` as needed. */
export function setColumnField(cell: ColumnHolder, col: number, field: NoteColumnField, value: number | undefined): void {
  if (col <= 0) {
    if (field !== 'delay') cell[field] = value;
    return;
  }
  if (value === undefined && !cell.extraNotes?.[col - 1]) return;
  const extra = (cell.extraNotes ??= []);
  while (extra.length < col) extra.push({});
  extra[col - 1][field] = value;
  trimExtraNotes(cell);
}

/** Drop trailing empty columns, and the array when nothing is left. */
function trimExtraNotes(cell: ColumnHolder): void {
  const extra = cell.extraNotes;
  if (!extra) return;
  while (extra.length > 0 && FIELDS.every((f) => extra[extra.length - 1][f] === undefined)) extra.pop();
  if (extra.length === 0) delete cell.extraNotes;
}

/** Note columns the cell holds data for (1 + extra columns). */
export function cellNoteColumns(cell: ColumnHolder): number {
  return 1 + (cell.extraNotes?.length ?? 0);
}

/** The most note columns any cell of `rows` holds data for. */
export function maxNoteColumns(rows: ReadonlyArray<ColumnHolder | undefined>): number {
  let n = 1;
  for (const c of rows) if (c) n = Math.max(n, cellNoteColumns(c));
  return n;
}

/** Note value of every column of the cell, column 0 first (0 for an empty column). */
export function columnNotes(cell: ColumnHolder): number[] {
  const out = [cell.note ?? 0];
  for (const e of cell.extraNotes ?? []) out.push(e.note ?? 0);
  return out;
}

/** Copy `field` of every extra column from src to dst (dst columns beyond src's are cleared). */
export function copyExtraField(dst: ColumnHolder, src: ColumnHolder, field: NoteColumnField): void {
  const n = Math.max(dst.extraNotes?.length ?? 0, src.extraNotes?.length ?? 0);
  for (let i = 0; i < n; i++) setColumnField(dst, i + 1, field, src.extraNotes?.[i]?.[field]);
}

/** Clear `field` of every extra column. */
export function clearExtraField(cell: ColumnHolder, field: NoteColumnField): void {
  for (let i = cell.extraNotes?.length ?? 0; i >= 1; i--) setColumnField(cell, i, field, undefined);
}

/** Copy `field` of every extra column of src into dst only where src has a value and dst has none. */
export function mergeExtraField(dst: ColumnHolder, src: ColumnHolder, field: NoteColumnField): void {
  const n = src.extraNotes?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const v = src.extraNotes?.[i]?.[field];
    if (v && !dst.extraNotes?.[i]?.[field]) setColumnField(dst, i + 1, field, v);
  }
}

/** Copy of the extra columns (for cloning a cell). */
export function cloneExtraNotes(cell: ColumnHolder): NoteColumnCell[] | undefined {
  return cell.extraNotes?.map((e) => ({ ...e }));
}

/** Put a placed onset into note column `col` (1 and up) of the cell. */
export function setNoteColumn(cell: ColumnHolder, col: number, note: number, instrument: number, delay: number): void {
  if (col < 1) throw new RangeError('note column 0 is the cell note, not an extra column');
  setColumnField(cell, col, 'note', note);
  setColumnField(cell, col, 'instrument', instrument);
  setColumnField(cell, col, 'delay', delay);
}

/**
 * A cell patch that sets `values` in note column `col` of `cell`, ready for setCell.
 * Column 0 patches the cell's own fields; any other column returns the whole new
 * `extraNotes` array (a patch replaces fields, so it must carry the untouched columns too).
 */
export function columnPatch(
  cell: ColumnHolder | undefined,
  col: number,
  values: Partial<Record<NoteColumnField, number | undefined>>,
): { note?: number; instrument?: number; volume?: number; extraNotes?: NoteColumnCell[] } {
  if (col <= 0) {
    const out: { note?: number; instrument?: number; volume?: number } = {};
    if ('note' in values) out.note = values.note;
    if ('instrument' in values) out.instrument = values.instrument;
    if ('volume' in values) out.volume = values.volume;
    return out;
  }
  const next: ColumnHolder = { extraNotes: cell ? cloneExtraNotes(cell) : undefined };
  for (const f of FIELDS) if (f in values) setColumnField(next, col, f, values[f]);
  return { extraNotes: next.extraNotes ?? [] };
}
