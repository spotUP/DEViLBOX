/**
 * BladePackerParser Tests
 *
 * API:
 *   isBladePackerFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Magic: bytes[0..3] == 0x538F4E47, byte[4] == 0x2E ('.')
 * Minimum file size: 5 bytes.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isBladePackerFormat } from '../formats/BladePackerParser';

function makeBladeBuf(): Uint8Array {
  const buf = new Uint8Array(16);
  buf[0]=0x53; buf[1]=0x8F; buf[2]=0x4E; buf[3]=0x47; buf[4]=0x2E;
  return buf;
}

describe('isBladePackerFormat', () => {
  it('detects a crafted Blade Packer buffer', () => {
    expect(isBladePackerFormat(makeBladeBuf().buffer as ArrayBuffer)).toBe(true);
  });

  it('detects using Uint8Array input', () => {
    expect(isBladePackerFormat(makeBladeBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isBladePackerFormat(new ArrayBuffer(16))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isBladePackerFormat(new ArrayBuffer(3))).toBe(false);
  });

  it('rejects when magic bytes are wrong', () => {
    const buf = makeBladeBuf();
    buf[0] = 0x00;
    expect(isBladePackerFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });

  it('rejects when fifth byte is not 0x2E', () => {
    const buf = makeBladeBuf();
    buf[4] = 0x00;
    expect(isBladePackerFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });
});
