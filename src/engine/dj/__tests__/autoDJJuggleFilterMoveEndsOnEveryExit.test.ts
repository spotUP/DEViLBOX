/**
 * A juggle FilterOut / FilterIn moved a deck's filter and nothing handed it back:
 * only ResetDeck centred it, and a pattern that completed or was cancelled left
 * the deck wherever the sweep stood. Now every exit path of the juggle executor
 * (pattern complete, cancel, abort) returns each deck's filter to the value it had
 * before the pattern first moved it.
 *
 * Real juggle executor and real deck sink, fake timers, stubbed decks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ engine: null as unknown }));
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));

import { useDJStore } from '@/stores/useDJStore';
import { executeJuggle } from '../autodj/juggle/juggleExecutor';
import { createDeckJuggleSink } from '../autodj/juggle/juggleDeckSink';
import type { DJJugglePattern } from '../autodj/juggle/juggleTypes';

function fakeDeck(start: number) {
  let filter = start;
  const noop = () => {};
  return {
    isPlaying: () => true, setEQKill: noop, setEQ: noop, clearAudioLoop: noop, setAudioLoop: noop, setEchoSend: noop, setEchoParams: noop,
    setFilterPosition: (p: number) => { filter = p; }, getFilterPosition: () => filter,
  };
}

const PRE_MOVE = 0.2;
const pattern = {
  id: 'p', type: 'transformer', durationBars: 1, intensity: 0.5, energyProfile: 'flat', confidence: 1, reason: 'test', phases: [], sequence: 'A',
  actions: [
    { type: 'FilterOut', deck: 'A', executeAtBeat: 0, durationBeats: 32 },
    { type: 'EQRestore', deck: 'B', executeAtBeat: 4 },
  ],
} as unknown as DJJugglePattern;

let decks: Record<'A' | 'B', ReturnType<typeof fakeDeck>>;
let t0 = 0;
const start = () => executeJuggle(pattern, 0, {
  sink: createDeckJuggleSink(),
  clock: { beatNow: () => (Date.now() - t0) / 500, beatSec: () => 0.5 },
});

describe('a juggle filter move hands the filter back on every exit path', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    t0 = Date.now();
    decks = { A: fakeDeck(PRE_MOVE), B: fakeDeck(0) };
    holder.engine = { getDeck: (id: 'A' | 'B') => decks[id], mixer: { setCrossfader: () => {} } };
    const s = useDJStore.getState();
    s.setDeckPlaying('A', true); s.setDeckPlaying('B', true); s.setCrossfader(0.5);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('pattern complete', async () => {
    const run = start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(decks.A.getFilterPosition()).not.toBe(PRE_MOVE); // the sweep is moving it
    await vi.advanceTimersByTimeAsync(4000);
    expect((await run.done).reason).toBe('pattern complete');
    await vi.advanceTimersByTimeAsync(20000);
    expect(decks.A.getFilterPosition()).toBeCloseTo(PRE_MOVE, 5);
  });

  it('cancel', async () => {
    const run = start();
    await vi.advanceTimersByTimeAsync(1000);
    run.cancel('emergency');
    await vi.advanceTimersByTimeAsync(20000);
    expect(decks.A.getFilterPosition()).toBeCloseTo(PRE_MOVE, 5);
  });

  it('abort', async () => {
    const run = start();
    await vi.advanceTimersByTimeAsync(1000);
    run.abort('user took over');
    await vi.advanceTimersByTimeAsync(20000);
    expect(decks.A.getFilterPosition()).toBeCloseTo(PRE_MOVE, 5);
  });
});
