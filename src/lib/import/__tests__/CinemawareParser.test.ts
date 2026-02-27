/**
 * CinemawareParser Tests
 *
 * API:
 *   isCinemawareFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Magic: bytes[0..3] == 'IBLK' (0x49424C4B)
 *        byte[4] = sampleCount (1-127)
 *        'ASEQ' found within [4+sampleCount*138+18 .. +256) on 2-byte boundaries.
 *        Buffer must be at least searchStart+256 bytes long.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isCinemawareFormat } from '../formats/CinemawareParser';

function makeCinewareBuf(sampleCount = 1): ArrayBuffer {
  // Search window is [searchStart, searchStart+256), buffer must be >= searchStart+256
  const searchStart = 4 + sampleCount * 138 + 18;
  const minSize = searchStart + 256 + 4; // +4 for ASEQ at start of window
  const buf = new Uint8Array(minSize);
  // 'IBLK'
  buf[0]=0x49; buf[1]=0x42; buf[2]=0x4C; buf[3]=0x4B;
  // sampleCount
  buf[4] = sampleCount;
  // Place 'ASEQ' at start of window (on 2-byte boundary)
  buf[searchStart]   = 0x41; // 'A'
  buf[searchStart+1] = 0x53; // 'S'
  buf[searchStart+2] = 0x45; // 'E'
  buf[searchStart+3] = 0x51; // 'Q'
  return buf.buffer;
}

describe('isCinemawareFormat', () => {
  it('detects a crafted Cinemaware buffer (1 sample)', () => {
    expect(isCinemawareFormat(makeCinewareBuf(1))).toBe(true);
  });

  it('detects a crafted Cinemaware buffer (5 samples)', () => {
    expect(isCinemawareFormat(makeCinewareBuf(5))).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isCinemawareFormat(new ArrayBuffer(512))).toBe(false);
  });

  it('rejects when sample count is 0', () => {
    const buf = new Uint8Array(makeCinewareBuf(1));
    buf[4] = 0;
    expect(isCinemawareFormat(buf.buffer)).toBe(false);
  });

  it('rejects when sample count >= 0x80', () => {
    const buf = new Uint8Array(makeCinewareBuf(1));
    buf[4] = 0x80;
    expect(isCinemawareFormat(buf.buffer)).toBe(false);
  });

  it('rejects when ASEQ is missing from the window', () => {
    const buf = new Uint8Array(makeCinewareBuf(1));
    const searchStart = 4 + 1 * 138 + 18;
    buf[searchStart] = 0x00; // corrupt ASEQ
    expect(isCinemawareFormat(buf.buffer)).toBe(false);
  });
});
