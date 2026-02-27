/**
 * PaulTongeParser Tests — Paul Tonge format detection
 *
 * Detection: word[0]=0x000C, then 3 offset words where each non-zero offset
 * must be positive/even, point to a positive word, and have 0x80 or 0x8F at offset-1.
 * File prefix: PAT.*
 */
import { describe, it, expect } from 'vitest';
import { isPaulTongeFormat, parsePaulTongeFile } from '../formats/PaulTongeParser';

function makePaulTongeBuffer(): ArrayBuffer {
  // word[0] = 0x000C = 12
  // offset1 = 0x000A = 10 (even, non-negative, non-zero)
  //   buf[10] = 0x80 (byte before pointed-to word, i.e. at offset1-1 = 9)
  //   buf[10..11] = word = 1 (> 0, so indirect word is positive)
  // Wait: offset D1 = 10, so byte at buf[10-1]=buf[9]=0x80 or 0x8F,
  //   and word at buf[10..11] must be > 0.
  const buf = new Uint8Array(64).fill(0);

  // word[0] = 0x000C
  buf[0] = 0x00; buf[1] = 0x0c;

  // offset1 (at byte 2..3) = 10
  buf[2] = 0x00; buf[3] = 0x0a;

  // byte at offset1-1 = buf[9] = 0x80
  buf[9] = 0x80;
  // word at offset1 = buf[10..11] = 1 (positive)
  buf[10] = 0x00; buf[11] = 0x01;

  // offset2 and offset3 = 0 (zero: skip)
  buf[4] = 0x00; buf[5] = 0x00;
  buf[6] = 0x00; buf[7] = 0x00;

  return buf.buffer;
}

describe('isPaulTongeFormat', () => {
  it('detects valid Paul Tonge buffer', () => {
    expect(isPaulTongeFormat(makePaulTongeBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isPaulTongeFormat(new Uint8Array(makePaulTongeBuffer()))).toBe(true);
  });

  it('rejects wrong header word (not 0x000C)', () => {
    const buf = new Uint8Array(makePaulTongeBuffer());
    buf[1] = 0x00; // word[0] = 0
    expect(isPaulTongeFormat(buf)).toBe(false);
  });

  it('rejects offset with bit 15 set (negative)', () => {
    const buf = new Uint8Array(makePaulTongeBuffer());
    buf[2] = 0x80; buf[3] = 0x0a; // offset1 = 0x800A, bit15 set
    expect(isPaulTongeFormat(buf)).toBe(false);
  });

  it('rejects odd offset', () => {
    const buf = new Uint8Array(makePaulTongeBuffer());
    buf[3] = 0x0b; // offset1 = 11 (odd)
    expect(isPaulTongeFormat(buf)).toBe(false);
  });

  it('rejects wrong marker byte (not 0x80 or 0x8F)', () => {
    const buf = new Uint8Array(makePaulTongeBuffer());
    buf[9] = 0x7f; // not 0x80 or 0x8F
    expect(isPaulTongeFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isPaulTongeFormat(new ArrayBuffer(5))).toBe(false);
  });
});

describe('parsePaulTongeFile', () => {
  it('parses without throwing', () => {
    const song = parsePaulTongeFile(makePaulTongeBuffer(), 'PAT.testsong');
    expect(song).toBeDefined();
    expect(song.name).toContain('Paul Tonge');
  });
});
