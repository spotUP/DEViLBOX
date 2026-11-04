import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJxsFile } from '../JxsParser';

const load = (n: string) => {
  const t = parseJxsFile(new Uint8Array(readFileSync(`public/data/songs/formats/${n}`)), n);
  if (!t) throw new Error('parse failed');
  return t;
};

describe('JayTrax play range', () => {
  // The engine stops before the row at endBar/endStep, so an end at step 0 excludes that bar.
  it('popcorn plays bars 0..8 (ends at 9:00), replay restarts at bar 0', () => {
    const t = load('popcorn.jxs');
    expect(t.songPositions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(t.restartPosition).toBe(0);
  });
  it('jbells plays only bar 4 (4:00..5:00)', () => {
    expect(load('jbells.jxs').songPositions).toEqual([4]);
  });
  it('dreamer includes its partly played end bar (ends at 9:16)', () => {
    expect(load('dreamer.jxs').songPositions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
