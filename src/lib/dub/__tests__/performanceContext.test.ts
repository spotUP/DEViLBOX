import { describe, it, expect } from 'vitest';
import {
  PerformanceMemory,
  buildPerformanceContext,
  readWetEnergy,
  isGestureActive,
  movesFiredWithin,
  lastPhrase,
  type ArrangementSnapshot,
} from '../performanceContext';
import { computeMusicalPosition } from '../musicalClock';
import type { ChannelEventSource } from '../musicalEvents';

const TICKS_PER_ROW = 6;            // speed 6 → 4 rows/beat, 16 rows/bar
const SOURCES: ChannelEventSource[] = [
  { channel: 0, onsets: [{ row: 0 }, { row: 8 }, { row: 16 }, { row: 20 }] },   // kick-ish
  { channel: 1, onsets: [{ row: 4, strength: 0.8 }, { row: 12, strength: 0.8 }] }, // snare-ish
];

function fire(memory: PerformanceMemory, over: Partial<Parameters<PerformanceMemory['noteFire']>[0]> = {}) {
  const event = {
    invocationId: 'inv-1',
    moveId: 'echoThrow',
    channelId: 1,
    row: 4,
    timeSec: 2,
    source: 'live' as const,
    isHold: true,
    ...over,
  };
  memory.noteFire(event);
  return event;
}

function ctxAt(row: number, memory = new PerformanceMemory()) {
  return buildPerformanceContext(memory, {
    row,
    ticksPerRow: TICKS_PER_ROW,
    bpm: 120,
    sources: SOURCES,
    energy: readWetEnergy(
      { returnGain: 0.9, echoWet: 0.6, springWet: 0.2, echoIntensity: 0.45, extFeedbackGain: 0.035 },
      memory.getActiveGestures().length,
    ),
  });
}

describe('PerformanceContext — look-ahead and recent events', () => {
  it('reports every look-ahead window from the clock, not from hardcoded rows', () => {
    const ctx = ctxAt(0);
    // speed 6: 4 rows/beat, 16 rows/bar. Row 4 is the next snare.
    expect(ctx.upcoming['1/16'].map(e => e.row)).toEqual([]);          // rows 0..1, exclusive of now
    expect(ctx.upcoming['beat'].map(e => e.row)).toEqual([]);          // rows 0..4, half-open
    expect(ctx.upcoming['bar'].map(e => e.row)).toEqual([4, 8, 12]);
    expect(ctx.upcoming['phrase'].map(e => e.row)).toEqual([4, 8, 12, 16, 20]);
  });

  it('never reports the same event as both recent and upcoming', () => {
    const ctx = ctxAt(8);
    const upcoming = new Set(ctx.upcoming['phrase'].map(e => `${e.channel}:${e.row}`));
    for (const e of ctx.recentEvents) {
      expect(upcoming.has(`${e.channel}:${e.row}`)).toBe(false);
    }
    // Row 8 itself is NOW: in neither list.
    expect(ctx.recentEvents.some(e => e.row === 8)).toBe(false);
    expect(ctx.upcoming['phrase'].some(e => e.row === 8)).toBe(false);
  });

  it('orders recent events nearest-to-now first and bounds them to one bar', () => {
    // Row 20, bar = 16 rows → the window is rows 4..19 inclusive.
    expect(ctxAt(20).recentEvents.map(e => e.row)).toEqual([16, 12, 8, 4]);
    // One row later the window starts at 5, so the row-4 snare drops out.
    expect(ctxAt(21).recentEvents.map(e => e.row)).toEqual([20, 16, 12, 8]);
  });

  it('carries the Gate B position rather than recomputing bar arithmetic', () => {
    const ctx = ctxAt(20);
    expect(ctx.position).toEqual(computeMusicalPosition(20, TICKS_PER_ROW, ctx.clockSettings));
    expect(ctx.position.bar).toBe(1);
    expect(ctx.position.rowsPerBar).toBe(16);
  });
});

