import { describe, it, expect } from 'vitest';
import { paramNumber } from '../paramNumber';

describe('paramNumber (missing effect parameters fall back, never NaN)', () => {
  it('falls back for a missing parameter', () => {
    expect(paramNumber(undefined, 1)).toBe(1);
    expect(paramNumber('', 0)).toBe(0);
    expect(paramNumber('abc', 12)).toBe(12);
  });
  it('keeps a stored value, including 0', () => {
    expect(paramNumber(0, 12)).toBe(0);
    expect(paramNumber('-24', 0)).toBe(-24);
  });
});
