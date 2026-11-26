import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSilmarilsFile } from '@/lib/import/formats/SilmarilsParser';
import { SIL_PERIODS, encodeSilmarilsCell, decodeSilmarilsCell } from '@/engine/uade/encoders/SilmarilsEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

const path = 'public/data/songs/silmarils/silmarils_smallest.mok';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const noteCell = (song: ReturnType<typeof parseSilmarilsFile>) => {
  for (let p = 0; p < song.patterns.length; p++) {
    for (let c = 0; c < song.numChannels; c++) {
      const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note);
      if (r >= 0) return { p, c, r };
    }
  }
  throw new Error('no note');
};

describe('Silmarils editable grid', () => {
  const song = parseSilmarilsFile(load(), 'silmarils_smallest.mok');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads patterns with notes', () => {
    expect(song.numChannels).toBe(3);
    expect(song.patterns.length).toBeGreaterThan(0);
    expect(song.patterns[0].length).toBeGreaterThan(4);
  });

  it('grid note is measured from the player period of the note byte', () => {
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      if (!cell.note) return;
      notes++;
      expect(cell.note).toBe(periodToGridNote(SIL_PERIODS[bytes[layout.getCellFileOffset!(p, r, ch)]]));
    })));
    expect(notes).toBeGreaterThan(10);
  });

  it('every placed cell re-encodes to its file byte', () => {
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return;
      expect([...layout.encodeCell(cell, bytes.subarray(off, off + 1))]).toEqual([bytes[off]]);
    })));
  });

  it('a note edit writes the table index of that grid note', () => {
    const cell = decodeSilmarilsCell(new Uint8Array([40]));
    expect([...encodeSilmarilsCell({ ...cell, note: periodToGridNote(SIL_PERIODS[50]) }, new Uint8Array([40]))]).toEqual([50]);
  });
});

describe('Silmarils export (exporter direct)', () => {
  const run = async (edit: boolean) => {
    const { exportSilmarils } = await import('@/lib/export/SilmarilsExporter');
    const song = parseSilmarilsFile(load(), 'silmarils_smallest.mok');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    let want = 0;
    if (edit) {
      const { p, c, r } = noteCell(song);
      off = song.uadePatternLayout!.getCellFileOffset!(p, r, c);
      const was = new Uint8Array(load())[off];
      want = was === 50 ? 51 : 50;
      song.patterns[p].channels[c].rows[r] = { ...song.patterns[p].channels[c].rows[r], note: periodToGridNote(SIL_PERIODS[want]) };
    }
    return { out: (await exportSilmarils(song)).data, off, want };
  };

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('one cell edit changes only that byte', async () => {
    const { out, off, want } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([off]);
    expect(out[off]).toBe(want);
  });
});
