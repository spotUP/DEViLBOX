/**
 * The deck's bus faders sat still while the performer worked — and the naive
 * fix would have made them lie in the other direction.
 *
 * Moves modulate the audio nodes directly and restore on release, so
 * `settings` keeps holding what the USER set. That is correct, and it is also
 * why the faders never moved: nothing told them a move was happening.
 *
 * `announce` alone is right for a move that takes a parameter and immediately
 * hands it back. It is wrong for one that HOLDS: subscribers fall back to the
 * stored value after `LIVE_HOLD_MS`, while a version drop keeps the return at
 * zero for bars. The fader would flick to 0 and then climb back to the user's
 * resting value while the audio was still killed — a control lying about the
 * bus in the opposite direction to the original complaint.
 *
 * So the refresh interval must stay inside the subscriber's fallback window.
 * These two constants live in different files and nothing but this test holds
 * them together.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeSweepRate, denormalizeSweepRate, SWEEP_RATE_MIN_HZ, SWEEP_RATE_MAX_HZ } from '../DubBus';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

function constantFrom(src: string, name: string): number {
  const m = src.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  expect(m, `${name} not found`).not.toBeNull();
  return Number(m![1]);
}

describe('a held announcement outlives the subscriber fallback', () => {
  it('refreshes faster than a control gives up on it', () => {
    const refresh = constantFrom(read('engine/dub/DubBus.ts'), 'ANNOUNCE_REFRESH_MS');
    const fallback = constantFrom(read('hooks/useLiveDubParam.ts'), 'LIVE_HOLD_MS');
    // Not merely smaller — comfortably inside, so a late timer does not blink.
    expect(refresh).toBeLessThan(fallback / 2);
  });

  it('holds the drains and releases them where the audio lands', () => {
    const bus = read('engine/dub/DubBus.ts');
    // A drain takes the return away for bars, so it must HOLD, not announce.
    expect(bus).toContain("this.announceHeld('dub.returnGain', 0);");
    expect(bus).toContain(
      "this.releaseHeldAnnouncement('dub.returnGain', this.enabled ? baselineReturn : 0);",
    );
    expect(bus).not.toContain("this.announce('dub.returnGain', 0);");
  });

  it('holds the comb sweep for the length of the gesture', () => {
    const bus = read('engine/dub/DubBus.ts');
    expect(bus).toContain("this.announceHeld('dub.sweepAmount'");
    expect(bus).toContain("this.releaseHeldAnnouncement('dub.sweepAmount', priorAmt);");
  });

  it('stops every hold when the bus is disposed', () => {
    // A surviving interval would announce into a dead bus forever.
    const bus = read('engine/dub/DubBus.ts');
    const disposeAt = bus.indexOf('dispose(): void {');
    const body = bus.slice(disposeAt, disposeAt + 400);
    expect(body).toContain('clearInterval');
    expect(body).toContain('_heldAnnouncements.clear();');
  });
});

describe('the sweep rate fader and the announcer agree on 0..1', () => {
  it('round-trips across the range', () => {
    for (const hz of [SWEEP_RATE_MIN_HZ, 0.3, 0.8, 1.5, SWEEP_RATE_MAX_HZ]) {
      expect(denormalizeSweepRate(normalizeSweepRate(hz))).toBeCloseTo(hz, 6);
    }
  });

  it('clamps rather than running off either end', () => {
    expect(normalizeSweepRate(-5)).toBe(0);
    expect(normalizeSweepRate(999)).toBe(1);
  });

  it('puts the fader where the control does', () => {
    // The deck slider is min 0.05 / max 3; a mismatch here would park the
    // announced value at the wrong end of the fader.
    const strip = read('components/dub/DubDeckStrip.tsx');
    expect(strip).toContain('min={0.05} max={3}');
    expect(SWEEP_RATE_MIN_HZ).toBe(0.05);
    expect(SWEEP_RATE_MAX_HZ).toBe(3);
  });
});

describe('only performed controls are wired to the live channel', () => {
  it('follows the faders a move actually drives', () => {
    const strip = read('components/dub/DubDeckStrip.tsx');
    expect(strip).toContain("useLiveDubParam('dub.returnGain'");
    expect(strip).toContain("useLiveDubParam('dub.sweepAmount'");
    // Wrapped across lines, so match on the key rather than the call shape.
    expect(strip).toMatch(/useLiveDubParam\(\s*'dub\.sweepRateHz'/);
  });

  it('leaves the ones nothing performs bound to the store', () => {
    // BASS, MID and WIDTH are not modulated by any move — startStereoDoubler
    // builds its own parallel nodes instead of touching stereoWidth — so
    // animating them would invent motion the audio is not making.
    const strip = read('components/dub/DubDeckStrip.tsx');
    expect(strip).toContain('value={dubBusSettings.masterBassDb ?? 0}');
    expect(strip).toContain('value={dubBusSettings.midScoopGainDb}');
    expect(strip).toContain('value={dubBusSettings.stereoWidth}');
    const bus = read('engine/dub/DubBus.ts');
    expect(bus).not.toContain("announceHeld('dub.stereoWidth'");
  });
});
