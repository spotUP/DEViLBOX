/**
 * LaxityParser Tests
 *
 * API:
 *   isLaxityFormat(buffer: ArrayBuffer | Uint8Array, filename?: string): boolean
 *
 * Detection is filename-prefix based:
 *   - "powt.*" → always Laxity
 *   - "pt.*"   → Laxity unless ProTracker MOD tag at offset 0x438
 * No filename → returns false. No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isLaxityFormat } from '../formats/LaxityParser';

function makeEmptyBuf(size = 2000): ArrayBuffer {
  return new ArrayBuffer(size);
}

function makeModBuf(): ArrayBuffer {
  const buf = new Uint8Array(2000);
  // Plant "M.K." MOD tag at offset 0x438
  buf[0x438] = 0x4D; // 'M'
  buf[0x439] = 0x2E; // '.'
  buf[0x43A] = 0x4B; // 'K'
  buf[0x43B] = 0x2E; // '.'
  return buf.buffer;
}

describe('isLaxityFormat', () => {
  it('detects powt.* prefix', () => {
    expect(isLaxityFormat(makeEmptyBuf(), 'powt.mysong')).toBe(true);
  });

  it('detects pt.* prefix without MOD tag', () => {
    expect(isLaxityFormat(makeEmptyBuf(), 'pt.mysong')).toBe(true);
  });

  it('rejects pt.* prefix when MOD tag is present', () => {
    expect(isLaxityFormat(makeModBuf(), 'pt.mysong')).toBe(false);
  });

  it('rejects without filename', () => {
    expect(isLaxityFormat(makeEmptyBuf())).toBe(false);
  });

  it('rejects other prefix', () => {
    expect(isLaxityFormat(makeEmptyBuf(), 'mod.mysong')).toBe(false);
  });

  it('is case-insensitive for prefix', () => {
    expect(isLaxityFormat(makeEmptyBuf(), 'POWT.mysong')).toBe(true);
  });
});
