/**
 * XTrackerParser Tests — X-Tracker DMF (Delusion Digital Music Format) detection
 *
 * Detection: bytes[0..3] = 'DDMF' (0x44, 0x44, 0x4D, 0x46), bytes[4] = version in 1-10.
 * Minimum file size: 66 bytes.
 *
 * Note: the .ult files in Reference Music/Ultra Tracker/ are Ultra Tracker format,
 * not X-Tracker DMF; they are handled separately by UADE.
 */
import { describe, it, expect } from 'vitest';
import { isXTrackerFormat, parseXTrackerFile } from '../formats/XTrackerParser';

function makeXTrackerBuffer(version = 8): Uint8Array {
  const buf = new Uint8Array(200).fill(0);
  // 'DDMF'
  buf[0] = 0x44; buf[1] = 0x44; buf[2] = 0x4d; buf[3] = 0x46;
  // version = 8 (valid: 1-10)
  buf[4] = version;
  // tracker name at 5 (8 bytes, ignored)
  // songname at 13 (30 bytes, ignored)
  // etc. — all zero is fine for detection
  return buf;
}

describe('isXTrackerFormat', () => {
  it('detects valid DMF buffer (version 8)', () => {
    expect(isXTrackerFormat(makeXTrackerBuffer(8))).toBe(true);
  });

  it('detects version 1', () => {
    expect(isXTrackerFormat(makeXTrackerBuffer(1))).toBe(true);
  });

  it('detects version 10', () => {
    expect(isXTrackerFormat(makeXTrackerBuffer(10))).toBe(true);
  });

  it('rejects version 0', () => {
    expect(isXTrackerFormat(makeXTrackerBuffer(0))).toBe(false);
  });

  it('rejects version 11', () => {
    expect(isXTrackerFormat(makeXTrackerBuffer(11))).toBe(false);
  });

  it('rejects wrong magic', () => {
    const buf = makeXTrackerBuffer(8);
    buf[0] = 0x00;
    expect(isXTrackerFormat(buf)).toBe(false);
  });

  it('rejects too-small buffer', () => {
    expect(isXTrackerFormat(new Uint8Array(40))).toBe(false);
  });

  it('rejects zeroed buffer', () => {
    expect(isXTrackerFormat(new Uint8Array(200))).toBe(false);
  });
});

describe('parseXTrackerFile', () => {
  it('returns null for buffer with no chunks (no SEQU/PATT/SMPI)', () => {
    // Valid header but no chunks -> returns null (no song data)
    const result = parseXTrackerFile(makeXTrackerBuffer(8), 'test.dmf');
    // Parser requires SEQU and PATT chunks; without them returns null
    expect(result).toBeNull();
  });
});
