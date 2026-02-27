/**
 * SteveTurnerParser Tests — Steve Turner format detection
 *
 * Detection: 4 x 0x2B7C at offsets 0,8,16,24; 0x303C00FF at 0x20;
 * 0x32004EB9 at 0x24; 0x4E75 at 0x2C.
 * File prefix: JPO.*
 */
import { describe, it, expect } from 'vitest';
import { isSteveTurnerFormat, parseSteveTurnerFile } from '../formats/SteveTurnerParser';

function makeSteveTurnerBuffer(): ArrayBuffer {
  const buf = new Uint8Array(100).fill(0);

  // 0x2B7C at offsets 0, 8, 16, 24
  for (const off of [0x00, 0x08, 0x10, 0x18]) {
    buf[off] = 0x2b; buf[off + 1] = 0x7c;
  }

  // 0x303C00FF at 0x20
  buf[0x20] = 0x30; buf[0x21] = 0x3c; buf[0x22] = 0x00; buf[0x23] = 0xff;

  // 0x32004EB9 at 0x24
  buf[0x24] = 0x32; buf[0x25] = 0x00; buf[0x26] = 0x4e; buf[0x27] = 0xb9;

  // 0x4E75 at 0x2C
  buf[0x2c] = 0x4e; buf[0x2d] = 0x75;

  return buf.buffer;
}

describe('isSteveTurnerFormat', () => {
  it('detects valid Steve Turner buffer', () => {
    expect(isSteveTurnerFormat(makeSteveTurnerBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isSteveTurnerFormat(new Uint8Array(makeSteveTurnerBuffer()))).toBe(true);
  });

  it('rejects wrong instruction at offset 0', () => {
    const buf = new Uint8Array(makeSteveTurnerBuffer());
    buf[0] = 0x00; buf[1] = 0x00;
    expect(isSteveTurnerFormat(buf)).toBe(false);
  });

  it('rejects wrong 0x303C00FF pattern', () => {
    const buf = new Uint8Array(makeSteveTurnerBuffer());
    buf[0x22] = 0x01; // change param
    expect(isSteveTurnerFormat(buf)).toBe(false);
  });

  it('rejects wrong RTS at 0x2C', () => {
    const buf = new Uint8Array(makeSteveTurnerBuffer());
    buf[0x2c] = 0x00;
    expect(isSteveTurnerFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isSteveTurnerFormat(new ArrayBuffer(40))).toBe(false);
  });

  it('rejects zeroed buffer', () => {
    expect(isSteveTurnerFormat(new ArrayBuffer(100))).toBe(false);
  });
});

describe('parseSteveTurnerFile', () => {
  it('parses without throwing', () => {
    const song = parseSteveTurnerFile(makeSteveTurnerBuffer(), 'JPO.test');
    expect(song).toBeDefined();
    expect(song.name).toContain('Steve Turner');
  });
});
