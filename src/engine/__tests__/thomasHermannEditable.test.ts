import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseThomasHermannFile } from '@/lib/import/formats/ThomasHermannParser';

const path = 'public/data/songs/formats/thm.blueangel69';
const name = 'thm.blueangel69';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

describe('Thomas Hermann editable grid', () => {
  it('decodes real notes and every cell re-encodes to its file bytes', async () => {
    const song = await parseThomasHermannFile(load(), name);
    const layout = song.uadePatternLayout!;
    const bytes = new Uint8Array(load());
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return;
      const stored = bytes.subarray(off, off + 3);
      if (cell.note) notes++;
      expect(Array.from(layout.encodeCell(cell, stored))).toEqual(Array.from(stored));
    })));
    expect(notes).toBeGreaterThan(20);
  });

  const run = async (edit: boolean) => {
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const song = await parseThomasHermannFile(load(), name);
    const layout = song.uadePatternLayout!;
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    if (edit) {
      const cell = song.patterns[0].channels[0].rows[0];
      song.patterns[0].channels[0].rows[0] = { ...cell, note: 30, instrument: 2 };
      off = layout.getCellFileOffset!(0, 0, 0);
    }
    const res = await exportNativeSong(song);
    expect(res).not.toBeNull();
    const d = res!.data as Blob | Uint8Array | ArrayBuffer;
    const out = d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : new Uint8Array(d as ArrayBuffer);
    return { out, off };
  };

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('one cell edit changes only that cell', async () => {
    const { out, off } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff.length).toBeGreaterThan(0);
    for (const i of diff) expect(i >= off && i < off + 3).toBe(true);
    expect(out[off]).toBe(0x51); // note 30: rank 2 (nibble 1), index 5
    expect(out[off + 1]).toBe(2);
  });
});
