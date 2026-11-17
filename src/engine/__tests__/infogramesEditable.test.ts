import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseInfogramesFile } from '@/lib/import/formats/InfogramesParser';
import { INFOGRAMES_PERIODS } from '@/engine/uade/encoders/InfogramesEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

const path = 'public/data/songs/formats/bob4e.dum';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

describe('Infogrames editable grid', () => {
  const song = parseInfogramesFile(load(), 'bob4e.dum');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads four voices from the track lists', () => {
    expect(song.numChannels).toBe(4);
    expect(song.patterns.length).toBe(1);
    expect(song.patterns[0].channels.every((c) => c.rows.length > 1)).toBe(true);
  });

  it('grid note is measured from the player period of the note byte', () => {
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (!cell.note) return;
      notes++;
      expect(cell.note).toBe(periodToGridNote(INFOGRAMES_PERIODS[bytes[off]]));
    })));
    expect(notes).toBeGreaterThan(10);
  });

  it('every placed cell re-encodes to its file byte', () => {
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return;
      expect(layout.encodeCell(cell, bytes.subarray(off, off + 1))[0]).toBe(bytes[off]);
    })));
  });

  it('a note edit writes the byte for that note', () => {
    const ch = song.patterns[0].channels.findIndex((c) => c.rows.some((x) => x.note));
    const r = song.patterns[0].channels[ch].rows.findIndex((x) => x.note);
    const off = layout.getCellFileOffset!(0, r, ch);
    const target = periodToGridNote(INFOGRAMES_PERIODS[bytes[off] === 40 ? 41 : 40]);
    const out = layout.encodeCell({ ...song.patterns[0].channels[ch].rows[r], note: target }, bytes.subarray(off, off + 1));
    expect(out[0]).toBe(bytes[off] === 40 ? 41 : 40);
  });
});

describe('Infogrames command-argument rows', () => {
  it('refuses a note typed on an argument row', async () => {
    const { encodeInfogramesCell, decodeInfogramesCell } = await import('@/engine/uade/encoders/InfogramesEncoder');
    const arg = decodeInfogramesCell(new Uint8Array([0x10]), -1);
    expect(encodeInfogramesCell({ ...arg, note: 40 }, new Uint8Array([0x10]))[0]).toBe(0x10);
    expect(encodeInfogramesCell({ ...arg, note: 40 })[0]).toBe(0x10);
  });
});

describe('Infogrames export (exporter direct)', () => {
  const run = async (edit: boolean) => {
    const { exportInfogrames } = await import('@/lib/export/InfogramesExporter');
    const song = parseInfogramesFile(load(), 'bob4e.dum');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    let want = 0;
    if (edit) {
      const bytes = new Uint8Array(load());
      const ch = song.patterns[0].channels.findIndex((c) => c.rows.some((x) => x.note));
      const r = song.patterns[0].channels[ch].rows.findIndex((x) => x.note);
      off = song.uadePatternLayout!.getCellFileOffset!(0, r, ch);
      want = bytes[off] === 40 ? 41 : 40;
      song.patterns[0].channels[ch].rows[r] = { ...song.patterns[0].channels[ch].rows[r], note: periodToGridNote(INFOGRAMES_PERIODS[want]) };
    }
    const out = (await exportInfogrames(song)).data;
    return { out, off, want };
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

describe('Infogrames native export router', () => {
  it('song holds a note below C-0, so infogrames must stay in holdsLowOctave', async () => {
    const { countLowOctaveNotes } = await import('@/lib/tracker/noteValue');
    const song = parseInfogramesFile(load(), 'bob4e.dum');
    expect(countLowOctaveNotes(song.patterns)).toBeGreaterThan(0);
  });
});
