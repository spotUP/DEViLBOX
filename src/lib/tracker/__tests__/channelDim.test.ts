import { describe, it, expect } from 'vitest';
import { anySoloActive, isChannelDimmed } from '../channelDim';

/**
 * M6: FT2 greys the whole muted column in the pattern body, not just the header.
 * Both renderers (WebGL + Canvas2D) share this dimming decision, so the rule
 * lives in one pure function tested here. Muted channels stay editable — the
 * dimming is purely visual.
 */
describe('channelDim (M6)', () => {
  describe('anySoloActive', () => {
    it('is false when no channel is soloed', () => {
      expect(anySoloActive([{ solo: false }, { solo: false }])).toBe(false);
      expect(anySoloActive([{}, {}])).toBe(false);
    });

    it('is true when at least one channel is soloed', () => {
      expect(anySoloActive([{ solo: false }, { solo: true }])).toBe(true);
    });
  });

  describe('isChannelDimmed', () => {
    it('dims a muted channel when nothing is soloed', () => {
      expect(isChannelDimmed(true, false, false)).toBe(true);
    });

    it('does not dim an un-muted channel when nothing is soloed', () => {
      expect(isChannelDimmed(false, false, false)).toBe(false);
    });

    it('dims every non-solo channel while another channel is soloed', () => {
      // Not muted, not soloed, but some other channel is soloed -> dimmed.
      expect(isChannelDimmed(false, false, true)).toBe(true);
    });

    it('keeps a soloed channel bright while a solo is active', () => {
      expect(isChannelDimmed(false, true, true)).toBe(false);
    });
  });
});
