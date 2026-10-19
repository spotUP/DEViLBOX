import { describe, it, expect } from 'vitest';
import { nextTabChannel } from '../tabNavigation';

/**
 * LOW: FT2 Tab and Shift+Tab both hop to the adjacent channel's note column and
 * wrap. The old handler gated Shift+Tab on `columnType === 'note'`, so from any
 * other column Shift+Tab failed to change channel while forward Tab always did.
 * The decider takes no column argument, so the asymmetry cannot recur.
 */
describe('nextTabChannel (LOW: Tab symmetry)', () => {
  it('forward Tab advances one channel', () => {
    expect(nextTabChannel(0, 4, false)).toBe(1);
    expect(nextTabChannel(2, 4, false)).toBe(3);
  });

  it('forward Tab wraps past the last channel to the first', () => {
    expect(nextTabChannel(3, 4, false)).toBe(0);
  });

  it('Shift+Tab retreats one channel regardless of column', () => {
    expect(nextTabChannel(2, 4, true)).toBe(1);
    expect(nextTabChannel(3, 4, true)).toBe(2);
  });

  it('Shift+Tab wraps before the first channel to the last', () => {
    expect(nextTabChannel(0, 4, true)).toBe(3);
  });

  it('is symmetric — forward then back returns to the start', () => {
    const start = 2;
    const fwd = nextTabChannel(start, 4, false);
    expect(nextTabChannel(fwd, 4, true)).toBe(start);
  });

  it('never returns a negative index for an empty channel list', () => {
    expect(nextTabChannel(0, 0, true)).toBe(0);
  });
});

/**
 * Owner 2026-10-20: "i cant tab longer than to channel 4", then "zoom scale
 * changes when i use tab". Tab stepped onto empty (hidden) channels; standing
 * on one reveals it, the visible set changed and the fit scale with it. Tab
 * now steps through the shown channels only and never reveals a hidden one.
 */
describe('nextTabChannel skips hidden channels', () => {
  // 7 channels; 2, 4 and 5 are empty and hidden.
  const mask = [true, true, false, true, false, false, true];

  it('forward Tab jumps over hidden channels and wraps from the last shown one', () => {
    expect(nextTabChannel(1, 7, false, mask)).toBe(3);
    expect(nextTabChannel(3, 7, false, mask)).toBe(6);
    expect(nextTabChannel(6, 7, false, mask)).toBe(0);
  });

  it('Shift+Tab jumps over hidden channels and wraps from the first', () => {
    expect(nextTabChannel(6, 7, true, mask)).toBe(3);
    expect(nextTabChannel(3, 7, true, mask)).toBe(1);
    expect(nextTabChannel(0, 7, true, mask)).toBe(6);
  });

  it('a full Tab cycle visits exactly the shown channels', () => {
    const seen: number[] = [];
    let ch = 0;
    for (let i = 0; i < 4; i++) { ch = nextTabChannel(ch, 7, false, mask); seen.push(ch); }
    expect(seen).toEqual([1, 3, 6, 0]);
  });

  it('from a hidden channel the cursor was moved to, Tab goes to the next shown one', () => {
    expect(nextTabChannel(4, 7, false, mask)).toBe(6);
    expect(nextTabChannel(4, 7, true, mask)).toBe(3);
  });
});
