/**
 * JanneSalmijarviParser Tests
 *
 * API:
 *   isJanneSalmijarviFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Magic: 'JS92' (0x4A533932) at offset 1080.
 * File must be strictly > 2112 bytes (>= 2113).
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isJanneSalmijarviFormat } from '../formats/JanneSalmijarviParser';

function makeJanneBuf(): Uint8Array {
  const buf = new Uint8Array(2200);
  buf[1080] = 0x4A; // 'J'
  buf[1081] = 0x53; // 'S'
  buf[1082] = 0x39; // '9'
  buf[1083] = 0x32; // '2'
  return buf;
}

describe('isJanneSalmijarviFormat', () => {
  it('detects a crafted Janne Salmijarvi buffer', () => {
    expect(isJanneSalmijarviFormat(makeJanneBuf().buffer as ArrayBuffer)).toBe(true);
  });

  it('detects using Uint8Array input', () => {
    expect(isJanneSalmijarviFormat(makeJanneBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isJanneSalmijarviFormat(new ArrayBuffer(2200))).toBe(false);
  });

  it('rejects a buffer of exactly 2112 bytes (too small)', () => {
    const buf = new Uint8Array(2112);
    buf[1080]=0x4A; buf[1081]=0x53; buf[1082]=0x39; buf[1083]=0x32;
    expect(isJanneSalmijarviFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });

  it('rejects wrong magic bytes', () => {
    const buf = makeJanneBuf();
    buf[1080] = 0x00;
    expect(isJanneSalmijarviFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });
});
