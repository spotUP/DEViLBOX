/**
 * MagneticFieldsPackerParser Tests
 *
 * API:
 *   isMagneticFieldsPackerFormat(buffer: ArrayBuffer, filename?: string): boolean
 *
 * Detection: file > 400 bytes, buf[248] != 0, buf[249] == 0x7F,
 *            u16BE(buf,378) == u16BE(buf,380) <= 127 == buf[248].
 * Filename prefix "mfp." is required when filename is supplied.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isMagneticFieldsPackerFormat } from '../formats/MagneticFieldsPackerParser';

function makeMFPBuf(sampleCount = 5): ArrayBuffer {
  const buf = new Uint8Array(500);
  buf[248] = sampleCount;      // D1 = non-zero
  buf[249] = 0x7F;             // restart byte = 127

  // u16BE(buf, 378) = sampleCount
  buf[378] = 0; buf[379] = sampleCount;
  // u16BE(buf, 380) = sampleCount (must match)
  buf[380] = 0; buf[381] = sampleCount;

  return buf.buffer;
}

describe('isMagneticFieldsPackerFormat', () => {
  it('detects crafted MFP buffer without filename', () => {
    expect(isMagneticFieldsPackerFormat(makeMFPBuf())).toBe(true);
  });

  it('detects crafted MFP buffer with mfp. prefix', () => {
    expect(isMagneticFieldsPackerFormat(makeMFPBuf(), 'mfp.testsong')).toBe(true);
  });

  it('rejects when filename is supplied without mfp. prefix', () => {
    expect(isMagneticFieldsPackerFormat(makeMFPBuf(), 'other.song')).toBe(false);
  });

  it('rejects an all-zero buffer', () => {
    expect(isMagneticFieldsPackerFormat(new ArrayBuffer(500))).toBe(false);
  });

  it('rejects when buf[248] is zero', () => {
    const buf = new Uint8Array(makeMFPBuf());
    buf[248] = 0;
    expect(isMagneticFieldsPackerFormat(buf.buffer)).toBe(false);
  });

  it('rejects when buf[249] is not 0x7F', () => {
    const buf = new Uint8Array(makeMFPBuf());
    buf[249] = 0x00;
    expect(isMagneticFieldsPackerFormat(buf.buffer)).toBe(false);
  });

  it('rejects when u16BE(378) != u16BE(380)', () => {
    const buf = new Uint8Array(makeMFPBuf());
    buf[380] = 0; buf[381] = 10; // different from 378
    expect(isMagneticFieldsPackerFormat(buf.buffer)).toBe(false);
  });

  it('rejects when D2 (size at 378) > 127', () => {
    const buf = new Uint8Array(makeMFPBuf());
    buf[248] = 200;             // D1 = 200 (>127)
    buf[379] = 200; buf[381] = 200;
    expect(isMagneticFieldsPackerFormat(buf.buffer)).toBe(false);
  });
});
