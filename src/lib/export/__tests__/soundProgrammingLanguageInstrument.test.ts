/**
 * Sound Programming Language: an instrument edit overwrites the inline 0x22-byte record in force with another
 * instrument's record (same length). boulderdash.spl, applySplGridEdits: a whole record's notes change to another
 * instrument and read back as it; a single note of a record that covers more is refused.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pattern } from '@/types';
import { buildSplGrid, type SplGrid } from '@lib/import/formats/soundProgrammingLanguageGrid';
import { applySplGridEdits } from '@lib/import/formats/soundProgrammingLanguageEdits';

const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/boulderdash.spl')));
const grid = buildSplGrid(raw) as SplGrid;
const clone = (): Pattern[] => structuredClone(grid.patterns);

function covered(record: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  grid.rowSources.forEach((p, pi) => p.forEach((col, c) => col.forEach((s, r) => { if (s?.record === record) out.push([pi, c, r]); })));
  return out;
}

describe('Sound Programming Language instrument edit', () => {
  it('rewrites a record to another instrument and reads back as it, same length', () => {
    const records = [...new Set(grid.rowSources.flatMap((p) => p.flatMap((col) => col.flatMap((s) => (s ? [s.record] : [])))))];
    let done = 0;
    for (const record of records) {
      for (let target = 1; target <= grid.instrumentRecords.length; target++) {
        const cells = covered(record);
        const was = grid.patterns[cells[0][0]].channels[cells[0][1]].rows[cells[0][2]].instrument;
        if (was === target) continue;
        const pats = clone();
        for (const [p, c, r] of cells) pats[p].channels[c].rows[r].instrument = target;
        const res = applySplGridEdits(raw, pats);
        if (res.patched === 0) continue;
        expect(res.data.length).toBe(raw.length);
        const again = buildSplGrid(res.data) as SplGrid;
        for (const [p, c, r] of cells) {
          expect(again.patterns[p].channels[c].rows[r].instrument).toBe(target);
          expect(again.patterns[p].channels[c].rows[r].note).toBe(grid.patterns[p].channels[c].rows[r].note);
        }
        done++;
      }
    }
    expect(done).toBeGreaterThan(0);
  });

  it('refuses one note of a record that covers several', () => {
    const record = grid.rowSources.flatMap((p) => p.flatMap((col) => col.flatMap((s) => (s ? [s.record] : [])))).find((rec) => covered(rec).length > 1)!;
    const [p, c, r] = covered(record)[0];
    const pats = clone();
    pats[p].channels[c].rows[r].instrument = pats[p].channels[c].rows[r].instrument === 1 ? 2 : 1;
    const res = applySplGridEdits(raw, pats);
    expect(res.patched).toBe(0);
    expect(res.warnings.join(' ')).toMatch(/covers/);
  });
});
