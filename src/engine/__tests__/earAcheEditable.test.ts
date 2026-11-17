import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEarAcheFile } from '@/lib/import/formats/EarAcheParser';

const path = 'public/data/songs/earache/bladerunner.ea';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

describe('EarAche editable grid', () => {
  it('decodes real notes and every cell re-encodes to its file bytes', () => {
    const song = parseEarAcheFile(load(), 'bladerunner.ea');
    const layout = song.uadePatternLayout!;
    const bytes = new Uint8Array(load());
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return;
      if (cell.note) notes++;
      expect(Array.from(layout.encodeCell(cell))).toEqual(Array.from(bytes.subarray(off, off + 2)));
    })));
    console.log(`EARACHE patterns=${song.patterns.length} order=${song.songPositions} notes=${notes}`);
    expect(notes).toBeGreaterThan(20);
  });

  const run = async (edit: boolean) => {
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const song = parseEarAcheFile(load(), 'bladerunner.ea');
    const layout = song.uadePatternLayout!;
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    if (edit) {
      const cell = song.patterns[0].channels[0].rows[0];
      song.patterns[0].channels[0].rows[0] = { ...cell, note: 30, instrument: 3 };
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
    for (const i of diff) expect(i >= off && i < off + 2).toBe(true);
    expect(out[off]).toBe(30);
    expect(out[off + 1]).toBe(2);
  });

  it('entry speed shows as Fxx on row 0 and an edit is written to the entry word only', async () => {
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const { earAcheSpeedOffsets } = await import('@/lib/import/formats/EarAcheParser');
    const orig = new Uint8Array(load());
    const at = earAcheSpeedOffsets(orig);
    const song = parseEarAcheFile(load(), 'bladerunner.ea');
    const cell = song.patterns[0].channels[0].rows[0];
    expect(cell.effTyp2).toBe(0x0f);
    expect(cell.eff2).toBe(orig[at[0]] >> 4);
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    const next = (cell.eff2 % 15) + 1;
    song.patterns[0].channels[0].rows[0] = { ...cell, eff2: next };
    const res = await exportNativeSong(song);
    const d = res!.data as Blob | Uint8Array | ArrayBuffer;
    const out = d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : new Uint8Array(d as ArrayBuffer);
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([at[0]]);
    expect(out[at[0]] >> 4).toBe(next);
  });
});
