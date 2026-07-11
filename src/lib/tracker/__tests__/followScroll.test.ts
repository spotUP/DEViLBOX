// src/lib/tracker/__tests__/followScroll.test.ts
/**
 * Regression guard for the pattern-editor Tab scroll-follow bug: tabbing to a
 * channel that sits outside the visible area must scroll horizontally so the
 * cursor stays on-screen. Reverting computeChannelFollowScroll to "return
 * scrollLeft unchanged" makes the reveal-left / reveal-right cases fail.
 */

import { describe, it, expect } from 'vitest';
import { computeChannelFollowScroll } from '@/lib/tracker/followScroll';

// A viewport 300px wide, 4 channels of 200px each (content 800px).
const VIEW = 300;
const CH_W = 200;
const MAX = 800 - VIEW; // 500
const left = (ch: number) => ch * CH_W;

describe('computeChannelFollowScroll', () => {
  it('leaves scroll unchanged when the channel already fits in view', () => {
    // Channel 1 spans 200..400; viewport 150..450 fully contains it.
    expect(computeChannelFollowScroll(left(1), CH_W, 150, VIEW, MAX)).toBe(150);
  });

  it('scrolls right to reveal a channel tabbed past the right edge', () => {
    // Viewport at 0..300 shows channels 0-1; Tab to channel 2 (400..600).
    // Reveal its right edge: scrollLeft = 600 - 300 = 300.
    expect(computeChannelFollowScroll(left(2), CH_W, 0, VIEW, MAX)).toBe(300);
  });

  it('scrolls left to reveal a channel tabbed past the left edge', () => {
    // Viewport at 400..700 shows channel 3; Shift+Tab back to channel 1 (200..400).
    // Reveal its left edge: scrollLeft = 200.
    expect(computeChannelFollowScroll(left(1), CH_W, 400, VIEW, MAX)).toBe(200);
  });

  it('clamps to maxScroll for the last channel', () => {
    // Channel 3 (600..800) right edge → 800 - 300 = 500 = maxScroll.
    expect(computeChannelFollowScroll(left(3), CH_W, 0, VIEW, MAX)).toBe(500);
  });

  it('never returns a negative scroll for the first channel', () => {
    expect(computeChannelFollowScroll(left(0), CH_W, 100, VIEW, MAX)).toBe(0);
  });

  it('reveals the right edge of a channel wider than the viewport', () => {
    // A 500px-wide channel at 0..500, viewport 300 wide, content 500 → max 200.
    // Right edge (500) is off-screen at scroll 0, so scroll to 500 - 300 = 200.
    expect(computeChannelFollowScroll(0, 500, 0, VIEW, 200)).toBe(200);
    // Scrolled to the right portion: the left edge (0) is now off-screen-left,
    // so a follow reveals the left edge → scroll back to 0.
    expect(computeChannelFollowScroll(0, 500, 200, VIEW, 200)).toBe(0);
  });
});
