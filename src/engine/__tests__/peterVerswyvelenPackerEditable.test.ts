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

  it('reads patterns with notes at their step-table offsets', () => {
    expect(song.patterns.length).toBeGreaterThan(1);
    expect(song.patterns.some((p) => p.channels.some((c) => c.rows.some((r) => r.note > 0)))).toBe(true);
    expect(layout.getCellFileOffset!(0, 0, 0)).toBeGreaterThanOrEqual(256);
  });

  it('every cell re-encodes to its file bytes', () => {
    song.patterns.forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, r) => {
      const off = layout.getCellFileOffset!(p, r, ch);
      expect([...layout.encodeCell(cell)]).toEqual([...bytes.subarray(off, off + 4)]);
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
    expect(((out[off] & 0x0f) << 8) | out[off + 1]).toBe(want);
  });
});
