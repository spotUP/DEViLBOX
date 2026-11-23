import { describe, it, expect } from 'vitest';
import { validateGtExportOptions, GT_DEFAULT_LOAD_ADDRESS, GT_DEFAULT_ZERO_PAGE } from '../gtExportOptions';

const check = (loadAddress: number, zeroPage = 0xfc, size?: number) => validateGtExportOptions({ loadAddress, zeroPage }, size);

describe('validateGtExportOptions', () => {
  it('accepts the defaults', () => {
    expect(check(GT_DEFAULT_LOAD_ADDRESS, GT_DEFAULT_ZERO_PAGE, 0x2000)).toBeNull();
  });
  it('rejects below $0400 and unaligned', () => {
    expect(check(0x0300)).toMatch(/\$0400/);
    expect(check(0x1010)).toMatch(/page/);
  });
  it('rejects overlap with $D000-$DFFF', () => {
    expect(check(0xd000)).toMatch(/I\/O/);
    expect(check(0xc000, 0xfc, 0x1800)).toMatch(/I\/O/);
    expect(check(0xc000, 0xfc, 0x1000)).toBeNull();
    expect(check(0xe000, 0xfc, 0x1000)).toBeNull();
  });
  it('rejects running past $FFFF', () => {
    expect(check(0xf000, 0xfc, 0x1000)).toBeNull();
    expect(check(0xf000, 0xfc, 0x1001)).toMatch(/FFFF/);
  });
  it('limits the zero page', () => {
    expect(check(0x1000, 0x01)).toMatch(/Zero page/);
    expect(check(0x1000, 0x02)).toBeNull();
    expect(check(0x1000, 0xfe)).toBeNull();
    expect(check(0x1000, 0xff)).toMatch(/Zero page/);
  });
});
