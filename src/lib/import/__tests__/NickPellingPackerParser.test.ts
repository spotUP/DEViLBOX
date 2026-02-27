/**
 * NickPellingPackerParser Tests — Nick Pelling Packer format detection
 *
 * Detection: 'COMP' (0x434F4D50) at 0, word=0 at 4, word=size at 6 where
 * size in [16,272], 4-byte aligned; decompressed size at buf[6+size-10] <= fileLen.
 */
import { describe, it, expect } from 'vitest';
import { isNickPellingPackerFormat, parseNickPellingPackerFile } from '../formats/NickPellingPackerParser';

function makeNPPBuffer(): ArrayBuffer {
  // size = 16 (minimum valid, 4-byte aligned)
  // decompSizeOff = 6 + 16 - 10 = 12
  // buf[12..15] = decompressed size (must be <= fileLen)
  const fileLen = 100;
  const buf = new Uint8Array(fileLen).fill(0);

  // 'COMP' at 0
  buf[0] = 0x43; buf[1] = 0x4f; buf[2] = 0x4d; buf[3] = 0x50;
  // word=0 at offset 4
  buf[4] = 0x00; buf[5] = 0x00;
  // size=16 at offset 6
  buf[6] = 0x00; buf[7] = 0x10;
  // decompressed size at offset 12: value = 50 (<=100)
  buf[12] = 0x00; buf[13] = 0x00; buf[14] = 0x00; buf[15] = 0x32;

  return buf.buffer;
}

describe('isNickPellingPackerFormat', () => {
  it('detects valid NPP buffer', () => {
    expect(isNickPellingPackerFormat(makeNPPBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isNickPellingPackerFormat(new Uint8Array(makeNPPBuffer()))).toBe(true);
  });

  it('rejects wrong magic', () => {
    const buf = new Uint8Array(makeNPPBuffer());
    buf[0] = 0x00;
    expect(isNickPellingPackerFormat(buf)).toBe(false);
  });

  it('rejects non-zero word at offset 4', () => {
    const buf = new Uint8Array(makeNPPBuffer());
    buf[5] = 0x01;
    expect(isNickPellingPackerFormat(buf)).toBe(false);
  });

  it('rejects size < 16', () => {
    const buf = new Uint8Array(makeNPPBuffer());
    buf[7] = 0x08; // size = 8
    expect(isNickPellingPackerFormat(buf)).toBe(false);
  });

  it('rejects odd size', () => {
    const buf = new Uint8Array(makeNPPBuffer());
    buf[7] = 0x11; // size = 17 (odd)
    expect(isNickPellingPackerFormat(buf)).toBe(false);
  });

  it('rejects decompressed size exceeding file length', () => {
    const buf = new Uint8Array(makeNPPBuffer());
    // decompSize = 0xFFFFFFFF > fileLen
    buf[12] = 0xff; buf[13] = 0xff; buf[14] = 0xff; buf[15] = 0xff;
    expect(isNickPellingPackerFormat(buf)).toBe(false);
  });
});

describe('parseNickPellingPackerFile', () => {
  it('parses without throwing', () => {
    const song = parseNickPellingPackerFile(makeNPPBuffer(), 'NPP.test');
    expect(song).toBeDefined();
    expect(song.name).toContain('Nick Pelling Packer');
  });
});
