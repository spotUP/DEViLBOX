/**
 * AlcatrazPackerParser Tests
 *
 * API:
 *   isAlcatrazPackerFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Magic: bytes[0..3] == 0x50416E10 ('PAn\x10')
 *        u32BE(buf, 4) != 0 and bit31 must be clear (non-negative)
 * No reference music files found for this format.
 */
import { describe, it, expect } from 'vitest';
import { isAlcatrazPackerFormat } from '../formats/AlcatrazPackerParser';

function makeAlcatrazBuf(totalSize = 0x1000): Uint8Array {
  const buf = new Uint8Array(16);
  // Magic: 0x50416E10
  buf[0] = 0x50; buf[1] = 0x41; buf[2] = 0x6E; buf[3] = 0x10;
  // Total size at offset 4 (big-endian, non-zero, bit31 clear)
  buf[4] = (totalSize >>> 24) & 0x7F;
  buf[5] = (totalSize >>> 16) & 0xFF;
  buf[6] = (totalSize >>> 8) & 0xFF;
  buf[7] = totalSize & 0xFF;
  return buf;
}

describe('isAlcatrazPackerFormat', () => {
  it('detects a crafted ALP buffer', () => {
    expect(isAlcatrazPackerFormat(makeAlcatrazBuf().buffer as ArrayBuffer)).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isAlcatrazPackerFormat(new ArrayBuffer(16))).toBe(false);
  });

  it('rejects a buffer that is too short', () => {
    expect(isAlcatrazPackerFormat(new ArrayBuffer(4))).toBe(false);
  });

  it('rejects when magic is wrong', () => {
    const buf = makeAlcatrazBuf();
    buf[0] = 0x00;
    expect(isAlcatrazPackerFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });

  it('rejects when total size is zero', () => {
    const buf = makeAlcatrazBuf(0);
    expect(isAlcatrazPackerFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });

  it('rejects when bit31 of total size is set', () => {
    const buf = makeAlcatrazBuf();
    buf[4] = 0x80; // set bit31
    expect(isAlcatrazPackerFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });
});
