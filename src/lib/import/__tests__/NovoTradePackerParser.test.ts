/**
 * NovoTradePackerParser Tests — NovoTrade Packer format detection
 *
 * Detection: 'MODU' at 0, D1=u16BE(16) and D2=u16BE(24) are positive/even/non-negative,
 * 'BODY' at 4+D1, 'SAMP' at 4+D1+D2.
 */
import { describe, it, expect } from 'vitest';
import { isNovoTradePackerFormat, parseNovoTradePackerFile } from '../formats/NovoTradePackerParser';

function makeNTPBuffer(): ArrayBuffer {
  // D1 = 8 (positive, even, bit-15 clear), D2 = 8
  // BODY at offset 4 + 8 = 12
  // SAMP at offset 4 + 8 + 8 = 20
  const buf = new Uint8Array(64).fill(0);

  // 'MODU' at 0
  buf[0] = 0x4d; buf[1] = 0x4f; buf[2] = 0x44; buf[3] = 0x55;
  // D1 = u16BE(16) = 8
  buf[16] = 0x00; buf[17] = 0x08;
  // D2 = u16BE(24) = 8
  buf[24] = 0x00; buf[25] = 0x08;
  // 'BODY' at offset 4+8 = 12
  buf[12] = 0x42; buf[13] = 0x4f; buf[14] = 0x44; buf[15] = 0x59;
  // 'SAMP' at offset 4+8+8 = 20
  buf[20] = 0x53; buf[21] = 0x41; buf[22] = 0x4d; buf[23] = 0x50;

  return buf.buffer;
}

describe('isNovoTradePackerFormat', () => {
  it('detects valid NTP buffer', () => {
    expect(isNovoTradePackerFormat(makeNTPBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isNovoTradePackerFormat(new Uint8Array(makeNTPBuffer()))).toBe(true);
  });

  it('rejects wrong magic (not MODU)', () => {
    const buf = new Uint8Array(makeNTPBuffer());
    buf[0] = 0x00;
    expect(isNovoTradePackerFormat(buf)).toBe(false);
  });

  it('rejects D1 = 0', () => {
    const buf = new Uint8Array(makeNTPBuffer());
    buf[16] = 0x00; buf[17] = 0x00;
    expect(isNovoTradePackerFormat(buf)).toBe(false);
  });

  it('rejects odd D1', () => {
    const buf = new Uint8Array(makeNTPBuffer());
    buf[17] = 0x09; // D1 = 9 (odd)
    expect(isNovoTradePackerFormat(buf)).toBe(false);
  });

  it('rejects missing BODY tag', () => {
    const buf = new Uint8Array(makeNTPBuffer());
    buf[12] = 0x00;
    expect(isNovoTradePackerFormat(buf)).toBe(false);
  });

  it('rejects missing SAMP tag', () => {
    const buf = new Uint8Array(makeNTPBuffer());
    buf[20] = 0x00;
    expect(isNovoTradePackerFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isNovoTradePackerFormat(new ArrayBuffer(20))).toBe(false);
  });
});

describe('parseNovoTradePackerFile', () => {
  it('parses without throwing', () => {
    const song = parseNovoTradePackerFile(makeNTPBuffer(), 'NTP.test');
    expect(song).toBeDefined();
    expect(song.name).toContain('NovoTrade');
  });
});
