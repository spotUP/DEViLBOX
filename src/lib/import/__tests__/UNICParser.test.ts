/**
 * UNICParser Tests — UNIC Tracker v1 format detection
 *
 * Detection: 'M.K.', 'UNIC', or null-magic at offset 1080, valid 31 sample headers
 * (starting at offset 20), total sample bytes >= 256, numOrders 1-127,
 * first pattern cell validation, >= 16 notes and at least one instrument.
 */
import { describe, it, expect } from 'vitest';
import { isUNICFormat } from '../formats/UNICParser';

describe('isUNICFormat', () => {
  it('rejects too-small buffer (needs header + first pattern)', () => {
    expect(isUNICFormat(new ArrayBuffer(1084))).toBe(false);
  });

  it('rejects zeroed buffer (fails magic check / no notes)', () => {
    // Null magic is valid but totalSampleBytes=0 < 256 fails
    expect(isUNICFormat(new ArrayBuffer(1084 + 768))).toBe(false);
  });

  it('rejects buffer with wrong magic (not M.K., UNIC, or null)', () => {
    const buf = new Uint8Array(1084 + 768 + 1000).fill(0);
    // Set magic at 1080 to 'M.K!' (invalid)
    buf[1080] = 0x4d; buf[1081] = 0x2e; buf[1082] = 0x4b; buf[1083] = 0x21;
    expect(isUNICFormat(buf.buffer)).toBe(false);
  });

  it('rejects when sample total bytes < 256', () => {
    // All sample headers zero -> total = 0 < 256
    const buf = new Uint8Array(1084 + 768 + 1000).fill(0);
    // 'M.K.' magic
    buf[1080] = 0x4d; buf[1081] = 0x2e; buf[1082] = 0x4b; buf[1083] = 0x2e;
    buf[950] = 1; // numOrders = 1
    expect(isUNICFormat(buf.buffer)).toBe(false);
  });
});
