/**
 * PierreAdaneParser Tests — Pierre Adane Packer format detection
 *
 * Detection: 4 offset words D1-D4 that are even, positive, and satisfy
 * structural constraints: gap43==gap32, gap43==gap21-2; terminator 0xFF at
 * the dereferenced location; sequence table entries are even, non-negative, <=D1.
 * File prefix: PAP.*
 */
import { describe, it, expect } from 'vitest';
import { isPierreAdaneFormat, parsePierreAdaneFile } from '../formats/PierreAdaneParser';

function makePierreAdaneBuffer(): ArrayBuffer {
  // D1=32, D2=36, D3=38, D4=40
  // gap43 = 40-38 = 2
  // gap32 = 38-36 = 2  (== gap43 OK)
  // gap21 = 36-32 = 4
  // gap43 == gap21-2? 2 == 4-2 = 2 OK
  //
  // D5_final = D4_orig + gap43 = 40 + 2 = 42
  //
  // D4_new = u16BE(buf, D1) = u16BE(buf, 32) = 28
  //   buf[28] = 0xFF (terminator) — offset 28 is free (not overlapping header 0..7)
  //   D4_new = 28: even, non-negative, <= D1=32 OK
  //
  // Scan from offset 32 to 42, step 2:
  //   buf[32..33] = 0x001C = 28 (D4_new): even, non-neg, 28<=32 OK
  //   buf[34..41] = 0x0000: even, non-neg, 0<=32 OK

  const buf = new Uint8Array(50).fill(0);

  // Header offsets
  buf[0] = 0x00; buf[1] = 0x20;  // D1 = 32
  buf[2] = 0x00; buf[3] = 0x24;  // D2 = 36
  buf[4] = 0x00; buf[5] = 0x26;  // D3 = 38
  buf[6] = 0x00; buf[7] = 0x28;  // D4 = 40

  // Terminator byte at offset 28
  buf[28] = 0xFF;

  // Sequence table starts at D1=32
  // First entry (D4_new) points to the terminator at 28
  buf[32] = 0x00; buf[33] = 0x1C;  // D4_new = 28

  // Remaining scan entries (34..41) are all zero (valid)

  return buf.buffer;
}

describe('isPierreAdaneFormat', () => {
  it('detects valid Pierre Adane buffer', () => {
    expect(isPierreAdaneFormat(makePierreAdaneBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isPierreAdaneFormat(new Uint8Array(makePierreAdaneBuffer()))).toBe(true);
  });

  it('rejects D1 = 0', () => {
    const buf = new Uint8Array(makePierreAdaneBuffer());
    buf[0] = 0x00; buf[1] = 0x00;
    expect(isPierreAdaneFormat(buf)).toBe(false);
  });

  it('rejects odd D1', () => {
    const buf = new Uint8Array(makePierreAdaneBuffer());
    buf[1] = 0x21; // D1 = 33 (odd)
    expect(isPierreAdaneFormat(buf)).toBe(false);
  });

  it('rejects gap mismatch (gap43 != gap32)', () => {
    const buf = new Uint8Array(makePierreAdaneBuffer());
    buf[5] = 0x27; // D3 = 39 (odd) -> odd word also rejected
    expect(isPierreAdaneFormat(buf)).toBe(false);
  });

  it('rejects missing terminator 0xFF', () => {
    const buf = new Uint8Array(makePierreAdaneBuffer());
    buf[28] = 0x00; // terminator no longer 0xFF
    expect(isPierreAdaneFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isPierreAdaneFormat(new ArrayBuffer(5))).toBe(false);
  });
});

describe('parsePierreAdaneFile', () => {
  it('parses without throwing', () => {
    const song = parsePierreAdaneFile(makePierreAdaneBuffer(), 'PAP.testsong');
    expect(song).toBeDefined();
    expect(song.name).toContain('Pierre Adane');
  });
});
