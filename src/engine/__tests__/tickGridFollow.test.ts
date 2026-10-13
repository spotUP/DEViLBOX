/** NE-4: one grid-follow mapping, used by EaglePlayerEngine (and NuadeEngine, see nuadeEngine.test.ts). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GridFollow, songTickGrid } from '../replayer/tickGridFollow';
import { eaglePlayerGrid } from '../eagleplayer/EaglePlayerEngine';
import type { GridFollowPosition } from '../replayer/tickGridFollow';

const song = {
  initialSpeed: 3,
  songPositions: [0, 1],
  patterns: [{ length: 4 }, { length: 2 }] as unknown as never,
  restartPosition: 0,
};

describe('NE-4 tickGridFollow', () => {
  it('maps player ticks to the grid row (speed ticks per row, patterns in order, looping)', () => {
    const f = new GridFollow();
    const seen: GridFollowPosition[] = [];
    f.onPosition((p) => seen.push(p));
    f.setGrid(songTickGrid(song));
    f.followTicks(0);
    f.followTicks(3 * 5);   // row 5 of the song = pattern 1 row 1
    f.followTicks(3 * 6);   // one pass later: back to the top
    expect(seen).toEqual([
      { songPos: 0, row: 0, ticks: 0 },
      { songPos: 1, row: 1, ticks: 15 },
      { songPos: 0, row: 0, ticks: 18 },
    ]);
  });

  it('reports an order and row as the grid\'s, held inside the grid; no grid or no listener reports nothing', () => {
    const f = new GridFollow();
    const seen: GridFollowPosition[] = [];
    f.followOrderRow(1, 1);
    f.setGrid(songTickGrid(song));
    f.followOrderRow(1, 1);          // no listener yet
    const off = f.onPosition((p) => seen.push(p));
    f.followOrderRow(1, 1);
    f.followOrderRow(9, 99);         // past the end: last row
    off();
    f.followOrderRow(0, 0);
    expect(seen).toEqual([{ songPos: 1, row: 1, ticks: 0 }, { songPos: 1, row: 1, ticks: 0 }]);
  });

  it('EaglePlayerEngine builds its grid through the shared mapping, with the parser-measured tick of row 0', () => {
    const grid = eaglePlayerGrid({ ...song, eaglePlayerTickGrid: { firstTick: 2, passTicks: 18 } });
    expect(grid).toEqual({ firstTick: 2, passTicks: 18, speed: 3, songPositions: [0, 1], patternLengths: [4, 2], loopFrom: 0 });
    const src = readFileSync(join(__dirname, '../eagleplayer/EaglePlayerEngine.ts'), 'utf8');
    expect(src).toContain("from '@engine/replayer/tickGridFollow'");
    expect(src).not.toContain('tickGridPosition(');
    const nuade = readFileSync(join(__dirname, '../nuade/NuadeEngine.ts'), 'utf8');
    expect(nuade).toContain("from '@engine/replayer/tickGridFollow'");
    expect(nuade).not.toContain('tickGridPosition(');
  });
});
