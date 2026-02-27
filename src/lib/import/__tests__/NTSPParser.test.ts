/**
 * NTSPParser Tests — NTSP-system format detection
 *
 * Detection: bytes[0..3] = 'SPNT' (0x53504E54) and bytes[4..7] != 0.
 * File prefix: TWO.*
 */
import { describe, it, expect } from 'vitest';
import { isNTSPFormat, parseNTSPFile } from '../formats/NTSPParser';

function makeNTSPBuffer(): ArrayBuffer {
  const buf = new Uint8Array(64).fill(0);
  // 'SPNT' = 0x53 0x50 0x4E 0x54
  buf[0] = 0x53; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x54;
  // Non-zero word at bytes 4..7
  buf[4] = 0x00; buf[5] = 0x00; buf[6] = 0x00; buf[7] = 0x01;
  return buf.buffer;
}

describe('isNTSPFormat', () => {
  it('detects valid NTSP buffer', () => {
    expect(isNTSPFormat(makeNTSPBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isNTSPFormat(new Uint8Array(makeNTSPBuffer()))).toBe(true);
  });

  it('rejects wrong magic', () => {
    const buf = new Uint8Array(makeNTSPBuffer());
    buf[0] = 0x00;
    expect(isNTSPFormat(buf)).toBe(false);
  });

  it('rejects zero secondary word', () => {
    const buf = new Uint8Array(makeNTSPBuffer());
    buf[4] = 0; buf[5] = 0; buf[6] = 0; buf[7] = 0;
    expect(isNTSPFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isNTSPFormat(new ArrayBuffer(4))).toBe(false);
  });

  it('rejects zeroed buffer', () => {
    expect(isNTSPFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseNTSPFile', () => {
  it('parses without throwing', () => {
    const song = parseNTSPFile(makeNTSPBuffer(), 'TWO.testsong');
    expect(song).toBeDefined();
    expect(song.name).toContain('NTSP System');
  });
});
