import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePeterVerswyvelenPackerFile } from '@/lib/import/formats/PeterVerswyvelenPackerParser';
import { noteToPeriod } from '@/lib/amiga/periodNotes';

const path = 'public/data/songs/formats/zarathrusta title.pvp';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const parse = () => parsePeterVerswyvelenPackerFile(load(), 'zarathrusta title.pvp');

describe('Peter Verswyvelen Packer editable grid', () => {
  const song = parse();
  const layout = song.uadePatternLayout!;
  const bytes = new Uint8Array(load());

  it('reads 16-row patterns with notes at their run-start offsets', () => {
    expect(song.patterns.length).toBeGreaterThan(1);
    expect(song.patterns.some((p) => p.channels.some((c) => c.rows.some((r) => r.note > 0)))).toBe(true);
    expect(song.patterns.every((p) => p.length === 16)).toBe(true);
    expect(layout.getCellFileOffset!(0, 0, 0)).toBeGreaterThanOrEqual(256);
  });

  it('every placed cell re-encodes over its stored bytes to the same bytes', () => {
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      if (off < 0) return; // a repeat row of the note above: no file place
      const stored = bytes.subarray(off, off + 4);
      expect([...layout.encodeCell(cell, stored)]).toEqual([...stored]);
    })));
  });
});

describe('Peter Verswyvelen Packer export', () => {
  const run = async (edit: boolean) => {
    const { exportPeterVerswyvelenPacker } = await import('@/lib/export/PeterVerswyvelenPackerExporter');
    const s = parse();
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(s.patterns), g.extraBaselineOf(s.patterns));
    let off = -1;
    let want = 0;
    if (edit) {
      let found = false;
      for (let p = 0; p < s.patterns.length && !found; p++) for (let c = 0; c < 4 && !found; c++) {
        const r = s.patterns[p].channels[c].rows.findIndex((x) => x.note > 0);
        if (r < 0) continue;
        found = true;
        off = s.uadePatternLayout!.getCellFileOffset!(p, r, c);
        const row = s.patterns[p].channels[c].rows[r];
        const note = row.note === 30 ? 31 : 30;
        want = noteToPeriod(note);
        s.patterns[p].channels[c].rows[r] = { ...row, note, period: undefined };
      }
    }
    return { out: (await exportPeterVerswyvelenPacker(s)).data, off, want };
  };

  it('unedited export equals the original bytes', async () => {
    const { out } = await run(false);
    expect(Buffer.from(out).equals(Buffer.from(load()))).toBe(true);
  });

  it('a note edit changes only that cell period', async () => {
    const { out, off, want } = await run(true);
    const orig = new Uint8Array(load());
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every((i) => i >= off && i < off + 2)).toBe(true);
    expect(((out[off] & 0x03) << 8) | out[off + 1]).toBe(want);
  });
});
