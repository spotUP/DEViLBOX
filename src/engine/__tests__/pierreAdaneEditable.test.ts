import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePierreAdaneFile } from '@/lib/import/formats/PierreAdaneParser';
import { encodePierreAdaneCell, decodePierreAdaneCell } from '@/engine/uade/encoders/PierreAdaneEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

const path = 'public/data/songs/pierre-adane-packer/Ivanhoe_ivanhoe - bonus.pap';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const noteCell = (song: ReturnType<typeof parsePierreAdaneFile>) => {
  for (let p = 0; p < song.patterns.length; p++) {
    for (let c = 0; c < song.numChannels; c++) {
      const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note);
      if (r >= 0) return { p, c, r };
    }
  }
  throw new Error('no note');
};

describe('Pierre Adane editable grid', () => {
  const song = parsePierreAdaneFile(load(), 'Ivanhoe_ivanhoe - bonus.pap');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads patterns with notes', () => {
    expect(song.numChannels).toBe(4);
    expect(song.patterns.length).toBeGreaterThan(0);
    expect(song.patterns[0].length).toBe(64);
  });

  it('grid note is measured from the stored period', () => {
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      if (!cell.note) return;
      notes++;
      const off = layout.getCellFileOffset!(p, r, ch);
      expect(cell.note).toBe(periodToGridNote((bytes[off] << 8) | bytes[off + 1]));
    })));
    expect(notes).toBeGreaterThan(10);
  });

  it('every placed cell re-encodes to its file bytes', () => {
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return;
      expect([...layout.encodeCell(cell, bytes.subarray(off, off + 4))]).toEqual([...bytes.subarray(off, off + 4)]);
    })));
  });

  it('a note edit writes that note period and keeps instrument and effect', () => {
    const stored = new Uint8Array([0x01, 0xac, 0x51, 0x07]);
    const cell = decodePierreAdaneCell(stored);
    const up = encodePierreAdaneCell({ ...cell, note: cell.note + 2 }, stored);
    expect(periodToGridNote((up[0] << 8) | up[1])).toBe(cell.note + 2);
    expect([up[2], up[3]]).toEqual([0x51, 0x07]);
  });
});

describe('Pierre Adane export (exporter direct)', () => {
  const run = async (edit: boolean) => {
    const { exportPierreAdane } = await import('@/lib/export/PierreAdaneExporter');
    const song = parsePierreAdaneFile(load(), 'Ivanhoe_ivanhoe - bonus.pap');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    if (edit) {
      const { p, c, r } = noteCell(song);
      off = song.uadePatternLayout!.getCellFileOffset!(p, r, c);
      song.patterns[p].channels[c].rows[r] = { ...song.patterns[p].channels[c].rows[r], note: song.patterns[p].channels[c].rows[r].note + 1 };
    }
    return { out: (await exportPierreAdane(song)).data, off };
  };

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('one cell edit changes only that entry', async () => {
    const { out, off } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff.length).toBeGreaterThan(0);
    // shared tracks may place the same entry in several cells; every change stays inside the edited entry
    expect(diff.every((i) => i >= off && i < off + 2)).toBe(true);
  });
});
