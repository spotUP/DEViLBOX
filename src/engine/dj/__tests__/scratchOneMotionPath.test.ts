/**
 * One motion path (owner decision O1; scratch ledger SCR-PG-B2). A deck-source scratch and a
 * record-voice scratch move through the same turntable model (`scratchPhysics.gestureMotion`):
 * the deck's pattern player plays the model's record speed for the deck's tempo and the plan's
 * velocity, the record voice plays the same curve; the velocity sets the stroke length (O2), the
 * fader windows (loudness) do not move.
 * Reachability, deck half: `fx_scratch_baby` through the real action registry (fireDjFx ->
 * playDeckPattern -> ScratchPlayback tick -> deck.setScratchVelocity); sentinel
 * `scratchPhysicsStats.performed` and the deck's rates equal the model's curve. Record half: the
 * real ScratchRecordVoice.playGesture over a fake ring.
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
import { ScratchRecordVoice, type ScratchVoiceRing, type ScratchVoiceBus } from '../scratch/ScratchRecordVoice';
import { getScratchRecord } from '../scratch/scratchCatalogue';
import { getGesture } from '../scratch/scratchGestureCatalog';
import type { RingRatePoint } from '../DeckScratchBuffer';

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

const SR = 48000;
interface Call { type: string; args: unknown[] }
function fakeRing(): ScratchVoiceRing & { calls: Call[] } {
  const calls: Call[] = [];
  const ring = {
    calls, sampleRate: SR, playbackGain: { connect: () => undefined } as unknown as GainNode, onPosition: null,
    load: () => {}, setBounds: () => {}, seek: () => {}, silenceAndStop: () => {}, stopAt: () => {}, stopScratch: async () => {},
    faderGain: () => {}, setRate: () => {},
    rateCurve: (points: readonly RingRatePoint[], opts: unknown) => { calls.push({ type: 'rateCurve', args: [points, opts] }); },
    faderWindows: (w: unknown, opts: unknown) => { calls.push({ type: 'faderWindows', args: [w, opts] }); },
  };
  return new Proxy(ring, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => {}) }) as unknown as ScratchVoiceRing & { calls: Call[] };
}

describe('record voice: the same model, harder = longer stroke, the fader windows the same', () => {
  async function play(velocity: number) {
    const ring = fakeRing();
    const bus = { input: {} as AudioNode, setAmbience: () => {} } as unknown as ScratchVoiceBus;
    const voice = new ScratchRecordVoice(0, ring, bus);
    const rec = getScratchRecord('AH_STANDARD')!;
    await voice.load(rec, { length: Math.round(rec.durationSec * SR), sampleRate: SR, numberOfChannels: 2 } as AudioBuffer);
    voice.playGesture(getGesture('baby'), 120, { velocity });
    const rc = [...ring.calls].reverse().find((c) => c.type === 'rateCurve')!;
    const fw = [...ring.calls].reverse().find((c) => c.type === 'faderWindows')!;
    const pts = rc.args[0] as RingRatePoint[];
    return { peak: Math.max(...pts.map((p) => Math.abs(p.rate))), frames: pts.map((p) => p.frame), windows: fw.args[0] };
  }

  it('the turntable model (the default since O1/O2): a harder stroke moves the record further and faster, the windows stay', async () => {
    const soft = await play(0.3), hard = await play(1.0);
    expect(hard.peak).toBeGreaterThan(soft.peak * 1.2);
    expect(hard.windows).toEqual(soft.windows);
  });

});
