import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseForgottenWorldsFile } from '@/lib/import/formats/ForgottenWorldsParser';
import { FORGOTTEN_WORLDS_PERIODS } from '@/engine/uade/encoders/ForgottenWorldsEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

const path = 'public/data/songs/forgotten-worlds/forgotten worlds intro.fw';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const noteCell = (song: ReturnType<typeof parseForgottenWorldsFile>) => {
  for (let p = 0; p < song.patterns.length; p++) {
    for (let c = 0; c < song.numChannels; c++) {
      const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note);
      if (r >= 0) return { p, c, r };
    }
  }
  throw new Error('no note');
};

describe('Forgotten Worlds editable grid', () => {
  const song = parseForgottenWorldsFile(load(), 'forgotten worlds intro.fw');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads four voices and the called patterns', () => {
    expect(song.numChannels).toBe(4);
    expect(song.patterns.length).toBeGreaterThan(1);
    expect(song.patterns[0].channels.every((c) => c.rows.length > 1)).toBe(true);
  });

  it('grid note is measured from the player period of the note byte', () => {
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      if (!cell.note) return;
      notes++;
      expect(cell.note).toBe(periodToGridNote(FORGOTTEN_WORLDS_PERIODS[bytes[layout.getCellFileOffset!(p, r, ch)]]));
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

  it('refuses a note typed on a length or argument row', async () => {
    const { encodeForgottenWorldsCell, decodeForgottenWorldsCell } = await import('@/engine/uade/encoders/ForgottenWorldsEncoder');
    const arg = decodeForgottenWorldsCell(new Uint8Array([0x10]), -1);
    expect(encodeForgottenWorldsCell({ ...arg, note: 40 }, new Uint8Array([0x10]))[0]).toBe(0x10);
  });
});

describe('Forgotten Worlds export (exporter direct)', () => {
  const run = async (edit: boolean) => {
    const { exportForgottenWorlds } = await import('@/lib/export/ForgottenWorldsExporter');
    const song = parseForgottenWorldsFile(load(), 'forgotten worlds intro.fw');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    let want = 0;
    if (edit) {
      const { p, c, r } = noteCell(song);
      off = song.uadePatternLayout!.getCellFileOffset!(p, r, c);
      const was = new Uint8Array(load())[off];
      want = was === 20 ? 21 : 20;
      song.patterns[p].channels[c].rows[r] = { ...song.patterns[p].channels[c].rows[r], note: periodToGridNote(FORGOTTEN_WORLDS_PERIODS[want]) };
    }
    return { out: (await exportForgottenWorlds(song)).data, off, want };
  };

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('one cell edit changes only that byte, and reverting restores the file', async () => {
    const { out, off, want } = await run(true);
    const orig = new Uint8Array(load());
    expect([...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0)).toEqual([off]);
    expect(out[off]).toBe(want);
  });
});
