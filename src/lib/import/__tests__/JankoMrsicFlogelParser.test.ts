/**
 * JankoMrsicFlogelParser Tests
 *
 * API:
 *   isJankoMrsicFlogelFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Magic: u32BE(0) == 0x000003F3 (HUNK_HEADER), byte[20] != 0,
 *        u32BE(32) == 0x70FF4E75, u32BE(36) == 0x4A2E464C ('J.FL'),
 *        u32BE(40) == 0x4F47454C ('OGEL'), non-zero pointers at 48,52,56.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isJankoMrsicFlogelFormat } from '../formats/JankoMrsicFlogelParser';

function u32BE(buf: Uint8Array, off: number, val: number) {
  buf[off]   = (val >>> 24) & 0xFF;
  buf[off+1] = (val >>> 16) & 0xFF;
  buf[off+2] = (val >>> 8) & 0xFF;
  buf[off+3] = val & 0xFF;
}

function makeJankoBuf(): Uint8Array {
  const buf = new Uint8Array(64);
  u32BE(buf, 0,  0x000003F3);  // HUNK_HEADER
  buf[20] = 1;                  // non-zero
  u32BE(buf, 32, 0x70FF4E75);  // MOVEQ + RTS
  u32BE(buf, 36, 0x4A2E464C);  // 'J.FL'
  u32BE(buf, 40, 0x4F47454C);  // 'OGEL'
  u32BE(buf, 48, 0x00000001);  // Interrupt pointer
  u32BE(buf, 52, 0x00000002);  // InitSong pointer
  u32BE(buf, 56, 0x00000003);  // Subsongs pointer
  return buf;
}

describe('isJankoMrsicFlogelFormat', () => {
  it('detects a crafted Janko Mrsic-Flogel buffer', () => {
    expect(isJankoMrsicFlogelFormat(makeJankoBuf().buffer as ArrayBuffer)).toBe(true);
  });

  it('detects using Uint8Array input', () => {
    expect(isJankoMrsicFlogelFormat(makeJankoBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isJankoMrsicFlogelFormat(new ArrayBuffer(64))).toBe(false);
  });

  it('rejects wrong J.FL tag', () => {
    const buf = makeJankoBuf();
    u32BE(buf, 36, 0x00000000);
    expect(isJankoMrsicFlogelFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });

  it('rejects wrong OGEL tag', () => {
    const buf = makeJankoBuf();
    u32BE(buf, 40, 0x00000000);
    expect(isJankoMrsicFlogelFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });
});
