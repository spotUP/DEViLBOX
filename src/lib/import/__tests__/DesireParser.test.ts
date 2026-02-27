/**
 * DesireParser Tests
 *
 * API:
 *   isDesireFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Detection: file > 2500 bytes, four longs 0x00010101 at offsets 8,24,40,56,
 *            scan [72..472) for word 0x49FA then specific magic sequence.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isDesireFormat } from '../formats/DesireParser';

function makeDesireBuf(): Uint8Array {
  const buf = new Uint8Array(2600);

  function u32BE(off: number, val: number) {
    buf[off]   = (val >>> 24) & 0xFF;
    buf[off+1] = (val >>> 16) & 0xFF;
    buf[off+2] = (val >>> 8) & 0xFF;
    buf[off+3] = val & 0xFF;
  }
  function u16BE(off: number, val: number) {
    buf[off]   = (val >>> 8) & 0xFF;
    buf[off+1] = val & 0xFF;
  }

  // Four longs of 0x00010101 at offsets 8, 24, 40, 56
  for (let i = 0; i < 4; i++) u32BE(8 + i * 16, 0x00010101);

  // Place 0x49FA at offset 72 (start of scan window)
  const pos = 72;
  u16BE(pos, 0x49FA);
  // Followed by addq.l #2 skip (pos+2..pos+3 ignored), then checks at pos+4..pos+19:
  u32BE(pos+4,  0x45F900DF);
  u32BE(pos+8,  0xF000357C);
  u32BE(pos+12, 0x00FF009E);
  u16BE(pos+16, 0x41FA);
  // Back-reference: s16(pos+18) must equal -(pos+18)
  // pos+18 = 90, so rel = -90 = 0xFFA6 as signed 16-bit
  const rel = (-( pos + 18)) & 0xFFFF;
  u16BE(pos+18, rel);

  return buf;
}

describe('isDesireFormat', () => {
  it('detects a crafted Desire buffer', () => {
    expect(isDesireFormat(makeDesireBuf().buffer as ArrayBuffer)).toBe(true);
  });

  it('detects using Uint8Array input', () => {
    expect(isDesireFormat(makeDesireBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isDesireFormat(new ArrayBuffer(3000))).toBe(false);
  });

  it('rejects when file is too small (<= 2500 bytes)', () => {
    const buf = makeDesireBuf();
    expect(isDesireFormat(buf.subarray(0, 2500))).toBe(false);
  });

  it('rejects when 0x00010101 markers are missing', () => {
    const buf = makeDesireBuf();
    // Zero out the first marker
    buf[8]=0; buf[9]=0; buf[10]=0; buf[11]=0;
    expect(isDesireFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });
});
