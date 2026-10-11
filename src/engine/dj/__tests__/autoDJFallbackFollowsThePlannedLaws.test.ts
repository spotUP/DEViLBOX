/**
 * The bass handover and the legacy transition fallbacks follow the planned
 * laws (owner juggling plan sections 14, 35, 42; audit 2026-10-11 row 23 and
 * DJ1 (d)-(f)): one bass at a time - "cut A bass, bring B bass" with the
 * kill switch, never two basses at -12 dB under each other - and the
 * fallbacks Auto DJ runs when no plan can be made move the crossfader and the
 * high-pass along the planner's own curves, never a snap or a step.
 *
 * Pure planner checks plus the legacy functions on a fake engine (fake timers).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const engine = vi.hoisted(() => ({
  calls: [] as Array<{ deck: string; fn: string; args: unknown[] }>,
  crossfader: [] as number[],
}));

vi.mock('@/engine/dj/DJEngine', () => {
  const deck = (id: string) => {
    const rec = (fn: string) => (...args: unknown[]) => { engine.calls.push({ deck: id, fn, args }); };
    return {
      play: async () => { engine.calls.push({ deck: id, fn: 'play', args: [] }); }, stop: rec('stop'), isPlaying: () => true,
      setEQ: rec('setEQ'), setEQKill: rec('setEQKill'), setFilterPosition: rec('setFilterPosition'), getFilterPosition: () => 0,
      setVolume: rec('setVolume'), getVolume: () => 1, setPitch: rec('setPitch'), bendRate: rec('bendRate'),
      audioPlayer: { getPosition: () => 0, seek: rec('seek') }, playbackMode: 'audio',
    };
  };
  const decks = { A: deck('A'), B: deck('B'), C: deck('C') };
  const e = { getDeck: (id: 'A' | 'B' | 'C') => decks[id], setCrossfader: (v: number) => { engine.crossfader.push(v); } };
  return { getDJEngine: () => e, getDJEngineIfActive: () => e };
});

import { useDJStore } from '@/stores/useDJStore';
import { beatMatchedTransition, bassSwapTransition, echoOutTransition, setQuantizeMode } from '../DJQuantizedFX';
import { planBassHandover } from '../autodj/transitionPlanner';
import { sampleCurve } from '../autodj/transitionCurves';
import { bassExposure } from '../autodj/transitionQuality';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { getStyle } from '../autodj/styleProfiles';
import type { AutomationCurve, DJTransitionPlan } from '../autodj/types';

const BPM = 120;
const BEAT_MS = 60_000 / BPM;

describe('one bass at a time: the planned handover kills (owner plan sections 14, 35)', () => {
  const handover = (heavy: boolean) => {
    const o = structuredClone(corpusAnalysis('steady'));
    const i = structuredClone(corpusAnalysis('compatibleKey'));
    if (heavy) { o.bass.heaviness = 0.9; i.bass.heaviness = 0.9; }
    return planBassHandover({ outgoing: o, incoming: i, durationBars: 8, beatsPerBar: 4, style: getStyle('Club'), transitionStyle: 'longBlend', outStart: 30, inStart: 0, lengthSec: 16 });
  };
  const at = (curves: AutomationCurve[], target: AutomationCurve['target'], beat: number, fallback: number) => {
    const c = curves.find((x) => x.target === target);
    return c ? sampleCurve(c.keyframes, beat) : fallback;
  };
  /** The low band heard at a beat: -Infinity when killed. */
  const heard = (curves: AutomationCurve[], deck: 'outgoing' | 'incoming', beat: number) =>
    at(curves, `${deck}.lowKill`, beat, 0) >= 0.5 ? -Infinity : at(curves, `${deck}.eqLow`, beat, 0);

  for (const heavy of [true, false]) {
    it(`${heavy ? 'two heavy basses' : 'a compatible pair'}: cut A bass, bring B bass - never both open, the outgoing killed from the hand-over`, () => {
      const plan = handover(heavy);
      const hand = plan.handoverBar * 4;
      for (let beat = 0; beat <= 32; beat += 0.25) {
        const o = heard(plan.curves, 'outgoing', beat), i = heard(plan.curves, 'incoming', beat);
        expect(o > -6 && i > -6, `beat ${beat}: outgoing ${o} dB, incoming ${i} dB`).toBe(false);
        if (beat >= hand) expect(o).toBe(-Infinity);
      }
      expect(heard(plan.curves, 'incoming', 0)).toBe(-Infinity);
      expect(heard(plan.curves, 'incoming', 32)).toBe(0);
      // The quality score reads the kills as silence.
      const asPlan = { bassPlan: plan, durationBeats: 32, crossfadePlan: { curve: { target: 'crossfader', keyframes: [{ beat: 0, value: 0 }, { beat: 32, value: 1 }] } }, incomingDeck: 'B', style: 'longBlend' } as unknown as DJTransitionPlan;
      expect(bassExposure(asPlan)).toBe(0);
    });
  }
});

