/**
 * CDFM67Parser Tests
 *
 * API:
 *   isCDFM67Format(bytes: Uint8Array): boolean
 *   parseCDFM67File(bytes: Uint8Array, filename: string): TrackerSong | null
 *
 * Detection is structural: speed byte 1-15, order entries < 128 or 0xFF,
 * sample unknown fields == 0, OPL2 register validation, at least one non-silent
 * instrument. File must be >= 2978 bytes. No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isCDFM67Format } from '../formats/CDFM67Parser';

describe('isCDFM67Format', () => {
  it('rejects an all-zero buffer (speed=0 is invalid)', () => {
    expect(isCDFM67Format(new Uint8Array(4096))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isCDFM67Format(new Uint8Array(100))).toBe(false);
  });

  it('rejects a buffer with invalid speed > 15', () => {
    const buf = new Uint8Array(4096);
    buf[0] = 16; // speed 16 is invalid (must be 1-15)
    expect(isCDFM67Format(buf)).toBe(false);
  });

  it('rejects a buffer with order entry out of range', () => {
    const buf = new Uint8Array(4096);
    buf[0] = 6; // valid speed
    buf[1698] = 200; // order entry >= 128 and != 0xFF
    expect(isCDFM67Format(buf)).toBe(false);
  });
});
