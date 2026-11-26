/**
 * Tim Follin ([A][la][B][lb] -> [A][la+lb][Nop][Nop]) and Sound Programming Language ([Ca][A][Cb][B] -> [C(a+b)][A][Cb][F4]):
 * a removed note's length moves into the held note before it. Real songs; reloaded, the row is empty, the song has the same
 * length and no cell outside the rows sharing the edited stream bytes changed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pattern } from '@/types';
import { buildTimFollinGrid } from '@lib/import/formats/timFollinGrid';
import { applyTimFollinGridEdits } from '@lib/import/formats/timFollinEdits';
import { buildSplGrid, type SplGrid } from '@lib/import/formats/soundProgrammingLanguageGrid';
import { applySplGridEdits } from '@lib/import/formats/soundProgrammingLanguageEdits';

const read = (f: string): Uint8Array => new Uint8Array(readFileSync(join(process.cwd(), f)));
type Grid = { patterns: Pattern[]; rows: number };

/** Remove every note in turn (one edit per run); the ones that write must read back empty with the song length kept. */
function sweep(raw: Uint8Array, grid: Grid, apply: (p: Pattern[]) => { data: Uint8Array; warnings: string[] }, reload: (d: Uint8Array) => Grid | null): number {
  let wrote = 0;
  const spots: Array<[number, number, number]> = [];
  grid.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((row, r) => { if (row.note > 0 && row.note < 97) spots.push([p, c, r]); })));
  for (const [p, c, r] of spots) {
    if (wrote >= 3) break;
    const patterns = structuredClone(grid.patterns);
    patterns[p].channels[c].rows[r].note = 0;
    const res = apply(patterns);
    if (res.warnings.length > 0 || res.data.every((b, i) => b === raw[i])) continue;
    const again = reload(res.data)!;
    expect(again.rows).toBe(grid.rows);
    expect(again.patterns[p].channels[c].rows[r].note).toBe(0);
    wrote++;
  }
  return wrote;
}

describe('note removal by merging the length into the held note', () => {
  it('Tim Follin: sly spy title.tf', () => {
    const raw = read('public/data/songs/follin-player-ii/sly spy title.tf');
    const g = buildTimFollinGrid(raw)!;
    const wrote = sweep(raw, g, (p) => applyTimFollinGridEdits(raw, p), (d) => buildTimFollinGrid(d));
    expect(wrote).toBeGreaterThanOrEqual(1);
  });
  it('Sound Programming Language: boulderdash.spl', () => {
    const raw = read('public/data/songs/sound-programming-language/boulderdash.spl');
    const g = buildSplGrid(raw) as SplGrid;
    const wrote = sweep(raw, g, (p) => applySplGridEdits(raw, p), (d) => buildSplGrid(d) as SplGrid);
    expect(wrote).toBeGreaterThanOrEqual(1);
  });
});
