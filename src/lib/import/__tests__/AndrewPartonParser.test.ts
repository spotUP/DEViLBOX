/**
 * AndrewPartonParser Tests
 *
 * API:
 *   isAndrewPartonFormat(buffer: ArrayBuffer, filename?: string): boolean
 *
 * Magic: 'BANK' (0x42414E4B) at offset 0.
 * Then 20 × uint32BE chip-RAM offsets (each < 0x200000) and 40 × uint32BE sample
 * lengths (each < 0x10000). Minimum 244 bytes.
 * Filename prefix "bye." is required when filename is supplied.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isAndrewPartonFormat } from '../formats/AndrewPartonParser';

function makeAndrewBuf(): ArrayBuffer {
  // 4 (magic) + 20*4 (chip RAM offsets) + 40*4 (sample lengths) = 244
  const buf = new Uint8Array(244);
  // 'BANK'
  buf[0]=0x42; buf[1]=0x41; buf[2]=0x4E; buf[3]=0x4B;
  // 20 chip-RAM offsets: all 0x00100000 (< 0x200000) stored as uint32BE
  for (let i = 0; i < 20; i++) {
    const off = 4 + i * 4;
    buf[off]   = 0x00; buf[off+1] = 0x10; buf[off+2] = 0x00; buf[off+3] = 0x00;
  }
  // 40 sample lengths: all 0x00008000 (< 0x10000) stored as uint32BE
  for (let i = 0; i < 40; i++) {
    const off = 84 + i * 4;
    buf[off]   = 0x00; buf[off+1] = 0x00; buf[off+2] = 0x80; buf[off+3] = 0x00;
  }
  return buf.buffer;
}

describe('isAndrewPartonFormat', () => {
  it('detects a crafted Andrew Parton buffer (no filename)', () => {
    expect(isAndrewPartonFormat(makeAndrewBuf())).toBe(true);
  });

  it('detects crafted buffer with bye. prefix', () => {
    expect(isAndrewPartonFormat(makeAndrewBuf(), 'bye.song')).toBe(true);
  });

  it('rejects when filename is supplied without bye. prefix', () => {
    expect(isAndrewPartonFormat(makeAndrewBuf(), 'other.song')).toBe(false);
  });

  it('rejects an all-zero buffer', () => {
    expect(isAndrewPartonFormat(new ArrayBuffer(244))).toBe(false);
  });

  it('rejects when a chip-RAM offset exceeds 0x200000', () => {
    const buf = new Uint8Array(makeAndrewBuf());
    buf[4] = 0x00; buf[5] = 0x20; buf[6] = 0x00; buf[7] = 0x01; // 0x00200001 >= 0x200000
    expect(isAndrewPartonFormat(buf.buffer)).toBe(false);
  });

  it('rejects when a sample length exceeds 0x10000', () => {
    const buf = new Uint8Array(makeAndrewBuf());
    buf[84] = 0x00; buf[85] = 0x01; buf[86] = 0x00; buf[87] = 0x00; // 0x00010000 >= 0x10000
    expect(isAndrewPartonFormat(buf.buffer)).toBe(false);
  });
});
