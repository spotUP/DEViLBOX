import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSynthPackFile } from '@/lib/import/formats/SynthPackParser';
import { encodeSynthPackCell, decodeSynthPackCell } from '@/engine/uade/encoders/SynthPackEncoder';

const path = 'public/data/songs/synth-pack/centerbase soft.osp';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const noteCell = (song: ReturnType<typeof parseSynthPackFile>) => {
  for (let p = 0; p < song.patterns.length; p++) {
    for (let c = 0; c < song.numChannels; c++) {
      const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note > 0 && x.note < 97);
      if (r >= 0) return { p, c, r };
    }
  }
  throw new Error('no note');
};

describe('SynthPack editable grid', () => {
  const song = parseSynthPackFile(load(), 'osp.centerbase soft');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads positions with notes', () => {
    expect(song.patterns.length).toBeGreaterThan(1);
    expect(song.patterns[0].length).toBe(64);
    expect(() => noteCell(song)).not.toThrow();
  });

  it('every placed cell re-encodes to its file bytes', () => {
    let placed = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return;
      placed++;
      expect([...layout.encodeCell(cell, bytes.subarray(off, off + 6))]).toEqual([...bytes.subarray(off, off + 6)]);
    })));
    expect(placed).toBeGreaterThan(20);
  });

  it('a note edit writes that note index and keeps the rest', () => {
    const stored = new Uint8Array([0x1a, 0x40, 0x1f, 0x00, 0x04, 0x00]);
    const cell = decodeSynthPackCell(stored);
    const up = encodeSynthPackCell({ ...cell, note: cell.note + 2 }, stored);
    expect([...up]).toEqual([0x1c, 0x40, 0x1f, 0x00, 0x04, 0x00]);
  });
});

describe('SynthPack export (exporter direct)', () => {
  const run = async (edit: boolean) => {
    const { exportSynthPack } = await import('@/lib/export/SynthPackExporter');
    const song = parseSynthPackFile(load(), 'osp.centerbase soft');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    if (edit) {
      const { p, c, r } = noteCell(song);
      off = song.uadePatternLayout!.getCellFileOffset!(p, r, c);
      song.patterns[p].channels[c].rows[r] = { ...song.patterns[p].channels[c].rows[r], note: song.patterns[p].channels[c].rows[r].note + 1 };
    }
    return { out: (await exportSynthPack(song)).data, off };
  };

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('one cell edit changes only that event note byte', async () => {
    const { out, off } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([off]);
  });
});
