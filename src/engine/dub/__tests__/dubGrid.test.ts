/**
 * Grid snapping for live dub throws.
 *
 * A throw's capture window is short — half a beat by default, 250 ms at
 * 120 BPM — so hand-timing it against offbeat stabs is luck. `throwQuantize`
 * exists to fix that, but it only ever reached the DJ deck path; tracker
 * channel throws fired immediately whatever the setting said.
 *
 * The first cut of this snapped FORWARD only, which felt like a second of
 * input lag: a press a few milliseconds after a boundary waited almost a full
 * interval for the next one, and it was worst exactly when the player was
 * closest to in time. Snapping to the NEAREST boundary fixes that — late
 * presses fire immediately, only early ones wait.
 *
 * `msToNextGridBoundary` takes the row position as a parameter so these run
 * without a transport.
 */

import { describe, it, expect } from 'vitest';
import { msToNextGridBoundary, ROWS_PER_BEAT } from '../dubGrid';

const BPM = 120;          // beat = 500 ms
const BEAT_MS = 500;
/** Row for a given position in beats. */
const atBeat = (beats: number): number => beats * ROWS_PER_BEAT;

describe('msToNextGridBoundary', () => {
  it('does not delay when quantize is off', () => {
    expect(msToNextGridBoundary('off', BPM, atBeat(0.3))).toBe(0);
  });

  it('fires immediately when already on a boundary', () => {
    expect(msToNextGridBoundary('offbeat', BPM, atBeat(0))).toBe(0);
    expect(msToNextGridBoundary('offbeat', BPM, atBeat(1))).toBe(0);
    // The "&" is itself a boundary for offbeat/1-8 quantize.
    expect(msToNextGridBoundary('1/8', BPM, atBeat(0.5))).toBe(0);
  });

  it('waits for the boundary when the press is early', () => {
    // 0.375 of a beat in: the next half-beat is 0.125 away, the previous was
    // 0.375 back — so waiting is the nearer option.
    const ms = msToNextGridBoundary('offbeat', BPM, atBeat(0.375));
    expect(ms).toBeCloseTo(0.125 * BEAT_MS, 5);
  });

  it('fires immediately when the press is late — no full-cycle wait', () => {
    // 0.125 of a beat past a boundary. Forward-only snapping would have
    // waited 0.375 of a beat (~190 ms) for the next one; the press was late,
    // and a late hit played now still lands inside the capture window.
    expect(msToNextGridBoundary('offbeat', BPM, atBeat(0.125))).toBe(0);
    expect(msToNextGridBoundary('offbeat', BPM, atBeat(0.6))).toBe(0);
  });

  it('never delays by more than half an interval', () => {
    // The worst case for a nearest-boundary snap is the midpoint.
    for (let i = 0; i <= 40; i++) {
      const ms = msToNextGridBoundary('offbeat', BPM, atBeat(i / 40));
      expect(ms).toBeLessThanOrEqual(0.5 * 0.5 * BEAT_MS + 1);
    }
  });

  it('uses a quarter-beat grid for 1/16', () => {
    // 0.1 in: nearest boundary is 0 behind (0.1 back) vs 0.25 ahead (0.15) —
    // behind is nearer, so fire now.
    expect(msToNextGridBoundary('1/16', BPM, atBeat(0.1))).toBe(0);
    // 0.2 in: 0.25 is only 0.05 ahead, 0 is 0.2 behind — wait.
    expect(msToNextGridBoundary('1/16', BPM, atBeat(0.2))).toBeCloseTo(0.05 * BEAT_MS, 5);
  });

  it('snaps to the downbeat for bar quantize', () => {
    // 3.5 beats into a 4/4 bar — half a beat short of the next downbeat.
    expect(msToNextGridBoundary('bar', BPM, atBeat(3.5))).toBeCloseTo(0.5 * BEAT_MS, 5);
    // 0.25 beats past the downbeat — late, fire now rather than wait ~4 beats.
    expect(msToNextGridBoundary('bar', BPM, atBeat(0.25))).toBe(0);
  });

  it('never delays a bar-quantized press by more than half a bar', () => {
    for (let i = 0; i <= 32; i++) {
      const ms = msToNextGridBoundary('bar', BPM, atBeat((i / 32) * 4));
      expect(ms).toBeLessThanOrEqual(2 * BEAT_MS + 1);
    }
  });

  it('survives a nonsense row or tempo rather than delaying forever', () => {
    expect(msToNextGridBoundary('offbeat', BPM, NaN)).toBe(0);
    expect(msToNextGridBoundary('offbeat', NaN, atBeat(0.375))).toBe(0);
  });

  it('scales with tempo', () => {
    // Same grid position, half the tempo, twice the wait.
    const fast = msToNextGridBoundary('offbeat', 120, atBeat(0.375));
    const slow = msToNextGridBoundary('offbeat', 60, atBeat(0.375));
    expect(slow).toBeCloseTo(fast * 2, 5);
  });
});
