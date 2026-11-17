import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePSAFile } from '@/lib/import/formats/PSAParser';
import { PSA_PERIODS } from '@/engine/uade/encoders/PSAEncoder';
import { periodToNote } from '@/lib/amiga/periodNotes';

const path = 'public/data/songs/formats/the punisher - title.psa';
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
