/**
 * Anders0landParser Tests
 *
 * API:
 *   isAnders0landFormat(buffer: ArrayBuffer, filename?: string): boolean
 *
 * Detection: three-chunk structure with tags "mpl", "mdt", "msm".
 * Filename prefix "hot." is required when filename is supplied.
 * No reference music files found for this format.
 */
import { describe, it, expect } from 'vitest';
import { isAnders0landFormat } from '../formats/Anders0landParser';

/**
 * Build a minimal valid Anders 0land buffer:
 * chunk1: "mpl\0" + size=8 (min even size pointing to next chunk at offset 8)
 * chunk2: "mdt\0" + size=8
 * chunk3: "msm\0" + size=8
 */
function makeAnders0landBuf(): ArrayBuffer {
  const buf = new Uint8Array(24);
  let off = 0;
  function writeChunk(tag: number[], size: number) {
    buf[off++] = tag[0]; buf[off++] = tag[1]; buf[off++] = tag[2]; buf[off++] = 0;
    // size as uint32BE
    buf[off++] = (size >>> 24) & 0xFF;
    buf[off++] = (size >>> 16) & 0xFF;
    buf[off++] = (size >>> 8) & 0xFF;
    buf[off++] = size & 0xFF;
  }
  writeChunk([0x6d,0x70,0x6c], 8); // "mpl" size=8
  writeChunk([0x6d,0x64,0x74], 8); // "mdt" size=8
  writeChunk([0x6d,0x73,0x6d], 8); // "msm" size=8
  return buf.buffer;
}

describe('isAnders0landFormat', () => {
  it('detects crafted buffer with correct chunks (no filename)', () => {
    expect(isAnders0landFormat(makeAnders0landBuf())).toBe(true);
  });

  it('detects crafted buffer with hot. prefix filename', () => {
    expect(isAnders0landFormat(makeAnders0landBuf(), 'hot.testsong')).toBe(true);
  });

  it('rejects when filename is supplied without hot. prefix', () => {
    expect(isAnders0landFormat(makeAnders0landBuf(), 'other.song')).toBe(false);
  });

  it('rejects an all-zero buffer', () => {
    expect(isAnders0landFormat(new ArrayBuffer(64))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isAnders0landFormat(new ArrayBuffer(10))).toBe(false);
  });

  it('rejects wrong chunk tags', () => {
    const buf = new Uint8Array(makeAnders0landBuf());
    buf[0] = 0x00; // corrupt first tag byte
    expect(isAnders0landFormat(buf.buffer)).toBe(false);
  });
});
