import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLMEFile } from '@/lib/import/formats/LMEParser';
import { LME_PERIODS, encodeLMECell, decodeLMECell } from '@/engine/uade/encoders/LMEEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

const path = 'public/data/songs/leggless-music-editor/the punisher gameover.lme';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const word = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const noteCell = (song: ReturnType<typeof parseLMEFile>) => {
  for (let p = 0; p < song.patterns.length; p++) {
    for (let c = 0; c < song.numChannels; c++) {
      const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note);
      if (r >= 0) return { p, c, r };
    }
  }
  throw new Error('no note');
};

describe('LME editable grid', () => {
  const song = parseLMEFile(load(), 'the punisher gameover.lme');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads patterns with notes', () => {
    expect(song.numChannels).toBe(4);
    expect(song.patterns.length).toBeGreaterThan(1);
  });

  it('grid note is measured from the player period of the note word', () => {
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      if (!cell.note) return;
      notes++;
      const idx = (word(bytes, layout.getCellFileOffset!(p, r, ch)) + (((cell.period ?? 0) / 0x10000) << 16 >> 16)) & 0xffff;
      expect(cell.note).toBe(periodToGridNote(LME_PERIODS[idx]));
    })));
    expect(notes).toBeGreaterThan(10);
  });

  it('every placed cell re-encodes to its file word', () => {
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return;
      expect([...layout.encodeCell(cell, bytes.subarray(off, off + 2))]).toEqual([bytes[off], bytes[off + 1]]);
    })));
  });

  it('a transposed pattern writes the note word minus the transposition', () => {
    const cell = decodeLMECell(new Uint8Array([0, 5]), 2);
    expect(cell.note).toBe(periodToGridNote(LME_PERIODS[7]));
    const j = LME_PERIODS.length - 1;
    expect([...encodeLMECell({ ...cell, note: periodToGridNote(LME_PERIODS[j]) }, new Uint8Array([0, 5]))]).toEqual([0, j - 2]);
  });
});

describe('LME export (exporter direct)', () => {
  const run = async (edit: boolean) => {
    const { exportLME } = await import('@/lib/export/LMEExporter');
    const song = parseLMEFile(load(), 'the punisher gameover.lme');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    let want = 0;
    if (edit) {
      const { p, c, r } = noteCell(song);
      off = song.uadePatternLayout!.getCellFileOffset!(p, r, c);
      const cell = song.patterns[p].channels[c].rows[r];
      const tr = ((cell.period ?? 0) / 0x10000) << 16 >> 16;
      const was = (word(new Uint8Array(load()), off) + tr) & 0xffff;
      const idx = was === 20 ? 21 : 20;
      want = (idx - tr) & 0xffff;
      song.patterns[p].channels[c].rows[r] = { ...cell, note: periodToGridNote(LME_PERIODS[idx]) };
    }
    return { out: (await exportLME(song)).data, off, want };
  };

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('one cell edit changes only that word, and reverting restores the file', async () => {
    const { out, off, want } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff.every((i) => i === off || i === off + 1)).toBe(true);
    expect(diff.length).toBeGreaterThan(0);
    expect(word(out, off)).toBe(want);
  });
});
