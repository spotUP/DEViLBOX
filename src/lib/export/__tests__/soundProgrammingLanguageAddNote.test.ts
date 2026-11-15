/**
 * Sound Programming Language: a note on an empty row inside a held note splits it ([N] -> [Cd][N][C(H-d)][new][CH]),
 * the 4 bytes taken from the 0xF4 padding behind it (soundProgrammingLanguageEdits.ts addNote). Real song:
 * boulderdash.spl (the only module of the decoded build in the corpus). Reloaded, the note stands on that row, the
 * song has the same length, the file the same size, and no cell outside the edited run changed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pattern } from '@/types';
import { buildSplGrid, type SplGrid } from '@lib/import/formats/soundProgrammingLanguageGrid';
import { applySplGridEdits } from '@lib/import/formats/soundProgrammingLanguageEdits';

const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/boulderdash.spl')));
const clone = (ps: Pattern[]): Pattern[] => structuredClone(ps);

describe('Sound Programming Language note on an empty row: boulderdash.spl', () => {
  it('lands on that row, keeps the size and the length, changes only the run it split', () => {
    const g = buildSplGrid(raw) as SplGrid;
    const patterns = clone(g.patterns);
    const rows = patterns[0].channels[0].rows;
    const r = rows.findIndex((x, i) => i > 0 && x.note === 0 && rows[i - 1].note > 0);
    expect(r).toBeGreaterThan(0);
    rows[r].note = 40;
    const res = applySplGridEdits(raw, patterns);
    expect(res.warnings).toEqual([]);
    expect(res.data.length).toBe(raw.length);
    const again = buildSplGrid(res.data) as SplGrid;
    expect(typeof again).not.toBe('string');
    expect(again.rows).toBe(g.rows);
    expect(again.patterns[0].channels[0].rows[r].note).toBe(40);
    let changed = 0;
    g.patterns.forEach((pt, pi) => pt.channels.forEach((ch, ci) => ch.rows.forEach((was, ri) => {
      const now = again.patterns[pi].channels[ci].rows[ri];
      if (now.note !== was.note) { changed++; expect(was.note).toBe(0); expect(now.note).toBe(40); }
    })));
    expect(changed).toBeGreaterThanOrEqual(1);
  });

  it('refuses a different instrument, writing nothing', () => {
    const g = buildSplGrid(raw) as SplGrid;
    const patterns = clone(g.patterns);
    const rows = patterns[0].channels[0].rows;
    const r = rows.findIndex((x, i) => i > 0 && x.note === 0 && rows[i - 1].note > 0);
    rows[r].note = 40;
    rows[r].instrument = 99;
    const res = applySplGridEdits(raw, patterns);
    expect(res.warnings.some((w) => /not written/.test(w))).toBe(true);
    expect(Buffer.from(res.data).equals(Buffer.from(raw))).toBe(true);
  });

  it('second empty row in other voices and patterns: every one lands or is refused', () => {
    const g = buildSplGrid(raw) as SplGrid;
    let landed = 0, refused = 0;
    for (let c = 0; c < 4; c++) for (let pi = 0; pi < Math.min(3, g.patterns.length); pi++) {
      const rows0 = g.patterns[pi].channels[c].rows;
      const r = rows0.findIndex((x, i) => i > 0 && x.note === 0 && rows0[i - 1].note > 0);
      if (r < 0) continue;
      const patterns = clone(g.patterns);
      patterns[pi].channels[c].rows[r].note = 45;
      const res = applySplGridEdits(raw, patterns);
      if (res.warnings.length > 0) { refused++; expect(Buffer.from(res.data).equals(Buffer.from(raw))).toBe(true); continue; }
      const again = buildSplGrid(res.data) as SplGrid;
      expect(again.patterns[pi].channels[c].rows[r].note).toBe(45);
      landed++;
    }
    console.log('SPL landed', landed, 'refused', refused);
    expect(landed + refused).toBeGreaterThan(0);
  });
});
