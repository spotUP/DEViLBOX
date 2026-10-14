import { describe, it, expect } from 'vitest';
import { tickGridPosition, gridRowStartTick, type TickGrid } from '../tickGridPosition';
import { GridFollow } from '@engine/replayer/tickGridFollow';

const grid = (firstTick: number): TickGrid => ({
  speed: 6, songPositions: [0, 1, 0], patternLengths: [4, 7], firstTick, loopFrom: 0,
});

describe('gridRowStartTick inverts the playhead follow', () => {
  for (const firstTick of [0, 5]) {
    it(`gives the tick at which every row of a mixed-length grid plays (firstTick ${firstTick})`, () => {
      const g = grid(firstTick);
      const lens = [4, 7, 4];
      for (let p = 0; p < lens.length; p++) {
        for (let r = 0; r < lens[p]; r++) {
          const t = gridRowStartTick(g, p, r);
          expect(tickGridPosition(t, g)).toEqual({ songPos: p, row: r });
          // the row holds for its whole `speed` ticks
          expect(tickGridPosition(t + g.speed - 1, g)).toEqual({ songPos: p, row: r });
        }
      }
    });
  }

  it('clamps a row or position past the grid to its last row', () => {
    const g = grid(0);
    expect(gridRowStartTick(g, 2, 99)).toBe(gridRowStartTick(g, 2, 3));
    expect(gridRowStartTick(g, 9, 0)).toBe(gridRowStartTick(g, 2, 0));
  });
});

describe('GridFollow.targetOf', () => {
  it('gives order and row for an orderRow player', () => {
    const f = new GridFollow();
    f.setGrid(grid(0));
    expect(f.targetOf(1, 3, 'orderRow')).toEqual({ kind: 'orderRow', order: 1, row: 3 });
  });
  it('gives the speed-tick range of the row for a tick player', () => {
    const f = new GridFollow();
    f.setGrid(grid(5));
    const from = gridRowStartTick(grid(5), 1, 2);
    expect(f.targetOf(1, 2, 'tick')).toEqual({ kind: 'ticks', from, to: from + 6 });
  });
});
