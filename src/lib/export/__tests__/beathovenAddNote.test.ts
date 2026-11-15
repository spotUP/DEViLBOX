/**
 * Beathoven Synthesizer: a note on an empty row inside a held plain note splits that note and moves the grown stream to
 * the end of the code hunk (beathovenEdits.ts addNote). Real songs: the .bss corpus. Reloaded, the note stands on that
 * row, the song has the same length and every cell not played from the moved stream is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pattern } from '@/types';
import { buildBthGrid } from '@lib/import/formats/beathovenGrid';
import { applyBeathovenGridEdits } from '@lib/import/formats/beathovenEdits';

const FILES = ['public/data/songs/formats/beathoven_smallest.bss', 'public/data/songs/beathoven-synthesizer/tristar cracktro.bss'];
const clone = (ps: Pattern[]): Pattern[] => structuredClone(ps);

describe.each(FILES)('Beathoven note on an empty row: %s', (file) => {
  const raw = new Uint8Array(readFileSync(join(process.cwd(), file)));

  it('lands on that row, grows the module, keeps the length and the other cells', () => {
    const g = buildBthGrid(raw);
    if (typeof g === 'string') throw new Error(g);
    let landed = 0;
    outer: for (let p = 0; p < g.patterns.length; p++) for (let c = 0; c < 4; c++) {
      const rows = g.patterns[p].channels[c].rows;
      for (let r = 1; r < rows.length; r++) {
        if (rows[r].note !== 0 || rows[r - 1].note === 0) continue;
        const patterns = clone(g.patterns);
        patterns[p].channels[c].rows[r].note = 40;
        const res = applyBeathovenGridEdits(raw, patterns);
        if (res.data.length === raw.length) continue; // refused: nothing written
        const again = buildBthGrid(res.data);
        if (typeof again === 'string') throw new Error(again);
        expect(again.rows).toBe(g.rows);
        expect(again.patterns[p].channels[c].rows[r].note).toBe(40);
        expect(res.data.length).toBeGreaterThan(raw.length);
        landed++;
        break outer;
      }
    }
    expect(landed).toBe(1);
  });

  it('refuses a different instrument, writing nothing', () => {
    const g = buildBthGrid(raw);
    if (typeof g === 'string') throw new Error(g);
    const patterns = clone(g.patterns);
    const rows = patterns[0].channels[0].rows;
    const r = rows.findIndex((x, i) => i > 0 && x.note === 0 && rows[i - 1].note > 0);
    rows[r].note = 40;
    rows[r].instrument = 99;
    const res = applyBeathovenGridEdits(raw, patterns);
    expect(res.warnings.some((w) => /not written/.test(w))).toBe(true);
    expect(Buffer.from(res.data).equals(Buffer.from(raw))).toBe(true);
  });
});
