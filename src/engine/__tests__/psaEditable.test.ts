import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePSAFile } from '@/lib/import/formats/PSAParser';
import { PSA_PERIODS } from '@/engine/uade/encoders/PSAEncoder';
import { periodToNote } from '@/lib/amiga/periodNotes';

// Fake UADE: 1 MB of chip RAM, module at BASE, modaddr (u32 BE) at 0x100 - the real UADEChipEditor and writeCellToChipRam run on it.
const { ram } = vi.hoisted(() => ({ ram: new Uint8Array(0x100000) }));
vi.mock('@/engine/uade/UADEEngine', () => ({
  UADEEngine: { hasInstance: () => true, getInstance: () => ({
    readMemory: async (a: number, n: number) => ram.slice(a, a + n),
    writeMemory: async (a: number, b: Uint8Array) => { ram.set(b, a); },
  }) },
}));

const path = 'public/data/songs/professional-sound-artists/the punisher - title.psa';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

describe('PSA editable grid', () => {
  const song = parsePSAFile(load(), 'the punisher - title.psa');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('note index maps to the periodToNote naming', () => {
    PSA_PERIODS.forEach((p, i) => expect(periodToNote(p)).toBe(i + 13));
  });

  it('decodes real notes and every cell re-encodes to its file bytes', () => {
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      const stored = bytes.subarray(off, off + 4);
      if (cell.note) notes++;
      expect(Array.from(layout.encodeCell(cell, stored))).toEqual(Array.from(stored));
    })));
    expect(notes).toBeGreaterThan(20);
  });

  it('a note edit changes only that cell', () => {
    const cell = { ...song.patterns[0].channels[0].rows[0], note: 25, instrument: 1 };
    const off = layout.getCellFileOffset!(0, 0, 0);
    const out = layout.encodeCell(cell, bytes.subarray(off, off + 4));
    expect(out[0]).toBe(13);
    expect(out[1]).toBe(0);
  });
});

describe('PSA export through the single export path', () => {
  const run = async (edit: boolean) => {
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const song = parsePSAFile(load(), 'the punisher - title.psa');
    const layout = song.uadePatternLayout!;
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    if (edit) {
      const cell = song.patterns[0].channels[0].rows[0];
      song.patterns[0].channels[0].rows[0] = { ...cell, note: 25, instrument: 1 };
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
    expect(out.length).toBe(new Uint8Array(load()).length);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('one cell edit changes only that cell', async () => {
    const { out, off } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff.length).toBeGreaterThan(0);
    for (const i of diff) expect(i >= off && i < off + 4).toBe(true);
    expect(out[off]).toBe(13);
  });
});

describe('PSA live edit reaches the module UADE plays', () => {
  it('a keystroke pokes the cell into chip RAM; the module there equals the exported file', async () => {
    const BASE = 0x20000;
    const orig = new Uint8Array(load());
    ram.fill(0); ram.set(orig, BASE);
    ram.set([BASE >>> 24, (BASE >>> 16) & 255, (BASE >>> 8) & 255, BASE & 255], 0x100);
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const { writeCellToChipRam } = await import('@/engine/uade/writeCellToChipRam');
    const g = await import('@/lib/song/gridBaseline');
    const song = parsePSAFile(load(), 'the punisher - title.psa');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    const cell = { ...song.patterns[0].channels[1].rows[3], note: 30, instrument: 2 };
    song.patterns[0].channels[1].rows[3] = cell;
    await writeCellToChipRam(song, 0, 3, 1, cell);
    const played = ram.slice(BASE, BASE + orig.length);
    const off = song.uadePatternLayout!.getCellFileOffset!(0, 3, 1);
    expect(played[off]).toBe(18);
    expect(played.slice(off + 1, off + 2)[0]).toBe(1);
    const res = await exportNativeSong(song);
    expect(Buffer.from(played).equals(Buffer.from(res!.data as Uint8Array))).toBe(true);
  });
});
