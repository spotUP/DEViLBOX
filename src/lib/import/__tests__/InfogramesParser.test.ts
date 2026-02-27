/**
 * InfogramesParser Tests
 *
 * API:
 *   isInfogramesFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Detection: u16BE(0) is non-zero and even (header offset), fileSize > that offset,
 *            buf[offset + rel] == 0 and buf[offset + rel + 1] == 0x0F
 *            where rel = u16BE(offset + 2).
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isInfogramesFormat } from '../formats/InfogramesParser';

function makeInfogramsBuf(): ArrayBuffer {
  // headerOff = 10 (non-zero, even)
  const headerOff = 10;
  // rel = 4 (u16BE at headerOff+2)
  const rel = 4;
  // nullPos = headerOff + rel = 14
  // file size must be > headerOff and nullPos+1 < fileSize
  const size = 32;
  const buf = new Uint8Array(size);

  // u16BE(0) = headerOff = 10
  buf[0] = 0; buf[1] = headerOff;

  // u16BE(headerOff+2) = rel = 4
  buf[headerOff+2] = 0; buf[headerOff+3] = rel;

  // buf[nullPos] = 0 (null terminator)
  buf[headerOff + rel] = 0;

  // buf[nullPos+1] = 0x0F (version tag)
  buf[headerOff + rel + 1] = 0x0F;

  return buf.buffer;
}

describe('isInfogramesFormat', () => {
  it('detects a crafted Infogrames buffer', () => {
    expect(isInfogramesFormat(makeInfogramsBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isInfogramesFormat(new ArrayBuffer(64))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isInfogramesFormat(new ArrayBuffer(2))).toBe(false);
  });

  it('rejects when header offset is zero', () => {
    const buf = new Uint8Array(makeInfogramsBuf());
    buf[0] = 0; buf[1] = 0;
    expect(isInfogramesFormat(buf.buffer)).toBe(false);
  });

  it('rejects when header offset is odd', () => {
    const buf = new Uint8Array(makeInfogramsBuf());
    buf[1] = 11; // odd offset
    expect(isInfogramesFormat(buf.buffer)).toBe(false);
  });

  it('rejects when version tag is not 0x0F', () => {
    const buf = new Uint8Array(makeInfogramsBuf());
    // nullPos = 14, version tag at 15
    buf[15] = 0x00;
    expect(isInfogramesFormat(buf.buffer)).toBe(false);
  });
});
