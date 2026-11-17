import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseMaximumEffectFile } from '@/lib/import/formats/MaximumEffectParser';
import { encodeMaximumEffectCell, decodeMaximumEffectCell } from '@/engine/uade/encoders/MaximumEffectEncoder';

const path = 'public/data/songs/maximum-effect/MAX.DinosaurDetective music1';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const noteCell = (song: ReturnType<typeof parseMaximumEffectFile>) => {
  for (let p = 0; p < song.patterns.length; p++) {
    for (let c = 0; c < song.numChannels; c++) {
      const r = song.patterns[p].channels[c].rows.findIndex((x) => x.note > 0 && x.note < 97);
      if (r >= 0) return { p, c, r };
    }
  }
  throw new Error('no note');
};

describe('Maximum Effect editable grid', () => {
  const song = parseMaximumEffectFile(load(), 'MAX.DinosaurDetective music1');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads patterns with notes', () => {
    expect(layout.formatId).toBe('maximumEffect');
    expect(song.patterns[0].length).toBe(64);
    expect(() => noteCell(song)).not.toThrow();
  });

  it('every placed cell re-encodes to its file bytes', () => {
    let placed = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return;
      placed++;
      expect([...layout.encodeCell(cell, bytes.subarray(off, off + 2))]).toEqual([...bytes.subarray(off, off + 2)]);
    })));
    expect(placed).toBeGreaterThan(20);
  });

  it('a note edit writes that period index and keeps instrument and flags', () => {
    const stored = new Uint8Array([0x83, 0x25]); // instrument 3, period offset 0x24, keep volume
    const cell = decodeMaximumEffectCell(stored);
    expect(cell.note).toBe(13 + 0x12);
    expect([...encodeMaximumEffectCell({ ...cell, note: cell.note + 2 }, stored)]).toEqual([0x83, 0x29]);
  });
});

describe('Maximum Effect export (exporter direct)', () => {
  const run = async (edit: boolean) => {
    const { exportMaximumEffect } = await import('@/lib/export/MaximumEffectExporter');
    const song = parseMaximumEffectFile(load(), 'MAX.DinosaurDetective music1');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    if (edit) {
      const { p, c, r } = noteCell(song);
      off = song.uadePatternLayout!.getCellFileOffset!(p, r, c);
      song.patterns[p].channels[c].rows[r] = { ...song.patterns[p].channels[c].rows[r], note: song.patterns[p].channels[c].rows[r].note + 1 };
    }
    return { out: (await exportMaximumEffect(song)).data, off };
  };

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('one cell edit changes only that note word', async () => {
    const { out, off } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff).toEqual([off + 1]);
  });

  it('every MAX.* corpus file (including the 0xD4-damaged complete and intro) parses to a grid', () => {
    const dir = 'public/data/songs/maximum-effect/';
    const names = readdirSync(dir).filter((f) => f.startsWith('MAX.'));
    expect(names.length).toBe(14);
    for (const f of names) {
      const b = readFileSync(dir + f);
      const song = parseMaximumEffectFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, f);
      expect(song.patterns.length, f).toBeGreaterThan(0);
    }
  });
});
