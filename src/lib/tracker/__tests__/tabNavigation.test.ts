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
