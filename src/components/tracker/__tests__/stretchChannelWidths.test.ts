import { describe, it, expect } from 'vitest';
import { stretchChannelWidths } from '../channelLayout';

const LEFT = 48;

describe('stretchChannelWidths', () => {
  it('4 channels in 1200 px fill the canvas exactly', () => {
    const out = stretchChannelWidths([200, 200, 200, 230], LEFT, 1200);
    expect(LEFT + out.reduce((a, b) => a + b, 0)).toBe(1200);
    out.forEach((w, i) => expect(w).toBeGreaterThanOrEqual([200, 200, 200, 230][i]));
  });

  it('32 channels keep their minimum widths and scroll', () => {
    const mins = Array.from({ length: 32 }, () => 220);
    expect(stretchChannelWidths(mins, LEFT, 1200)).toEqual(mins);
  });

  it('never shrinks when the canvas is exactly full or narrower', () => {
    expect(stretchChannelWidths([300, 300], LEFT, LEFT + 600)).toEqual([300, 300]);
    expect(stretchChannelWidths([300, 300], LEFT, 100)).toEqual([300, 300]);
  });

  it('a zero width canvas (not measured yet) disables the stretch', () => {
    expect(stretchChannelWidths([300, 300], LEFT, 0)).toEqual([300, 300]);
  });

  it('returns integer widths and no channels for no input', () => {
    stretchChannelWidths([301, 299, 317], LEFT, 1111).forEach(w => expect(Number.isInteger(w)).toBe(true));
    expect(stretchChannelWidths([], LEFT, 1200)).toEqual([]);
  });
});
