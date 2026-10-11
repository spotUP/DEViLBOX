/**
 * Audit SA-M2 / SA-m5 (thoughts/shared/research/2026-10-12_scratch-work-audit.md; owner scratch
 * plan section 7: "starts from elapsed-time modulo cycle length ... must change for Auto
 * Scratch"). The executor fires a deck gesture on its planned beat; before the fix the deck
 * pattern then started at `elapsed % cycle` (a track with a 180 ms first-beat offset began its
 * Baby Scratch 180 ms into the stroke) and looped until a hard stop, ignoring the event's length.
 * A planned fire (`beats` given) now starts the stroke at its beginning and plays whole cycles;
 * a hand-pressed pattern keeps its phase alignment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ deck: null as unknown }));

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  const raw = { currentTime: 0 };
  return { ...actual, now: () => raw.currentTime, getContext: () => ({ rawContext: raw, state: 'running' }) };
});
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ getDeck: () => holder.deck }),
  getDJEngineIfActive: () => holder.deck ? { getDeck: () => holder.deck } : null,
}));

import { ScratchPlayback, getPatternByName, type PatternStart } from '../DJScratchEngine';
import { fireDjFx, releaseDjFx } from '@/engine/drumpad/DjFxActions';
import type { DeckEngine } from '../DeckEngine';

/** A deck whose replayer is 90 ms past a cycle boundary (a first-beat offset); records each tick's velocity. */
function fakeDeck(bpm: number) {
  const velocities: number[] = [];
  const gainParam = { cancelScheduledValues: () => {}, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, value: 1 };
  const stub = {
    id: 'A', playbackMode: 'tracker',
    replayer: { getElapsedMs: () => 90 },
    setScratchVelocity: (v: number) => { velocities.push(v); },
    getChannelGainParam: () => gainParam,
    releaseChannelGainParam: () => {},
  };
  const playback = new ScratchPlayback(() => stub as unknown as DeckEngine, () => bpm);
  return {
    velocities, playback,
    playPattern(name: string, _onWaiting?: (ms: number) => void, start?: PatternStart) {
      const pattern = getPatternByName(name)!;
      playback.play(pattern, undefined, start);
      playback.schedulePatternFader(pattern, bpm, start);
    },
    stopPattern() { playback.stopPattern(); },
    finishPatternCycle() { playback.finishCurrentCycle(); },
    isPatternActive() { return playback.isPatternActive(); },
  };
}

describe('a planned deck stroke starts on its beat and plays its length (SA-M2, SA-m5)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('an Auto Scratch Baby Scratch begins at the start of its push, not 90 ms into it', () => {
    const deck = fakeDeck(120);
    holder.deck = deck;
    fireDjFx('fx_scratch_baby', { deck: 'A', source: 'autodj', beats: 1 });
    vi.advanceTimersByTime(10);
    // the baby curve (1-beat cycle = 500 ms) rises from 0.2 at the start to 2.4 at 20 %: 10 ms in is 0.5,
    // 100 ms in (where elapsed-time phase puts it) is the 2.4 peak
    expect(deck.velocities[0]!).toBeCloseTo(0.5, 6);
    releaseDjFx('fx_scratch_baby', { deck: 'A', source: 'autodj', finishCycle: true });
    deck.stopPattern();
  });

  it('a hand-pressed Baby Scratch still phase-aligns to the elapsed time (unchanged)', () => {
    const deck = fakeDeck(120);
    holder.deck = deck;
    fireDjFx('fx_scratch_baby', { deck: 'A', source: 'keyboard' });
    vi.advanceTimersByTime(10);
    expect(deck.velocities[0]!).toBeGreaterThan(1.5);
    releaseDjFx('fx_scratch_baby', { deck: 'A', source: 'keyboard' });
  });

  it('a planned two-beat Baby Scratch plays two whole cycles and ends itself', () => {
    const deck = fakeDeck(120);
    holder.deck = deck;
    fireDjFx('fx_scratch_baby', { deck: 'A', source: 'autodj', beats: 2 });
    vi.advanceTimersByTime(990);
    expect(deck.isPatternActive()).toBe(true);
    vi.advanceTimersByTime(30);
    expect(deck.isPatternActive()).toBe(false);
    releaseDjFx('fx_scratch_baby', { deck: 'A', source: 'autodj', finishCycle: true });
  });
});
