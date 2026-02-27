/**
 * PeterVerswyvelenPackerParser Tests — Peter Verswyvelen Packer format detection
 *
 * Detection: 31 sample headers with bit-15 checks, then patCount/songLen/limit
 * validation, then a non-decreasing even step table.
 * File prefix: PVP.*
 */
import { describe, it, expect } from 'vitest';
import { isPeterVerswyvelenPackerFormat, parsePeterVerswyvelenPackerFile } from '../formats/PeterVerswyvelenPackerParser';

function makePVPBuffer(): ArrayBuffer {
  // Need >= 260 bytes, step table at 256 for (patCount-2) words
  // patCount=2 → stepCount=0, so no step table bytes needed beyond 258
  const buf = new Uint8Array(300).fill(0);

  // 31 sample headers x 8 bytes — all zeros: bit-15 clear, vol=0<=64
  // (Offset 0..247 all zero: OK)

  // offset 248: patCount = 2 (non-zero, bit-15 clear)
  buf[248] = 0x00; buf[249] = 0x02;

  // offset 250: songLen = 2 (non-zero, bit-15 clear, even)
  buf[250] = 0x00; buf[251] = 0x02;

  // offset 252: val252 = 4 (songLen < val252: 2 < 4 OK)
  buf[252] = 0x00; buf[253] = 0x04;

  // offset 254: limit = 10 (non-zero, bit-15 clear)
  buf[254] = 0x00; buf[255] = 0x0a;

  // Step table at 256: patCount-2 = 0 words → no entries needed

  return buf.buffer;
}

describe('isPeterVerswyvelenPackerFormat', () => {
  it('detects valid PVP buffer', () => {
    expect(isPeterVerswyvelenPackerFormat(makePVPBuffer())).toBe(true);
  });

  it('accepts Uint8Array input', () => {
    expect(isPeterVerswyvelenPackerFormat(new Uint8Array(makePVPBuffer()))).toBe(true);
  });

  it('rejects patCount = 0', () => {
    const buf = new Uint8Array(makePVPBuffer());
    buf[248] = 0x00; buf[249] = 0x00;
    expect(isPeterVerswyvelenPackerFormat(buf)).toBe(false);
  });

  it('rejects odd songLen', () => {
    const buf = new Uint8Array(makePVPBuffer());
    buf[251] = 0x03; // songLen = 3 (odd)
    expect(isPeterVerswyvelenPackerFormat(buf)).toBe(false);
  });

  it('rejects songLen >= val252', () => {
    const buf = new Uint8Array(makePVPBuffer());
    buf[252] = 0x00; buf[253] = 0x02; // val252 = 2 == songLen (not strictly less)
    expect(isPeterVerswyvelenPackerFormat(buf)).toBe(false);
  });

  it('rejects limit = 0', () => {
    const buf = new Uint8Array(makePVPBuffer());
    buf[254] = 0x00; buf[255] = 0x00;
    expect(isPeterVerswyvelenPackerFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isPeterVerswyvelenPackerFormat(new ArrayBuffer(100))).toBe(false);
  });
});

describe('parsePeterVerswyvelenPackerFile', () => {
  it('parses without throwing', () => {
    const song = parsePeterVerswyvelenPackerFile(makePVPBuffer(), 'PVP.testsong');
    expect(song).toBeDefined();
    expect(song.name).toContain('Peter Verswyvelen Packer');
  });
});
