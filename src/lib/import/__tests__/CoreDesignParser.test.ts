/**
 * CoreDesignParser Tests
 *
 * API:
 *   isCoreDesignFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Magic: u32BE(0) == 0x000003F3 (68k HUNK_HEADER), non-zero byte at offset 20,
 *        u32BE(32) == 0x70FF4E75, u32BE(36) == 0x532E5048 ('S.PH'),
 *        u32BE(40) == 0x49505053 ('IPPS'), and non-zero pointers at 44,48,52,56,60.
 * Minimum 64 bytes.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isCoreDesignFormat } from '../formats/CoreDesignParser';

function u32BE(buf: Uint8Array, off: number, val: number) {
  buf[off]   = (val >>> 24) & 0xFF;
  buf[off+1] = (val >>> 16) & 0xFF;
  buf[off+2] = (val >>> 8) & 0xFF;
  buf[off+3] = val & 0xFF;
}

function makeCoreDesignBuf(): Uint8Array {
  const buf = new Uint8Array(64);
  u32BE(buf, 0, 0x000003F3);  // HUNK_HEADER
  buf[20] = 1;                 // non-zero byte at 20
  u32BE(buf, 32, 0x70FF4E75); // MOVEQ #-1,D0 + RTS
  u32BE(buf, 36, 0x532E5048); // 'S.PH'
  u32BE(buf, 40, 0x49505053); // 'IPPS'
  u32BE(buf, 44, 0x00000001); // Interrupt pointer
  u32BE(buf, 48, 0x00000002); // Audio Interrupt pointer
  u32BE(buf, 52, 0x00000003); // InitSong pointer
  u32BE(buf, 56, 0x00000004); // EndSong pointer
  u32BE(buf, 60, 0x00000005); // Subsongs pointer
  return buf;
}

describe('isCoreDesignFormat', () => {
  it('detects a crafted Core Design buffer', () => {
    expect(isCoreDesignFormat(makeCoreDesignBuf().buffer as ArrayBuffer)).toBe(true);
  });

  it('detects using Uint8Array input', () => {
    expect(isCoreDesignFormat(makeCoreDesignBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isCoreDesignFormat(new ArrayBuffer(64))).toBe(false);
  });

  it('rejects wrong HUNK_HEADER magic', () => {
    const buf = makeCoreDesignBuf();
    u32BE(buf, 0, 0x00000000);
    expect(isCoreDesignFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });

  it('rejects when byte 20 is zero', () => {
    const buf = makeCoreDesignBuf();
    buf[20] = 0;
    expect(isCoreDesignFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });

  it('rejects when S.PH tag is wrong', () => {
    const buf = makeCoreDesignBuf();
    u32BE(buf, 36, 0x00000000);
    expect(isCoreDesignFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });

  it('rejects when subsongs pointer is zero', () => {
    const buf = makeCoreDesignBuf();
    u32BE(buf, 60, 0);
    expect(isCoreDesignFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });
});
