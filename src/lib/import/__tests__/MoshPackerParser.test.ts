/**
 * MoshPackerParser Tests — Mosh Packer format detection
 *
 * Detection: 31 sample headers at bytes 0-247 with bit-15 clear and volume<=64,
 * then 'M.K.' (0x4D2E4B2E) at offset 378.
 */
import { describe, it, expect } from 'vitest';
import { isMoshPackerFormat, parseMoshPackerFile } from '../formats/MoshPackerParser';

function makeMoshBuffer(): ArrayBuffer {
  const buf = new Uint8Array(512).fill(0);

  // 31 sample headers x 8 bytes (offsets 0..247)
  // word0=0, word1=0, word2 (volume)=32, word3=0 — all bit-15 clear, vol<=64
  for (let i = 0; i < 31; i++) {
    const b = i * 8;
    buf[b + 4] = 0x00; buf[b + 5] = 0x20; // word2 = 32 (volume, <= 0x40)
  }

  // 'M.K.' at offset 378: 0x4D 0x2E 0x4B 0x2E
  buf[378] = 0x4d; buf[379] = 0x2e; buf[380] = 0x4b; buf[381] = 0x2e;

  return buf.buffer;
}

describe('isMoshPackerFormat', () => {
  it('detects valid Mosh Packer buffer', () => {
    expect(isMoshPackerFormat(makeMoshBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isMoshPackerFormat(new Uint8Array(makeMoshBuffer()))).toBe(true);
  });

  it('rejects missing M.K. signature', () => {
    const buf = new Uint8Array(makeMoshBuffer());
    buf[378] = 0x00;
    expect(isMoshPackerFormat(buf)).toBe(false);
  });

  it('rejects volume > 64 in sample header', () => {
    const buf = new Uint8Array(makeMoshBuffer());
    buf[5] = 0x50; // word2 of header 0 = 0x0050 = 80 > 64
    expect(isMoshPackerFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isMoshPackerFormat(new ArrayBuffer(100))).toBe(false);
  });

  it('rejects zeroed buffer', () => {
    // Zeroed: M.K. will be 0, not 0x4D2E4B2E
    expect(isMoshPackerFormat(new ArrayBuffer(512))).toBe(false);
  });
});

describe('parseMoshPackerFile', () => {
  it('parses without throwing', () => {
    const song = parseMoshPackerFile(makeMoshBuffer(), 'mosh.test');
    expect(song).toBeDefined();
    expect(song.name).toContain('Mosh Packer');
    expect(song.numChannels).toBe(4);
  });
});
