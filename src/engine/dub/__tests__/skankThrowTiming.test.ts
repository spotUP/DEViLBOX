/**
 * T1 — regression for the skank throws' echo timing.
 *
 * Debt the ledger carried openly: the skank reshape (2026-09-17) shipped
 * without the test that should have come with it, against the house rule that
 * a fix ships with a test failing before and passing after. This is that test,
 * written late.
 *
 * What it pins, and why those numbers:
 *
 *   skankEchoThrow  — repeats a DOTTED EIGHTH apart (0.75 beats). They fall
 *                     between the subsequent offbeat stabs instead of on top
 *                     of them. This is the classic reggae delay.
 *   skankFloatThrow — repeats a DOTTED QUARTER apart (1.5 beats). Three
 *                     against two: the repeats drift across the pulse instead
 *                     of locking to it.
 *
 * The bug being guarded against was not a wrong constant but a wrong SHAPE:
 * the move was a `hold` with no close timer and a fixed 8000 ms feedback
 * window, so AutoDub's two-bar hold left the tap open for four seconds —
 * eight stabs thrown at once, over the top of the dry channel. A wash, not a
 * throw. So the test checks the timing AND the shape.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { skankEchoThrow } from '../moves/skankEchoThrow';
import { skankFloatThrow } from '../moves/skankFloatThrow';
import type { DubMoveContext } from '../moves/_types';

interface BusCalls {
  echoRates: number[];
  taps: Array<{ channelId: number; amount: number }>;
  closes: number;
  feedback: Array<{ delta: number; ms: number }>;
  rateOverrides: number;
  rateReleases: number;
}

function fakeBus(calls: BusCalls) {
  return {
    getEchoRateMs: () => 500,
    setEchoRate: (ms: number) => { calls.echoRates.push(ms); },
    beginRateOverride: () => {
      calls.rateOverrides++;
      return () => { calls.rateReleases++; };
    },
    openChannelTap: (channelId: number, amount: number) => {
      calls.taps.push({ channelId, amount });
      return () => { calls.closes++; };
    },
    modulateFeedback: (delta: number, ms: number) => { calls.feedback.push({ delta, ms }); },
  } as unknown as DubMoveContext['bus'];
}

function ctx(bus: DubMoveContext['bus'], bpm = 120): DubMoveContext {
  return { bus, channelId: 2, params: {}, bpm, source: 'live' } as DubMoveContext;
}

let calls: BusCalls;

beforeEach(() => {
  vi.useFakeTimers();
  calls = { echoRates: [], taps: [], closes: 0, feedback: [], rateOverrides: 0, rateReleases: 0 };
});

afterEach(() => { vi.useRealTimers(); });

describe('T1 — skankEchoThrow lands its repeats a dotted eighth apart', () => {
  it('sets the echo to 0.75 of a beat', () => {
    const bus = fakeBus(calls);
    skankEchoThrow.execute(ctx(bus, 120));            // beat = 500 ms
    expect(calls.echoRates[0]).toBe(375);             // 0.75 × 500
  });

  it('follows the tempo rather than a fixed millisecond figure', () => {
    const bus = fakeBus(calls);
    skankEchoThrow.execute(ctx(bus, 90));             // beat = 666.67 ms
    expect(calls.echoRates[0]).toBe(500);             // 0.75 × 666.67
  });
});

describe('T1 — skankFloatThrow floats at a dotted quarter', () => {
  it('sets the echo to 1.5 beats — three against two', () => {
    const bus = fakeBus(calls);
    skankFloatThrow.execute(ctx(bus, 120));
    expect(calls.echoRates[0]).toBe(750);             // 1.5 × 500
  });

  it('is twice the echo throw\'s division, on the same tempo', () => {
    const a = { ...calls, echoRates: [] as number[] };
    const b = { ...calls, echoRates: [] as number[] };
    skankEchoThrow.execute(ctx(fakeBus(a as BusCalls), 140));
    skankFloatThrow.execute(ctx(fakeBus(b as BusCalls), 140));
    // Within a millisecond: each rate is rounded independently, so at a tempo
    // whose beat is not a whole number (140 BPM = 428.57 ms) the halves round
    // in opposite directions. The relationship is what matters, not the
    // rounding.
    expect(Math.abs(b.echoRates[0] - a.echoRates[0] * 2)).toBeLessThanOrEqual(1);
  });
});

describe('T1 — the shape, which is what actually broke', () => {
  it('is a TRIGGER that closes itself, not a hold that stays open', () => {
    expect(skankEchoThrow.kind).toBe('trigger');
    expect(skankFloatThrow.kind).toBe('trigger');
  });

  it('catches ONE stab: the tap closes after half a beat, not after the hold', () => {
    const bus = fakeBus(calls);
    skankEchoThrow.execute(ctx(bus, 120));
    expect(calls.taps).toEqual([{ channelId: 2, amount: 1.0 }]);
    expect(calls.closes).toBe(0);
    vi.advanceTimersByTime(250);                      // 0.5 beat at 120 BPM
    expect(calls.closes).toBe(1);
  });

  it('bounds the feedback boost to the gesture, not to a fixed 8 seconds', () => {
    const bus = fakeBus(calls);
    skankEchoThrow.execute(ctx(bus, 120));
    // capture 0.5 beat + tail 2 beats = 1250 ms at 120 BPM.
    expect(calls.feedback).toEqual([{ delta: 0.12, ms: 1250 }]);
    expect(calls.feedback[0].ms).not.toBe(8000);
  });

  it('gives the user their echo rate back once the tail has rung out', () => {
    const bus = fakeBus(calls);
    skankEchoThrow.execute(ctx(bus, 120));
    expect(calls.rateOverrides).toBe(1);
    vi.advanceTimersByTime(1240);
    expect(calls.echoRates).toHaveLength(1);          // still ringing
    vi.advanceTimersByTime(20);
    expect(calls.echoRates[1]).toBe(500);             // restored to the prior rate
    expect(calls.rateReleases).toBe(1);
  });

  it('does not restore mid-tail, which would re-pitch repeats still in flight', () => {
    const bus = fakeBus(calls);
    skankEchoThrow.execute(ctx(bus, 120));
    vi.advanceTimersByTime(600);                      // past the capture, inside the tail
    expect(calls.echoRates).toHaveLength(1);
  });

  it('needs a channel — a skank throw with no skank is a no-op', () => {
    const bus = fakeBus(calls);
    const result = skankEchoThrow.execute({ ...ctx(bus), channelId: undefined });
    expect(result).toBeNull();
    expect(calls.taps).toHaveLength(0);
  });
});
