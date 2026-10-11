/**
 * Set recorder / player (ledger SCR-P2.10): a registry scratch fire is
 * recorded as a `scratchStart` event carrying the action id, gesture,
 * source and record, its release as `scratchStop`, and a recorded set
 * replays them through `fireDjFx` / `releaseDjFx` - the same one path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ deck: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const raw = { currentTime: 0, sampleRate: 48000 };
  return { ...actual, now: () => raw.currentTime, getContext: () => ({ rawContext: raw, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => holder.deck, mixer: { samplerInput: null } }),
  getDJEngineIfActive: () => holder.deck ? { getDeck: () => holder.deck } : null,
}));

import { fireDjFx, releaseDjFx, djFxFireCounts, clearDjFxFireLog } from '@/engine/drumpad/DjFxActions';
import { DJSetRecorder } from '../DJSetRecorder';
import { DJSetPlayer } from '../DJSetPlayer';
import type { DJSetEvent } from '../DJSetEvent';
import { useDJStore } from '@/stores/useDJStore';

function fakeDeck() {
  return {
    id: 'A' as const,
    patternCalls: [] as string[],
    stopCalls: 0,
    playPattern(name: string) { this.patternCalls.push(name); },
    stopPattern() { this.stopCalls++; },
    finishPatternCycle() { this.stopCalls++; },
  };
}

describe('registry scratch fires are recorded and replayed through the one path (SCR-P2.10)', () => {
  let deck: ReturnType<typeof fakeDeck>;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    clearDjFxFireLog();
    deck = fakeDeck();
    holder.deck = deck;
    useDJStore.getState().setDeckPattern('A', null);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('records scratchStart / scratchStop with the action id, gesture, source and record', () => {
    const recorder = new DJSetRecorder();
    recorder.startRecording();
    vi.advanceTimersByTime(10);
    fireDjFx('fx_scratch_chirp', { deck: 'A', source: 'keyboard' });
    vi.advanceTimersByTime(250);
    releaseDjFx('fx_scratch_chirp', { deck: 'A', source: 'keyboard' });
    fireDjFx('fx_scratch_throw', { deck: 'A', source: 'autodj', record: 'AH_STANDARD' });
    const set = recorder.stopRecording('scratch set', 'u1', 'tester');

    const scratch = set.events.filter((e) => e.type === 'scratchStart' || e.type === 'scratchStop');
    const starts = scratch.filter((e) => e.type === 'scratchStart' && e.values?.action);
    expect(starts).toHaveLength(2);
    expect(starts[0]).toMatchObject({ type: 'scratchStart', deck: 'A', values: { action: 'fx_scratch_chirp', gesture: 'chirp', source: 'keyboard' } });
    expect(starts[1]!.values).toMatchObject({ action: 'fx_scratch_throw', source: 'autodj', record: 'AH_STANDARD' });
    const stop = scratch.find((e) => e.type === 'scratchStop' && e.values?.action === 'fx_scratch_chirp');
    expect(stop).toBeDefined();
    expect(stop!.t).toBeGreaterThan(starts[0]!.t);
    // a stopped recorder records nothing more
    fireDjFx('fx_scratch_baby', { deck: 'A', source: 'pad' });
    expect(recorder.eventCount).toBe(set.events.length);
  });

  it('replays a recorded scratchStart / scratchStop through fireDjFx / releaseDjFx (source "set")', () => {
    const player = new DJSetPlayer();
    const start: DJSetEvent = { t: 0, type: 'scratchStart', deck: 'A', values: { action: 'fx_scratch_chirp', gesture: 'chirp', source: 'keyboard' } };
    const stop: DJSetEvent = { t: 250_000, type: 'scratchStop', deck: 'A', values: { action: 'fx_scratch_chirp' } };
    (player as unknown as { _dispatch(e: DJSetEvent): void })._dispatch(start);
    expect(djFxFireCounts.fx_scratch_chirp).toBe(1);
    expect(deck.patternCalls).toEqual(['Chirp']);
    expect(useDJStore.getState().djFxActive.fx_scratch_chirp).toBe('A');
    (player as unknown as { _dispatch(e: DJSetEvent): void })._dispatch(stop);
    expect(deck.stopCalls).toBe(1);
    expect(useDJStore.getState().djFxActive.fx_scratch_chirp ?? null).toBeNull();
    // a legacy event without an action (a platter scratch) only mirrors the store
    (player as unknown as { _dispatch(e: DJSetEvent): void })._dispatch({ t: 0, type: 'scratchStart', deck: 'A', values: { pattern: 'Baby Scratch' } });
    expect(djFxFireCounts.fx_scratch_baby ?? 0).toBe(0);
    expect(useDJStore.getState().decks.A.scratchActive).toBe(true);
  });
});
