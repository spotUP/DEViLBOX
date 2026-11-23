import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAProSysFile } from '@/lib/import/formats/AProSysParser';
import { APS_NOTE0 } from '@/engine/uade/encoders/AProSysEncoder';
import { encodeStoredCell } from '@/engine/uade/UADEPatternEncoder';

// Fake UADE: 1 MB of chip RAM, module at BASE, modaddr (u32 BE) at 0x100 - the real UADEChipEditor and writeCellToChipRam run on it.
const { ram } = vi.hoisted(() => ({ ram: new Uint8Array(0x100000) }));
vi.mock('@/engine/uade/UADEEngine', () => ({
  UADEEngine: { hasInstance: () => true, getInstance: () => ({
    readMemory: async (a: number, n: number) => ram.slice(a, a + n),
    writeMemory: async (a: number, b: Uint8Array) => { ram.set(b, a); },
  }) },
}));

const path = 'public/data/songs/formats/action.aps';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
// action.aps step 0, voice 0: cell note 9, track 0x20 (tracks section at 860); the order list plays steps 8..23 at octave 0.
const TRACK0 = 860 + 0x20 * 4;
const gridNote = (stored: number) => stored + APS_NOTE0 + 9;

describe('AProSys editable grid', () => {
  const song = parseAProSysFile(load(), 'action.aps');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads the steps and the order list', () => {
    expect(song.patterns.length).toBe(32);
    expect(song.patterns[0].length).toBe(16);
    expect(song.songPositions).toEqual(Array.from({ length: 16 }, (_, i) => 8 + i));
    expect(song.initialSpeed).toBe(5);
    expect(layout.getCellFileOffset!(0, 0, 0)).toBe(TRACK0);
  });

  it('decodes real notes and every placed cell re-encodes to its file bytes', () => {
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return;
      const stored = bytes.subarray(off, off + 4);
      if (cell.note) notes++;
      expect(Array.from(encodeStoredCell(layout, p, r, ch, cell, stored) ?? [])).toEqual(Array.from(stored));
    })));
    expect(notes).toBeGreaterThan(20);
  });
});

describe('AProSys export through the single export path', () => {
  const run = async (edit: boolean) => {
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const song = parseAProSysFile(load(), 'action.aps');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    if (edit) {
      const cell = song.patterns[0].channels[0].rows[0];
      song.patterns[0].channels[0].rows[0] = { ...cell, note: gridNote(5), instrument: 3 };
    }
    const res = await exportNativeSong(song);
    expect(res).not.toBeNull();
    const d = res!.data as Blob | Uint8Array | ArrayBuffer;
    return d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : new Uint8Array(d as ArrayBuffer);
  };

  it('unedited export equals the original bytes', async () => {
    const out = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('one cell edit changes only that track entry', async () => {
    const out = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff.length).toBeGreaterThan(0);
    for (const i of diff) expect(i >= TRACK0 && i < TRACK0 + 4).toBe(true);
    expect(out[TRACK0] & 0x3f).toBe(5);
    expect(out[TRACK0 + 1]).toBe(2);
  });
});

describe('AProSys live edit reaches the module UADE plays', () => {
  it('a keystroke pokes the track entry into chip RAM; the module there equals the exported file', async () => {
    const BASE = 0x20000;
    const orig = new Uint8Array(load());
    ram.fill(0); ram.set(orig, BASE);
    ram.set([BASE >>> 24, (BASE >>> 16) & 255, (BASE >>> 8) & 255, BASE & 255], 0x100);
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const { writeCellToChipRam } = await import('@/engine/uade/writeCellToChipRam');
    const g = await import('@/lib/song/gridBaseline');
    const song = parseAProSysFile(load(), 'action.aps');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    const cell = { ...song.patterns[0].channels[0].rows[0], note: gridNote(7), instrument: 2 };
    song.patterns[0].channels[0].rows[0] = cell;
    await writeCellToChipRam(song, 0, 0, 0, cell);
    const played = ram.slice(BASE, BASE + orig.length);
    expect(played[TRACK0] & 0x3f).toBe(7);
    expect(played[TRACK0 + 1]).toBe(1);
    const res = await exportNativeSong(song);
    expect(Buffer.from(played).equals(Buffer.from(res!.data as Uint8Array))).toBe(true);
  });
});
