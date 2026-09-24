import { describe, it, expect, beforeEach } from 'vitest';
import { setFaderTouched, isFaderTouched } from '../DJControllerMapper';

/**
 * The X-Touch Compact's ninth fader is the master send, and it is motorised
 * like the other eight. Faders 1-8 discard input while the touch sensor says
 * no hand is on them, because otherwise the motor's own echo drives the fader
 * and it fights whoever is holding it. The ninth had no such guard.
 *
 * Its touch sensor was already being tracked — the CC 101-109 branch maps
 * 109 - 100 = 9 — and nothing read it. This pins the arithmetic that the
 * guard depends on, because the same arithmetic was silently wrong for Layer
 * B once already: its touch range was missing entirely, `isFaderTouched` was
 * never true for a Layer B fader, and that whole bank did nothing
 * (2026-09-23).
 */
describe('the touch sensor reaches the fader it belongs to', () => {
  beforeEach(() => {
    for (let cc = 1; cc <= 36; cc++) setFaderTouched(cc, false);
  });

  it.each([
    [101, 1], [104, 4], [108, 8],
    [109, 9],   // the master send — the one that had no guard
  ])('Layer A touch CC %i holds fader %i', (touchCC, faderCC) => {
    setFaderTouched(touchCC - 100, true);
    expect(isFaderTouched(faderCC)).toBe(true);
  });

  it.each([
    [111, 28], [115, 32], [118, 35],
  ])('Layer B touch CC %i holds fader %i', (touchCC, faderCC) => {
    setFaderTouched(touchCC - 83, true);
    expect(isFaderTouched(faderCC)).toBe(true);
  });

  it('reports no hand until a sensor says otherwise', () => {
    // The guard reads this: false means "motor echo", and every fader must
    // start there or a stale touch would let an echo through.
    expect(isFaderTouched(9)).toBe(false);
  });

  it('lets go', () => {
    setFaderTouched(9, true);
    expect(isFaderTouched(9)).toBe(true);
    setFaderTouched(9, false);
    expect(isFaderTouched(9)).toBe(false);
  });

  it('keeps the master fader separate from channel 1', () => {
    // 109 - 100 = 9 and 101 - 100 = 1. A transposition here would make the
    // master fader answer to the first channel's sensor.
    setFaderTouched(9, true);
    expect(isFaderTouched(1)).toBe(false);
  });
});
