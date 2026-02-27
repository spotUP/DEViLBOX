/**
 * TitanicsPackerParser Tests — Titanics Packer format detection
 *
 * Detection: file >= 437 bytes, 128-word table at offset 180 where each word
 * is non-zero and even, or 0xFFFF (end-of-list terminator, causes early success).
 * File prefix: TITS.*
 */
import { describe, it, expect } from 'vitest';
import { isTitanicsPackerFormat, parseTitanicsPackerFile } from '../formats/TitanicsPackerParser';

function makeTitanicsBufferWithEnd(): ArrayBuffer {
  // Put 0xFFFF at first word of table (offset 180) -> immediate success
  const buf = new Uint8Array(500).fill(0);
  buf[180] = 0xff; buf[181] = 0xff;
  return buf.buffer;
}

function makeTitanicsBufferAllEven(): ArrayBuffer {
  // All 128 words are 0x0002 (even, non-zero)
  const buf = new Uint8Array(500).fill(0);
  for (let i = 0; i < 128; i++) {
    const off = 180 + i * 2;
    buf[off] = 0x00; buf[off + 1] = 0x02;
  }
  return buf.buffer;
}

describe('isTitanicsPackerFormat', () => {
  it('detects buffer with 0xFFFF end marker', () => {
    expect(isTitanicsPackerFormat(makeTitanicsBufferWithEnd())).toBe(true);
  });

  it('detects buffer with all even non-zero words', () => {
    expect(isTitanicsPackerFormat(makeTitanicsBufferAllEven())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isTitanicsPackerFormat(new Uint8Array(makeTitanicsBufferWithEnd()))).toBe(true);
  });

  it('rejects zero word in table', () => {
    // All zeros at table -> word=0 fails
    const buf = new Uint8Array(500).fill(0);
    expect(isTitanicsPackerFormat(buf)).toBe(false);
  });

  it('rejects odd non-0xFFFF word in table', () => {
    const buf = new Uint8Array(500).fill(0);
    buf[180] = 0x00; buf[181] = 0x03; // 3 is odd and != 0xFFFF
    expect(isTitanicsPackerFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isTitanicsPackerFormat(new ArrayBuffer(300))).toBe(false);
  });
});

describe('parseTitanicsPackerFile', () => {
  it('parses without throwing', () => {
    const song = parseTitanicsPackerFile(makeTitanicsBufferWithEnd(), 'TITS.test');
    expect(song).toBeDefined();
    expect(song.name).toContain('Titanics Packer');
  });
});
