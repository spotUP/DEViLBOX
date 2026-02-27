/**
 * UFOParser Tests — MicroProse UFO (FORM/DDAT/BODY/CHAN) format detection
 *
 * Detection: 'FORM' at 0, 'DDAT' at 8, 'BODY' at 12, 'CHAN' at 20.
 * File prefixes: MUS.* and UFO.*
 */
import { describe, it, expect } from 'vitest';
import { isUFOFormat, parseUFOFile } from '../formats/UFOParser';

function makeUFOBuffer(): ArrayBuffer {
  const buf = new Uint8Array(64).fill(0);
  // 'FORM' at 0: 0x46 0x4F 0x52 0x4D
  buf[0] = 0x46; buf[1] = 0x4f; buf[2] = 0x52; buf[3] = 0x4d;
  // size at 4-7 (skip)
  // 'DDAT' at 8: 0x44 0x44 0x41 0x54
  buf[8] = 0x44; buf[9] = 0x44; buf[10] = 0x41; buf[11] = 0x54;
  // 'BODY' at 12: 0x42 0x4F 0x44 0x59
  buf[12] = 0x42; buf[13] = 0x4f; buf[14] = 0x44; buf[15] = 0x59;
  // size at 16-19 (skip)
  // 'CHAN' at 20: 0x43 0x48 0x41 0x4E
  buf[20] = 0x43; buf[21] = 0x48; buf[22] = 0x41; buf[23] = 0x4e;
  return buf.buffer;
}

describe('isUFOFormat', () => {
  it('detects valid UFO/MUS buffer', () => {
    expect(isUFOFormat(makeUFOBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isUFOFormat(new Uint8Array(makeUFOBuffer()))).toBe(true);
  });

  it('rejects wrong FORM magic', () => {
    const buf = new Uint8Array(makeUFOBuffer());
    buf[0] = 0x00;
    expect(isUFOFormat(buf)).toBe(false);
  });

  it('rejects wrong DDAT tag', () => {
    const buf = new Uint8Array(makeUFOBuffer());
    buf[8] = 0x00;
    expect(isUFOFormat(buf)).toBe(false);
  });

  it('rejects wrong BODY tag', () => {
    const buf = new Uint8Array(makeUFOBuffer());
    buf[12] = 0x00;
    expect(isUFOFormat(buf)).toBe(false);
  });

  it('rejects wrong CHAN tag', () => {
    const buf = new Uint8Array(makeUFOBuffer());
    buf[20] = 0x00;
    expect(isUFOFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isUFOFormat(new ArrayBuffer(20))).toBe(false);
  });

  it('rejects zeroed buffer', () => {
    expect(isUFOFormat(new ArrayBuffer(64))).toBe(false);
  });
});

describe('parseUFOFile', () => {
  it('parses without throwing', () => {
    const song = parseUFOFile(makeUFOBuffer(), 'UFO.testsong');
    expect(song).toBeDefined();
    expect(song.name).toContain('UFO');
  });
});
