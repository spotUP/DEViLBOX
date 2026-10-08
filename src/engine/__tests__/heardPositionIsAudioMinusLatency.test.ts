/**
 * DJ3 (owner, 2026-10-08: "the visuals dont feel synced to the audio in dj
 * view ... all visuals feel laggy"): every visual draws the position the
 * listener HEARS, not where the deck has rendered to. One latency source
 * (audioLatency.ts) feeds the tracker's display ring and the DJ decks.
 *
 * With a known output latency the heard position equals the played position
 * minus that latency at the current rate - at 0 and at +-8 % pitch - and the
 * replayer's TS-scheduled rows are queued at heard times like the
 * engine-driven ones already were.
 */
import { describe, it, expect } from 'vitest';
import { heardPositionSec, outputLatencySec } from '../audioLatency';
import { PlaybackCoordinator } from '../PlaybackCoordinator';

const LATENCY = 0.0333; // measured live: baseLatency 5.3 ms + outputLatency 28 ms

describe('heard position = audio position minus output latency', () => {
  it('reads outputLatency, falls back to baseLatency, and is 0 without a context', () => {
    expect(outputLatencySec({ outputLatency: 0.028, baseLatency: 0.0053 })).toBe(0.028);
    expect(outputLatencySec({ baseLatency: 0.0053 })).toBe(0.0053);
    expect(outputLatencySec({})).toBe(0);
    expect(outputLatencySec(null)).toBe(0);
    expect(outputLatencySec({ outputLatency: Number.NaN })).toBe(0);
  });

  it('at 0 and +-8 % pitch the heard position is the played position minus latency times the rate', () => {
    for (const rate of [1, 1.08, 0.92]) {
      expect(heardPositionSec(30, rate, LATENCY)).toBeCloseTo(30 - LATENCY * rate, 9);
    }
    // At rate 1.08 the deck has rendered 1.08 s of material per second: the ear is further behind in material.
    expect(heardPositionSec(30, 1.08, LATENCY)).toBeLessThan(heardPositionSec(30, 0.92, LATENCY));
    expect(heardPositionSec(0.01, 1, LATENCY)).toBe(0);
    expect(heardPositionSec(30, -1, LATENCY)).toBeCloseTo(30 - LATENCY, 9);
  });

  it('the display ring queues engine rows at the heard time through the one latency source', () => {
    const pc = new PlaybackCoordinator();
    pc.context.audioContext = { currentTime: 0, outputLatency: LATENCY } as unknown as AudioContext;
    pc.context.songPositions = [0];
    pc.context.bpm = 125;
    pc.context.speed = 6;
    pc.stateRing.playing = true;
    pc.dispatchEnginePosition(3, 0, 10, false);
    expect(pc.stateRing.getStateAtTime(10 + LATENCY - 0.001, true)?.row ?? null).toBeNull();
    expect(pc.stateRing.getStateAtTime(10 + LATENCY + 0.001, true)?.row).toBe(3);
  });
});
