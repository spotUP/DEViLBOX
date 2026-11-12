/**
 * Voodoo Supreme (.vss) is editable: every first-column note cell records the file byte of the command that played it, an
 * unedited export is byte-identical, and an edited note changes that one byte to the table index that shows the new note.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseVoodooSupremeSynthesizerFile } from '@/lib/import/formats/VoodooSupremeSynthesizerParser';
import { voodooNoteForIndex } from '@/lib/import/formats/voodooSupremeGrid';
import { exportVoodooSupreme } from '@/lib/export/VoodooSupremeExporter';
import { getColumnField } from '@/lib/tracker/noteColumns';
import { setGridBaseline, baselineOf } from '@/lib/song/gridBaseline';

const FILES = ['public/data/songs/voodoo/voo8.vss', 'public/data/songs/voodoo-supreme/silkworm.vss'];
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);

describe.each(FILES)('Voodoo Supreme editable: %s', (path) => {
  const raw = readFileSync(path);
  const bytes = new Uint8Array(raw);
  const load = () => parseVoodooSupremeSynthesizerFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, path.split('/').pop()!);

  it('records the command byte of every note cell, and the byte plays the cell note', () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    expect(nb.length).toBeGreaterThan(100);
    for (const n of nb) {
      expect(n.offset).toBeLessThan(bytes.length);
      expect(getColumnField(song.patterns[n.pattern].channels[n.channel].rows[n.row], n.col ?? 0, 'note')).toBe(n.note);
      expect(voodooNoteForIndex(Math.min(98, Math.max(0, bytes[n.offset] + (n.base ?? 0))))).toBe(n.note);
    }
  });

  it('an unedited song exports byte-identical', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    const r = await exportVoodooSupreme(song);
    expect(r.warnings).toEqual([]);
    expect(diffAt(r.data, bytes)).toEqual([]);
  });

  it('a one-note edit changes only that command byte and reloads with the new note', async () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    const count = new Map<number, number>();
    nb.forEach((n) => count.set(n.offset, (count.get(n.offset) ?? 0) + 1));
    const pick = nb.find((n) => count.get(n.offset) === 1 && n.note < 90 && n.note > 12)!;
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[pick.pattern].channels[pick.channel].rows[pick.row];
    cell.note = pick.note + 2;
    const r = await exportVoodooSupreme(song);
    expect(r.warnings).toEqual([]);
    expect(diffAt(r.data, bytes)).toEqual([pick.offset]);
    const back = parseVoodooSupremeSynthesizerFile(r.data.buffer.slice(0) as ArrayBuffer, 'x.vss');
    expect(back.patterns[pick.pattern].channels[pick.channel].rows[pick.row].note).toBe(pick.note + 2);
  });

  const unique = (song: ReturnType<typeof load>, pred: (n: { col?: number; porta?: boolean; note: number }) => boolean) => {
    const nb = song.uadeVariableLayout!.noteBytes!;
    const count = new Map<number, number>();
    nb.forEach((n) => count.set(n.offset, (count.get(n.offset) ?? 0) + 1));
    return nb.find((n) => count.get(n.offset) === 1 && pred(n));
  };

  it('counts the extra-column cells and records each with its own byte', () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    const extra = nb.filter((n) => (n.col ?? 0) >= 1);
    console.info(`${path}: ${nb.length} note cells, ${extra.length} in note column 2 or later`);
    for (const n of extra) {
      const cell = song.patterns[n.pattern].channels[n.channel].rows[n.row];
      expect(cell.extraNotes?.[(n.col ?? 0) - 1]?.note).toBe(n.note);
      expect(voodooNoteForIndex(Math.min(98, Math.max(0, bytes[n.offset] + (n.base ?? 0))))).toBe(n.note);
    }
  });

  it('an edit in an extra note column is written to its own byte and reloads', async () => {
    const song = load();
    const pick = unique(song, (n) => (n.col ?? 0) >= 1 && !n.porta && n.note < 90 && n.note > 12);
    if (!pick) return; // song without such a cell
    setGridBaseline(baselineOf(song.patterns));
    const cell = song.patterns[pick.pattern].channels[pick.channel].rows[pick.row];
    cell.extraNotes![(pick.col ?? 0) - 1].note = pick.note + 2;
    const r = await exportVoodooSupreme(song);
    expect(r.warnings).toEqual([]);
    expect(diffAt(r.data, bytes)).toEqual([pick.offset]);
    const back = parseVoodooSupremeSynthesizerFile(r.data.buffer.slice(0) as ArrayBuffer, 'x.vss');
    expect(back.patterns[pick.pattern].channels[pick.channel].rows[pick.row].extraNotes![(pick.col ?? 0) - 1].note).toBe(pick.note + 2);
  });

  it('a removed note becomes the note cut command with the wait kept, and reloads as a note-off', async () => {
    const song = load();
    const pick = unique(song, (n) => (n.col ?? 0) === 0 && !n.porta);
    setGridBaseline(baselineOf(song.patterns));
    song.patterns[pick!.pattern].channels[pick!.channel].rows[pick!.row].note = 0;
    const r = await exportVoodooSupreme(song);
    expect(r.warnings).toEqual([]);
    expect(diffAt(r.data, bytes)).toEqual([pick!.offset]);
    expect(r.data[pick!.offset]).toBe(0xff);
    expect(r.data[pick!.offset + 1]).toBe(bytes[pick!.offset + 1]);
    const back = parseVoodooSupremeSynthesizerFile(r.data.buffer.slice(0) as ArrayBuffer, 'x.vss');
    expect(back.patterns[pick!.pattern].channels[pick!.channel].rows[pick!.row].note).toBe(97);
  });

  it('refuses removing a portamento (longer than a cut) and a note on a row no command played, and keeps the module', async () => {
    const song = load();
    const nb = song.uadeVariableLayout!.noteBytes!;
    const has = new Set(nb.map((n) => `${n.pattern}:${n.channel}:${n.row}`));
    const porta = nb.find((n) => n.porta && (n.col ?? 0) === 0);
    let empty: { p: number; c: number; r: number } | undefined;
    for (let p = 0; p < song.patterns.length && !empty; p++) for (let r = 0; r < song.patterns[p].channels[0].rows.length && !empty; r++) {
      if (!has.has(`${p}:0:${r}`) && song.patterns[p].channels[0].rows[r].note === 0) empty = { p, c: 0, r };
    }
    setGridBaseline(baselineOf(song.patterns));
    song.patterns[empty!.p].channels[0].rows[empty!.r].note = 40;
    let expected = 1;
    if (porta) {
      song.patterns[porta.pattern].channels[porta.channel].rows[porta.row].note = 0;
      expected = 2;
    }
    const r = await exportVoodooSupreme(song);
    expect(r.warnings.length).toBe(expected);
    expect(diffAt(r.data, bytes)).toEqual([]);
  });

  it('warns about a new note in an extra column no command played', async () => {
    const song = load();
    setGridBaseline(baselineOf(song.patterns));
    song.patterns[0].channels[0].rows.find((c) => !c.extraNotes)!.extraNotes = [{ note: 40, instrument: 1, delay: 0 }];
    const r = await exportVoodooSupreme(song);
    expect(r.warnings.length).toBe(1);
    expect(diffAt(r.data, bytes)).toEqual([]);
  });
});
