import { describe, it, expect } from 'vitest';
import {
  classifyRepetition,
  repetitionWeight,
  atMotifPosition,
  consecutiveRun,
  barredForRepetition,
} from '../repetition';
import type { RecentMove } from '../performanceContext';

const ROWS_PER_BAR = 16;
const ROWS_PER_PHRASE = 256;      // 16 bars
const OPTS = { rowsPerBar: ROWS_PER_BAR, rowsPerPhrase: ROWS_PER_PHRASE };

function move(moveId: string, row: number): RecentMove {
  return { invocationId: `${moveId}-${row}`, moveId, row, timeSec: row / 8, source: 'live', origin: 'ai' };
}

describe('classifyRepetition — a motif is not a rut', () => {
  it('calls the same move at the same phrase position a motif', () => {
    // Bar 2 of every phrase, four phrases running.
    const moves = [0, 1, 2, 3].map(p => move('echoThrow', p * ROWS_PER_PHRASE + 2 * ROWS_PER_BAR));
    const verdict = classifyRepetition(moves, OPTS);
    expect(verdict.kind).toBe('motif');
    expect(verdict.moveId).toBe('echoThrow');
    expect(verdict.reason).toMatch(/motif/);
  });

  it('calls the same move at scattered positions, close together, a rut', () => {
    const moves = [3, 19, 40, 57, 70].map(row => move('echoThrow', row));
    const verdict = classifyRepetition(moves, OPTS);
    expect(verdict.kind).toBe('rut');
    expect(verdict.reason).toMatch(/rut/);
  });

  it('calls a varied sequence varied', () => {
    const moves = [
      move('echoThrow', 0), move('dubStab', 20), move('sonarPing', 40),
      move('filterDrop', 60), move('springSlam', 80),
    ];
    expect(classifyRepetition(moves, OPTS).kind).toBe('varied');
  });

  it('refuses to call anything a pattern on two moves', () => {
    const verdict = classifyRepetition([move('echoThrow', 0), move('echoThrow', 16)], OPTS);
    expect(verdict.kind).toBe('varied');
    expect(verdict.reason).toMatch(/not enough history/);
  });

  it('judges the most repeated move, ignoring one-offs around it', () => {
    const moves = [
      move('echoThrow', 2 * ROWS_PER_BAR),
      move('sonarPing', 3 * ROWS_PER_BAR),
      move('echoThrow', ROWS_PER_PHRASE + 2 * ROWS_PER_BAR),
      move('dubStab', ROWS_PER_PHRASE + 9 * ROWS_PER_BAR),
      move('echoThrow', 2 * ROWS_PER_PHRASE + 2 * ROWS_PER_BAR),
    ];
    const verdict = classifyRepetition(moves, OPTS);
    expect(verdict.moveId).toBe('echoThrow');
    expect(verdict.kind).toBe('motif');
  });

  it('sees a motif across the phrase wrap, not as two scattered clusters', () => {
    // Bar 15.5 of each phrase — just before the wrap.
    const near = ROWS_PER_PHRASE - 8;
    const moves = [0, 1, 2].map(p => move('hpfRise', p * ROWS_PER_PHRASE + near));
    expect(classifyRepetition(moves, OPTS).kind).toBe('motif');
  });

  it('follows the grid it is handed', () => {
    // Same rows, but a phrase that is half as long: bar 2 of phrase 0 and bar
    // 2 of phrase 1 are no longer the same position.
    const moves = [0, 1, 2, 3].map(p => move('echoThrow', p * ROWS_PER_PHRASE + 2 * ROWS_PER_BAR));
    const verdict = classifyRepetition(moves, { rowsPerBar: 16, rowsPerPhrase: 96 });
    expect(verdict.kind).not.toBe('motif');
  });
});

