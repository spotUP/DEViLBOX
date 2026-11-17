import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMajorTomFile } from '@/lib/import/formats/MajorTomParser';
import { MAJORTOM_PERIODS } from '@/engine/uade/encoders/MajorTomEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

const path = 'public/data/songs/formats/pseudofever.arp';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

describe('Major Tom editable grid', () => {
  const song = parseMajorTomFile(load(), 'pseudofever.arp');
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads the order, speed and patterns from the file', () => {
    expect(song.patterns.length).toBe(14);
    expect(song.songPositions.length).toBe(24);
    expect(song.initialSpeed).toBe(3);
  });

  it('grid note is measured from the player period of the note byte', () => {
    let notes = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const b = bytes[layout.getCellFileOffset!(p, r, ch)];
      if (!cell.note) return;
      notes++;
      const idx = ((b - 0x10) >> 4) * 12 + (b & 0xf);
      expect(cell.note).toBe(periodToGridNote(MAJORTOM_PERIODS[idx]));
    })));
    expect(notes).toBeGreaterThan(100);
  });

  it('every cell re-encodes to its file bytes', () => {
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      const stored = bytes.subarray(off, off + 4);
      expect(Array.from(layout.encodeCell(cell, stored))).toEqual(Array.from(stored));
    })));
  });

  it('a note edit writes the byte for that note and keeps the instrument', () => {
    const base = song.patterns[0].channels[0].rows[0];
    const off = layout.getCellFileOffset!(0, 0, 0);
    const target = periodToGridNote(MAJORTOM_PERIODS[24]);
    const out = layout.encodeCell({ ...base, note: target, instrument: 5 }, bytes.subarray(off, off + 4));
    expect(out[0]).toBe(0x10 + 2 * 16);
    expect(out[1]).toBe(5);
  });
});

// The router (nativeExportRouter) still refuses this format's low-octave notes: it needs 'majortom' in holdsLowOctave.
describe('Major Tom export (exporter direct)', () => {
  const run = async (edit: boolean) => {
    const { exportMajorTom } = await import('@/lib/export/MajorTomExporter');
    const song = parseMajorTomFile(load(), 'pseudofever.arp');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    let off = -1;
    if (edit) {
      const cell = song.patterns[0].channels[0].rows[0];
      song.patterns[0].channels[0].rows[0] = { ...cell, note: periodToGridNote(MAJORTOM_PERIODS[24]), instrument: 1 };
      off = song.uadePatternLayout!.getCellFileOffset!(0, 0, 0);
    }
    const out = (await exportMajorTom(song)).data;
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
    for (const i of diff) expect(i >= off && i < off + 4).toBe(true);
    expect(out[off]).toBe(0x30);
  });
});
