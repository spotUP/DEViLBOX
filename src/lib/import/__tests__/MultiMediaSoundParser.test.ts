/**
 * MultiMediaSoundParser Tests — MultiMedia Sound (MMS) format detection
 *
 * Detection: first 31 longwords even and <=0x20000, then 'SO31' at offset 124,
 * then non-zero word at offset 128.
 */
import { describe, it, expect } from 'vitest';
import { isMultiMediaSoundFormat, parseMultiMediaSoundFile } from '../formats/MultiMediaSoundParser';

function makeMMSBuffer(): ArrayBuffer {
  const buf = new Uint8Array(200).fill(0);

  // First 31 longwords (0..123): each must be even and <= 0x20000
  // All zeros satisfy: 0 is even and 0 <= 0x20000
  // (We leave them as 0)

  // 'SO31' at offset 124: 0x53 0x4F 0x33 0x31
  buf[124] = 0x53; buf[125] = 0x4f; buf[126] = 0x33; buf[127] = 0x31;

  // Non-zero word at offset 128
  buf[128] = 0x00; buf[129] = 0x04; // = 4

  return buf.buffer;
}

describe('isMultiMediaSoundFormat', () => {
  it('detects valid MMS buffer', () => {
    expect(isMultiMediaSoundFormat(makeMMSBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isMultiMediaSoundFormat(new Uint8Array(makeMMSBuffer()))).toBe(true);
  });

  it('rejects missing SO31 magic', () => {
    const buf = new Uint8Array(makeMMSBuffer());
    buf[124] = 0x00;
    expect(isMultiMediaSoundFormat(buf)).toBe(false);
  });

  it('rejects zero word at offset 128', () => {
    const buf = new Uint8Array(makeMMSBuffer());
    buf[128] = 0x00; buf[129] = 0x00;
    expect(isMultiMediaSoundFormat(buf)).toBe(false);
  });

  it('rejects odd longword in first 31', () => {
    const buf = new Uint8Array(makeMMSBuffer());
    buf[3] = 0x01; // first longword = 1 (odd)
    expect(isMultiMediaSoundFormat(buf)).toBe(false);
  });

  it('rejects longword exceeding 0x20000', () => {
    const buf = new Uint8Array(makeMMSBuffer());
    buf[0] = 0x00; buf[1] = 0x03; buf[2] = 0x00; buf[3] = 0x00; // 0x00030000 > 0x20000
    expect(isMultiMediaSoundFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isMultiMediaSoundFormat(new ArrayBuffer(50))).toBe(false);
  });
});

describe('parseMultiMediaSoundFile', () => {
  it('parses without throwing', () => {
    const song = parseMultiMediaSoundFile(makeMMSBuffer(), 'MMS.test');
    expect(song).toBeDefined();
    expect(song.name).toContain('MultiMedia Sound');
  });
});