describe('repetitionWeight — protect the motif, break the rut', () => {
  const motif = classifyRepetition(
    [0, 1, 2].map(p => move('echoThrow', p * ROWS_PER_PHRASE + 2 * ROWS_PER_BAR)),
    OPTS,
  );
  const rut = classifyRepetition([3, 19, 40, 57, 70].map(r => move('echoThrow', r)), OPTS);

  it('raises the motif move where the motif belongs', () => {
    expect(repetitionWeight('echoThrow', motif, 0.5, true)).toBeGreaterThan(1);
  });

  it('leaves the motif move alone everywhere else', () => {
    expect(repetitionWeight('echoThrow', motif, 0.5, false)).toBe(1);
  });

  it('pushes the rut move down so something else can win', () => {
    expect(repetitionWeight('echoThrow', rut, 0.5)).toBeLessThan(0.5);
  });

  it('breaks out harder for a persona that values novelty', () => {
    expect(repetitionWeight('echoThrow', rut, 1))
      .toBeLessThan(repetitionWeight('echoThrow', rut, 0));
  });

  it('never zeroes a move outright — a rut is a nudge, not a ban', () => {
    expect(repetitionWeight('echoThrow', rut, 1)).toBeGreaterThan(0);
  });

  it('leaves every other move untouched', () => {
    expect(repetitionWeight('dubStab', rut, 1)).toBe(1);
    expect(repetitionWeight('dubStab', motif, 1, true)).toBe(1);
  });
});

describe('atMotifPosition', () => {
  it('matches the same bar of a later phrase', () => {
    expect(atMotifPosition(
      3 * ROWS_PER_PHRASE + 2 * ROWS_PER_BAR, 2 * ROWS_PER_BAR, ROWS_PER_PHRASE, ROWS_PER_BAR,
    )).toBe(true);
  });

  it('does not match a different bar', () => {
    expect(atMotifPosition(
      3 * ROWS_PER_PHRASE + 9 * ROWS_PER_BAR, 2 * ROWS_PER_BAR, ROWS_PER_PHRASE, ROWS_PER_BAR,
    )).toBe(false);
  });

  it('matches across the wrap', () => {
    expect(atMotifPosition(
      ROWS_PER_PHRASE + 4, ROWS_PER_PHRASE - 4, ROWS_PER_PHRASE, ROWS_PER_BAR,
    )).toBe(true);
  });
});

describe('consecutiveRun and the repetition bar', () => {
  const verdict = classifyRepetition([3, 19, 40, 57, 70].map(r => move('echoThrow', r)), OPTS);

  it('counts how many times the latest move fired in a row', () => {
    const moves = [
      move('dubStab', 0), move('echoThrow', 8), move('echoThrow', 16), move('echoThrow', 24),
    ];
    expect(consecutiveRun(moves)).toEqual({ moveId: 'echoThrow', count: 3 });
  });

  it('resets the run when something else fires', () => {
    const moves = [move('echoThrow', 0), move('echoThrow', 8), move('dubStab', 16)];
    expect(consecutiveRun(moves)).toEqual({ moveId: 'dubStab', count: 1 });
  });

  it('bars a move that has just fired three times running', () => {
    const moves = [0, 8, 16].map(r => move('echoThrow', r));
    expect(barredForRepetition('echoThrow', moves, verdict)).toBe(true);
    expect(barredForRepetition('dubStab', moves, verdict)).toBe(false);
  });

  it('does not bar it before the limit', () => {
    const moves = [0, 8].map(r => move('echoThrow', r));
    expect(barredForRepetition('echoThrow', moves, verdict)).toBe(false);
  });

  it('exempts a motif at its own place in the phrase', () => {
    const motif = classifyRepetition(
      [0, 1, 2].map(p => move('hpfRise', p * ROWS_PER_PHRASE + 2 * ROWS_PER_BAR)),
      OPTS,
    );
    const moves = [0, 1, 2].map(p => move('hpfRise', p * ROWS_PER_PHRASE + 2 * ROWS_PER_BAR));
    expect(barredForRepetition('hpfRise', moves, motif, true)).toBe(false);
    // Away from its place, the bar applies like anything else.
    expect(barredForRepetition('hpfRise', moves, motif, false)).toBe(true);
  });

  it('reports nothing for an empty history', () => {
    expect(consecutiveRun([])).toBeNull();
  });
});