describe('PerformanceMemory — gestures and moves', () => {
  it('tracks a hold as in flight until it releases', () => {
    const memory = new PerformanceMemory();
    fire(memory);
    expect(memory.getActiveGestures()).toHaveLength(1);
    expect(isGestureActive(ctxAt(6, memory), 'echoThrow', 1)).toBe(true);
    memory.noteRelease({ invocationId: 'inv-1', row: 12, timeSec: 4 });
    expect(memory.getActiveGestures()).toHaveLength(0);
    expect(isGestureActive(ctxAt(12, memory), 'echoThrow')).toBe(false);
  });

  it('does not track one-shots as gestures but still remembers them', () => {
    const memory = new PerformanceMemory();
    fire(memory, { invocationId: 'one', moveId: 'sonarPing', isHold: false });
    expect(memory.getActiveGestures()).toHaveLength(0);
    expect(memory.getRecentMoves().map(m => m.moveId)).toEqual(['sonarPing']);
  });

  it('records the release row on the matching fire', () => {
    const memory = new PerformanceMemory();
    fire(memory);
    memory.noteRelease({ invocationId: 'inv-1', row: 12, timeSec: 4 });
    expect(memory.getRecentMoves()[0].releasedRow).toBe(12);
  });

  it('remembers the user\'s own moves, not only the AI\'s', () => {
    const memory = new PerformanceMemory();
    fire(memory, { invocationId: 'a', source: 'live' });
    fire(memory, { invocationId: 'b', source: 'lane', moveId: 'dubStab' });
    expect(memory.getRecentMoves().map(m => m.source)).toEqual(['live', 'lane']);
  });

  it('counts moves within a row window', () => {
    const memory = new PerformanceMemory();
    fire(memory, { invocationId: 'a', row: 2 });
    fire(memory, { invocationId: 'b', row: 10 });
    fire(memory, { invocationId: 'c', row: 14, moveId: 'dubStab' });
    const ctx = ctxAt(16, memory);
    expect(movesFiredWithin(ctx, 8)).toBe(2);           // rows 9..16
    expect(movesFiredWithin(ctx, 8, 'dubStab')).toBe(1);
    expect(movesFiredWithin(ctx, 16)).toBe(3);
  });

  it('caps its history instead of growing without bound', () => {
    const memory = new PerformanceMemory({ recentMoveCap: 3 });
    for (let i = 0; i < 10; i++) fire(memory, { invocationId: `i${i}`, row: i, isHold: false });
    const moves = memory.getRecentMoves();
    expect(moves).toHaveLength(3);
    expect(moves.map(m => m.row)).toEqual([7, 8, 9]);
  });
});

describe('PerformanceMemory — time and rows since the last action', () => {
  it('reports infinity before anything has fired', () => {
    const memory = new PerformanceMemory();
    expect(memory.msSinceLastAction()).toBe(Number.POSITIVE_INFINITY);
    expect(memory.rowsSinceLastAction(40)).toBe(Number.POSITIVE_INFINITY);
  });

  it('measures elapsed time from an injected clock', () => {
    let t = 1000;
    const memory = new PerformanceMemory({ now: () => t });
    fire(memory);
    t = 1750;
    expect(memory.msSinceLastAction()).toBe(750);
  });

  it('measures rows since the fire', () => {
    const memory = new PerformanceMemory();
    fire(memory, { row: 4 });
    expect(memory.rowsSinceLastAction(11)).toBe(7);
  });

  it('forgets row distance across a seek, because the number would be a lie', () => {
    const memory = new PerformanceMemory();
    fire(memory, { row: 200 });
    memory.reset();
    expect(memory.rowsSinceLastAction(4)).toBe(Number.POSITIVE_INFINITY);
    // What it played is still what it played.
    expect(memory.getRecentMoves()).toHaveLength(1);
    // Nothing is in flight after a stop.
    expect(memory.getActiveGestures()).toHaveLength(0);
  });
});

