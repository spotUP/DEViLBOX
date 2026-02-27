/**
 * ThomasHermannParser Tests — Thomas Hermann format detection
 *
 * Detection: file > 6848 bytes, origin at offset 46 (non-zero, even, bit-31 clear),
 * 8 pointer table entries at offsets 0,4,8,12,16,20,24,28 must each equal
 * (origin + expectedDiff) where diffs are [64,1088,2112,3136,4160,4416,4672,4928].
 * File prefix: THM.*
 */
import { describe, it, expect } from 'vitest';
import { isThomasHermannFormat } from '../formats/ThomasHermannParser';

function makeThomasHermannBuffer(): Uint8Array {
  const buf = new Uint8Array(7000).fill(0);

  // origin at offset 46: must be non-zero, even, bit-31 clear
  // Use origin = 0x00010000
  const origin = 0x00010000;
  buf[46] = (origin >>> 24) & 0xff;
  buf[47] = (origin >>> 16) & 0xff;
  buf[48] = (origin >>> 8) & 0xff;
  buf[49] = origin & 0xff;

  const diffs = [64, 1088, 2112, 3136, 4160, 4416, 4672, 4928];
  for (let i = 0; i < 8; i++) {
    const ptr = (origin + diffs[i]) >>> 0;
    const off = i * 4;
    buf[off]     = (ptr >>> 24) & 0xff;
    buf[off + 1] = (ptr >>> 16) & 0xff;
    buf[off + 2] = (ptr >>> 8) & 0xff;
    buf[off + 3] = ptr & 0xff;
  }

  return buf;
}

describe('isThomasHermannFormat', () => {
  it('detects valid Thomas Hermann buffer', () => {
    expect(isThomasHermannFormat(makeThomasHermannBuffer())).toBe(true);
  });

  it('rejects too-small buffer (< 6849)', () => {
    expect(isThomasHermannFormat(new Uint8Array(6848))).toBe(false);
  });

  it('rejects origin = 0', () => {
    const buf = makeThomasHermannBuffer();
    buf[46] = 0; buf[47] = 0; buf[48] = 0; buf[49] = 0;
    expect(isThomasHermannFormat(buf)).toBe(false);
  });

  it('rejects odd origin', () => {
    const buf = makeThomasHermannBuffer();
    buf[49] |= 0x01; // make odd
    expect(isThomasHermannFormat(buf)).toBe(false);
  });

  it('rejects wrong first pointer', () => {
    const buf = makeThomasHermannBuffer();
    buf[0] = 0x00; buf[1] = 0x00; buf[2] = 0x00; buf[3] = 0x00;
    expect(isThomasHermannFormat(buf)).toBe(false);
  });

  it('rejects zeroed buffer', () => {
    expect(isThomasHermannFormat(new Uint8Array(7000))).toBe(false);
  });
});
