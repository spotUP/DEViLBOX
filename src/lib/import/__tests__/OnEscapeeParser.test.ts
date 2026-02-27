/**
 * OnEscapeeParser Tests — onEscapee format detection
 *
 * Detection: 24 repeated 0xAA55FF00 at offset 0 (Pattern A)
 *         OR 24 repeated 0x55AA00FF at offset 4 (Pattern B).
 * File prefix: ONE.*
 */
import { describe, it, expect } from 'vitest';
import { isOnEscapeeFormat, parseOnEscapeeFile } from '../formats/OnEscapeeParser';

function makeOnEscapeeBufferA(): ArrayBuffer {
  // Pattern A: 24 x 0xAA55FF00 starting at offset 0
  const buf = new Uint8Array(200).fill(0);
  for (let i = 0; i < 24; i++) {
    const off = i * 4;
    buf[off] = 0xaa; buf[off + 1] = 0x55; buf[off + 2] = 0xff; buf[off + 3] = 0x00;
  }
  return buf.buffer;
}

function makeOnEscapeeBufferB(): ArrayBuffer {
  // Pattern B: 24 x 0x55AA00FF starting at offset 4
  const buf = new Uint8Array(200).fill(0);
  for (let i = 0; i < 24; i++) {
    const off = 4 + i * 4;
    buf[off] = 0x55; buf[off + 1] = 0xaa; buf[off + 2] = 0x00; buf[off + 3] = 0xff;
  }
  return buf.buffer;
}

describe('isOnEscapeeFormat', () => {
  it('detects Pattern A (0xAA55FF00 x24 at offset 0)', () => {
    expect(isOnEscapeeFormat(makeOnEscapeeBufferA())).toBe(true);
  });

  it('detects Pattern B (0x55AA00FF x24 at offset 4)', () => {
    expect(isOnEscapeeFormat(makeOnEscapeeBufferB())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isOnEscapeeFormat(new Uint8Array(makeOnEscapeeBufferA()))).toBe(true);
  });

  it('rejects buffer that is too small', () => {
    expect(isOnEscapeeFormat(new ArrayBuffer(50))).toBe(false);
  });

  it('rejects zeroed buffer', () => {
    expect(isOnEscapeeFormat(new ArrayBuffer(200))).toBe(false);
  });

  it('rejects buffer with wrong repeated value', () => {
    const buf = new Uint8Array(200).fill(0);
    // Use 0xDEADBEEF instead
    for (let i = 0; i < 24; i++) {
      const off = i * 4;
      buf[off] = 0xde; buf[off + 1] = 0xad; buf[off + 2] = 0xbe; buf[off + 3] = 0xef;
    }
    expect(isOnEscapeeFormat(buf.buffer)).toBe(false);
  });
});

describe('parseOnEscapeeFile', () => {
  it('parses without throwing', () => {
    const song = parseOnEscapeeFile(makeOnEscapeeBufferA(), 'ONE.testsong');
    expect(song).toBeDefined();
    expect(song.name).toContain('onEscapee');
  });
});