describe('the legacy fallbacks follow the planned laws (audit DJ1 (d), (e), (f))', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    engine.calls.length = 0; engine.crossfader.length = 0;
    setQuantizeMode('off');
    const grid = { beats: [], downbeats: [], bpm: BPM, timeSignature: 4 };
    useDJStore.getState().setDeckState('A', { isPlaying: true, beatGrid: grid, detectedBPM: BPM, effectiveBPM: BPM });
    useDJStore.getState().setDeckState('B', { isPlaying: false, beatGrid: grid, detectedBPM: BPM, effectiveBPM: BPM });
    useDJStore.getState().setCrossfader(0);
  });
  afterEach(() => { setQuantizeMode('bar'); vi.useRealTimers(); });

  it('(d) echo-out: the crossfader eases to the centre and across - no snap to the incoming', async () => {
    const cancel = echoOutTransition('A', 'B', 16);
    await vi.advanceTimersByTimeAsync(17 * BEAT_MS);
    cancel();
    const xs = engine.crossfader;
    expect(xs.length).toBeGreaterThan(20);
    // The first value is near the outgoing side, the steps between ticks are small, the last is on the incoming.
    expect(xs[0]).toBeLessThan(0.1);
    for (let k = 1; k < xs.length; k++) expect(Math.abs(xs[k] - xs[k - 1]), `tick ${k}`).toBeLessThan(0.1);
    expect(xs[xs.length - 1]).toBeCloseTo(1, 6);
    // It rests at the centre through the tail (both decks heard while the echo decays).
    expect(xs.filter((v) => Math.abs(v - 0.5) < 1e-6).length).toBeGreaterThan(5);
  });

  it('(e) beat-matched blend: the outgoing high-pass rises continuously - never a jump to full high-pass', async () => {
    const cancel = beatMatchedTransition('A', 'B', 8, true);
    await vi.advanceTimersByTimeAsync(33 * 4 * BEAT_MS / 4);
    cancel();
    const f = engine.calls.filter((c) => c.deck === 'A' && c.fn === 'setFilterPosition').map((c) => c.args[0] as number);
    expect(f.length).toBeGreaterThan(20);
    for (let k = 1; k < f.length; k++) expect(Math.abs(f[k] - f[k - 1]), `tick ${k}: ${f[k - 1]} -> ${f[k]}`).toBeLessThan(0.1);
    expect(Math.min(...f)).toBeGreaterThan(-0.95);
  });

  it('(f) bass swap: the outgoing bass is killed at the midpoint (not cut 12 dB) and restored after', async () => {
    const cancel = bassSwapTransition('A', 'B', 4);
    await vi.advanceTimersByTimeAsync(17 * BEAT_MS);
    cancel();
    const kills = engine.calls.filter((c) => c.deck === 'A' && c.fn === 'setEQKill' && c.args[0] === 'low').map((c) => c.args[1]);
    expect(kills).toEqual([true, false]);
    expect(engine.calls.some((c) => c.deck === 'A' && c.fn === 'setEQ' && c.args[0] === 'low' && (c.args[1] as number) < 0)).toBe(false);
  });
});
