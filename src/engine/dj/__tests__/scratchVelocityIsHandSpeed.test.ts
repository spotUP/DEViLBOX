/**
 * SA-m5, owner decision 2026-10-12: a planned scratch's velocity is HAND SPEED. Higher velocity
 * -> every stroke rate is higher (faster, sharper) on both the deck pattern path and the record
 * voice; the fader windows (loudness) do not move. One mapping: `handSpeedFactor`.
 * Reachability: the deck half fires `fx_scratch_baby` through the real action registry
 * (fireDjFx -> playDeckPattern -> ScratchPlayback tick -> deck.setScratchVelocity); the record
 * half drives the real ScratchRecordVoice.playGesture over a fake ring.
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
import { handSpeedFactor, HAND_SPEED } from '../scratch/scratchHandSpeed';
import { ScratchRecordVoice, type ScratchVoiceRing, type ScratchVoiceBus } from '../scratch/ScratchRecordVoice';
import { getScratchRecord } from '../scratch/scratchCatalogue';
import { getGesture } from '../scratch/scratchGestureCatalog';
import type { RingRatePoint } from '../DeckScratchBuffer';

describe('handSpeedFactor: the one mapping', () => {
  it('is 1 at the reference velocity and when unplanned, monotonic, and bounded', () => {
    expect(handSpeedFactor(undefined)).toBe(1);
    expect(handSpeedFactor(HAND_SPEED.referenceVelocity)).toBeCloseTo(1, 9);
    expect(handSpeedFactor(1)).toBeGreaterThan(handSpeedFactor(0.7));
    expect(handSpeedFactor(0.7)).toBeGreaterThan(handSpeedFactor(0.55));
    expect(handSpeedFactor(0)).toBe(HAND_SPEED.min);
    expect(handSpeedFactor(99)).toBeLessThanOrEqual(HAND_SPEED.max);
  });
});

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

describe('deck path: a harder planned stroke is faster, the fader is the same', () => {
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
    return { peak, fader };
  }

  it('velocity 1.0 peaks higher than 0.3 by the mapped factors; fader gain is identical', () => {
    const soft = run(0.3), hard = run(1.0), tuned = run(undefined);
    expect(hard.peak).toBeGreaterThan(soft.peak);
    expect(hard.peak / soft.peak).toBeCloseTo(handSpeedFactor(1.0) / handSpeedFactor(0.3), 6);
    expect(tuned.peak / hard.peak).toBeCloseTo(1 / handSpeedFactor(1.0), 6);
    expect(hard.fader).toEqual(soft.fader);
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

describe('record voice: a harder planned stroke is faster, the fader windows are the same', () => {
  async function play(velocity: number, drive?: 'hand') {
    const ring = fakeRing();
    const bus = { input: {} as AudioNode, setAmbience: () => {} } as unknown as ScratchVoiceBus;
    const voice = new ScratchRecordVoice(0, ring, bus);
    const rec = getScratchRecord('AH_STANDARD')!;
    await voice.load(rec, { length: Math.round(rec.durationSec * SR), sampleRate: SR, numberOfChannels: 2 } as AudioBuffer);
    voice.playGesture(getGesture('baby'), 120, { velocity, drive });
    const rc = [...ring.calls].reverse().find((c) => c.type === 'rateCurve')!;
    const fw = [...ring.calls].reverse().find((c) => c.type === 'faderWindows')!;
    const pts = rc.args[0] as RingRatePoint[];
    return { peak: Math.max(...pts.map((p) => Math.abs(p.rate))), frames: pts.map((p) => p.frame), windows: fw.args[0] };
  }

  it('velocity curve path: peak rate scales by the factor, timing and windows do not move', async () => {
    const soft = await play(0.3), hard = await play(1.0);
    expect(hard.peak).toBeGreaterThan(soft.peak);
    expect(hard.peak / soft.peak).toBeCloseTo(handSpeedFactor(1.0) / handSpeedFactor(0.3), 6);
    expect(hard.frames).toEqual(soft.frames);
    expect(hard.windows).toEqual(soft.windows);
  });

  it('hand path (drive hand) scales too', async () => {
    const g = getGesture('baby');
    if (!g.handPath) return;
    const soft = await play(0.3, 'hand'), hard = await play(1.0, 'hand');
    expect(hard.peak).toBeGreaterThan(soft.peak);
    expect(hard.windows).toEqual(soft.windows);
  });
});
