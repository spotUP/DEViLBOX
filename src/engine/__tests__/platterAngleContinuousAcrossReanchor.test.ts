/**
 * DJ-F (3): the platter angle is continuous across a clock re-anchor. The
 * 20 Hz anchor disagrees with the previous extrapolation by a few ms (output
 * timestamp jitter, a rate bend between polls); the raw extrapolation steps
 * by that gap in one frame, the slewed platter position closes it over
 * several frames. A real seek (gap past 0.25 s) still snaps.
 */
import { describe, it, expect } from 'vitest';
import { positionAtFrame, slewPosition, type ClockAnchor, type SlewedPosition } from '@/engine/audioLatency';

const FRAME_MS = 1000 / 60;

/** Largest single-frame step minus the nominal advance, over frames [0, ms). */
function maxFrameJump(anchorAt: (t: number) => ClockAnchor, ms: number, slewed: boolean): number {
  let shown: SlewedPosition | undefined;
  let prev: number | null = null;
  let worst = 0;
  for (let t = 0; t < ms; t += FRAME_MS) {
    const anchor = anchorAt(t);
    const raw = positionAtFrame(anchor, t);
    shown = slewPosition(shown, raw, anchor.rate, t);
    const pos = slewed ? shown.posSec : raw;
    if (prev !== null) worst = Math.max(worst, Math.abs(pos - prev - FRAME_MS / 1000));
    prev = pos;
  }
  return worst;
}

describe('platter angle stays continuous across a re-anchor', () => {
  // Anchors every 50 ms; the one at 500 ms lands 12 ms ahead of the old extrapolation.
  const anchorAt = (t: number): ClockAnchor => {
    const at = Math.floor(t / 50) * 50;
    return { positionSec: at / 1000 + (at >= 500 ? 0.012 : 0), rate: 1, anchorMs: at };
  };

  it('the raw extrapolation steps by the re-anchor gap; the slewed position steps < 2 ms per frame and converges', () => {
    expect(maxFrameJump(anchorAt, 1000, false)).toBeGreaterThan(0.011);
    expect(maxFrameJump(anchorAt, 1000, true)).toBeLessThan(0.002);
    let shown: SlewedPosition | undefined;
    for (let t = 0; t < 1500; t += FRAME_MS) shown = slewPosition(shown, positionAtFrame(anchorAt(t), t), 1, t);
    expect(Math.abs(shown!.posSec - positionAtFrame(anchorAt(shown!.atMs), shown!.atMs))).toBeLessThan(0.0005);
  });

  it('a seek past 0.25 s snaps at once', () => {
    const s0 = slewPosition(undefined, 10, 1, 0);
    expect(slewPosition(s0, 40, 1, FRAME_MS).posSec).toBe(40);
  });
});
