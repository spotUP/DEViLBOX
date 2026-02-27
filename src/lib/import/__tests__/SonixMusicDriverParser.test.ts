/**
 * SonixMusicDriverParser Tests — Sonix Music Driver (SNX/TINY/SMUS) detection
 *
 * Three sub-formats:
 *   smus: first 4 bytes = 'FORM'
 *   tiny: first word & 0x00F0 != 0
 *   snx:  first word & 0x00F0 == 0 (default)
 */
import { describe, it, expect } from 'vitest';
import { detectSonixFormat, isSonixFormat } from '../formats/SonixMusicDriverParser';

// Build a minimal SMUS buffer
function makeSmusBuffer(): ArrayBuffer {
  const buf = new Uint8Array(300).fill(0);
  // 'FORM' at 0
  buf[0] = 0x46; buf[1] = 0x4f; buf[2] = 0x52; buf[3] = 0x4d;
  // size at 4 (ignored)
  buf[4] = 0x00; buf[5] = 0x00; buf[6] = 0x01; buf[7] = 0x00;
  // 'SMUS' at 8
  buf[8] = 0x53; buf[9] = 0x4d; buf[10] = 0x55; buf[11] = 0x53;
  // byte 23 non-zero
  buf[23] = 0x01;
  // 'NAME' chunk at 24
  buf[24] = 0x4e; buf[25] = 0x41; buf[26] = 0x4d; buf[27] = 0x45;
  // NAME size = 2 (round up to even: 2)
  buf[28] = 0x00; buf[29] = 0x00; buf[30] = 0x00; buf[31] = 0x02;
  // NAME data: 2 bytes (just zeros; rounded up to 2 so advance 2)
  // next chunk at 24+8+2 = 34
  // 'SNX1' at 34
  buf[34] = 0x53; buf[35] = 0x4e; buf[36] = 0x58; buf[37] = 0x31;
  // SNX1 size = 2
  buf[38] = 0x00; buf[39] = 0x00; buf[40] = 0x00; buf[41] = 0x02;
  // SNX1 data: 2 bytes at 42-43
  // 'TRAK' at 44 — detection succeeds
  buf[44] = 0x54; buf[45] = 0x52; buf[46] = 0x41; buf[47] = 0x4b;

  return buf.buffer;
}

describe('detectSonixFormat', () => {
  it('detects SMUS sub-format', () => {
    expect(detectSonixFormat(makeSmusBuffer())).toBe('smus');
  });

  it('returns null for zeroed buffer', () => {
    expect(detectSonixFormat(new ArrayBuffer(300))).toBeNull();
  });

  it('returns null for too-small buffer', () => {
    expect(detectSonixFormat(new ArrayBuffer(4))).toBeNull();
  });
});

describe('isSonixFormat', () => {
  it('returns true for SMUS buffer', () => {
    expect(isSonixFormat(makeSmusBuffer())).toBe(true);
  });

  it('returns false for random buffer', () => {
    const buf = new Uint8Array(64).fill(0xaa);
    buf[0] = 0x00; // ensure no 'FORM' magic
    expect(isSonixFormat(buf)).toBe(false);
  });
});