describe('PerformanceMemory — phrase history', () => {
  const pos = (row: number) => computeMusicalPosition(row, TICKS_PER_ROW);

  it('closes a phrase when the phrase index turns and records a silent one as a rest', () => {
    const memory = new PerformanceMemory();
    memory.observePosition(pos(0));          // phrase 0 opens (16 bars = 256 rows)
    memory.observePosition(pos(128));
    memory.observePosition(pos(256));        // phrase 1 opens, phrase 0 closes
    const history = memory.getPhraseHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual({ phrase: 0, moves: 0, liveMoves: 0, wasRest: true });
  });

  it('a phrase with fires is not a rest, and counts live separately from lane', () => {
    const memory = new PerformanceMemory();
    memory.observePosition(pos(0));
    fire(memory, { invocationId: 'a', source: 'live' });
    fire(memory, { invocationId: 'b', source: 'lane' });
    memory.observePosition(pos(256));
    expect(lastPhrase(ctxAt(256, memory))).toEqual({
      phrase: 0, moves: 2, liveMoves: 1, wasRest: false,
    });
  });

  it('has no last phrase before the first one turns over', () => {
    const memory = new PerformanceMemory();
    memory.observePosition(pos(0));
    expect(lastPhrase(ctxAt(16, memory))).toBeNull();
  });
});

describe('readWetEnergy — measured, not guessed', () => {
  it('scales the return gain by the wettest stage feeding it', () => {
    const e = readWetEnergy(
      { returnGain: 0.9, echoWet: 0.6, springWet: 0.2, echoIntensity: 0.45, extFeedbackGain: 0.035 },
      2,
    );
    expect(e.wet).toBeCloseTo(0.54, 6);          // 0.9 × 0.6
    expect(e.feedback).toBeCloseTo(0.485, 6);    // 0.45 + 0.035
    expect(e.gesturesInFlight).toBe(2);
  });

  it('reports no wet energy when the return is closed, however wet the stages', () => {
    const e = readWetEnergy(
      { returnGain: 0, echoWet: 1, springWet: 1, echoIntensity: 0.9, extFeedbackGain: 0 },
      0,
    );
    expect(e.wet).toBe(0);
  });

  it('leaves spectral density null rather than inventing a number', () => {
    const e = readWetEnergy(
      { returnGain: 0.9, echoWet: 0.6, springWet: 0.2, echoIntensity: 0.45, extFeedbackGain: 0 },
      0,
    );
    expect(e.spectralDensity).toBeNull();
  });

  it('clamps nonsense input instead of propagating it', () => {
    const e = readWetEnergy(
      { returnGain: 4, echoWet: -2, springWet: NaN, echoIntensity: 9, extFeedbackGain: 9 },
      -5,
    );
    expect(e.wet).toBe(0);
    expect(e.feedback).toBe(1);
    expect(e.gesturesInFlight).toBe(0);
  });
});

describe('PerformanceContext — intention and arrangement', () => {
  it('starts at REST with no target', () => {
    const ctx = ctxAt(0);
    expect(ctx.currentIntention).toBe('REST');
    expect(ctx.currentTarget.kind).toBe('none');
  });

  it('carries the intention Gate E sets', () => {
    const memory = new PerformanceMemory();
    memory.setIntention('ACCENT', { kind: 'channel', channelId: 1, reason: 'snare approaching' });
    const ctx = ctxAt(3, memory);
    expect(ctx.currentIntention).toBe('ACCENT');
    expect(ctx.currentTarget).toEqual({ kind: 'channel', channelId: 1, reason: 'snare approaching' });
  });

  it('passes the arrangement snapshot through untouched', () => {
    const arrangement: ArrangementSnapshot = {
      orderIndex: 30, orderLength: 31, patternIndex: 11,
      patternRows: 64, isLastInOrder: true, patternChangesNext: false,
    };
    const ctx = buildPerformanceContext(new PerformanceMemory(), {
      row: 0, ticksPerRow: TICKS_PER_ROW, bpm: 120, sources: SOURCES, arrangement,
      energy: readWetEnergy(
        { returnGain: 0.9, echoWet: 0.6, springWet: 0.2, echoIntensity: 0.45, extFeedbackGain: 0 }, 0),
    });
    expect(ctx.arrangement).toEqual(arrangement);
  });

  it('is frozen — a consumer cannot mutate the performer\'s memory', () => {
    const ctx = ctxAt(0);
    expect(Object.isFrozen(ctx)).toBe(true);
  });
});
