/**
 * One motion path (owner decision O1; scratch ledger SCR-PG-B2). A deck-source scratch moves through the
 * turntable model (`scratchPhysics.gestureMotion`): the deck's pattern player plays the model's record
 * speed for the deck's tempo and the plan's velocity; the velocity sets the stroke length (O2), the fader
 * windows (loudness) do not move. A record stroke is the demo's render (`scratchRender`, PG-J).
 * Reachability, deck half: `fx_scratch_baby` through the real action registry (fireDjFx ->
 * playDeckPattern -> ScratchPlayback tick -> deck.setScratchVelocity); sentinel
 * `scratchPhysicsStats.performed` and the deck's rates equal the model's curve.
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
import { scratchPhysicsStats, gestureMotion } from '../scratch/scratchPhysics';
import { getGesture } from '../scratch/scratchGestureCatalog';

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
    playPattern(name: string, _w?: (ms: number) => void, start?: PatternStart) {
      const pattern = getPatternByName(name)!;
      playback.play(pattern, undefined, start);
      playback.schedulePatternFader(pattern, bpm, start);
    },
    stopPattern() { playback.stopPattern(); },
    finishPatternCycle() { playback.finishCurrentCycle(); },
    isPatternActive() { return playback.isPatternActive(); },
  };
}

describe('deck path: the pattern player plays the turntable model', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] }); });
  afterEach(() => { vi.useRealTimers(); });

  function run(amount: number | undefined) {
    const deck = fakeDeck(120);
    holder.deck = deck;
    fireDjFx('fx_scratch_baby', { deck: 'A', source: 'autodj', beats: 1, ...(amount === undefined ? {} : { amount }) });
    const fader: number[] = [];
    for (let i = 0; i < 40; i++) { vi.advanceTimersByTime(10); fader.push(deck.playback.currentFaderGain); }
    const peak = Math.max(...deck.velocities.map(Math.abs));
    releaseDjFx('fx_scratch_baby', { deck: 'A', source: 'autodj', finishCycle: true });
    deck.stopPattern();
    return { peak, fader, velocities: deck.velocities };
  }

  it('a planned Baby on the deck is the model\'s motion: one performance, the rates on its curve, harder = longer stroke, the fader the same', () => {
    const before = scratchPhysicsStats.performed;
    const soft = run(0.3);
    expect(scratchPhysicsStats.performed - before, 'the deck pattern performed through the model').toBe(1);
    const hard = run(1.0);
    expect(hard.peak).toBeGreaterThan(soft.peak * 1.1);
    expect(hard.fader).toEqual(soft.fader);
    // every rate the deck got lies on the model's curve (baby: 2 steps at 120 BPM = 0.25 s)
    const curve = gestureMotion(getGesture('baby'), 0.25, { velocity: 1.0 });
    const lo = Math.min(...curve.map((p) => p.velocity)), hi = Math.max(...curve.map((p) => p.velocity));
    for (const v of hard.velocities) { expect(v).toBeGreaterThanOrEqual(lo - 1e-9); expect(v).toBeLessThanOrEqual(hi + 1e-9); }
    expect(Math.max(...hard.velocities)).toBeCloseTo(hi, 1);
  });
});
