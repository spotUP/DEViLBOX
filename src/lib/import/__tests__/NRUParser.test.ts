/**
 * NRUParser Tests — NoiseRunner (.nru) format detection
 *
 * Detection: 'M.K.' at 1080, order count 1-127 with all unused entries=0,
 * 31 sample headers with specific constraints, and pattern cell validation.
 * No reference music found for .nru; craft minimal valid buffers.
 */
import { describe, it, expect } from 'vitest';
import { isNRUFormat } from '../formats/NRUParser';

describe('isNRUFormat', () => {
  it('rejects too-small buffer', () => {
    expect(isNRUFormat(new ArrayBuffer(500))).toBe(false);
  });

  it('rejects zeroed 1084-byte buffer (no M.K. and no valid orders)', () => {
    expect(isNRUFormat(new ArrayBuffer(1084))).toBe(false);
  });

  it('rejects buffer with correct size but no M.K. at 1080', () => {
    const buf = new Uint8Array(2108).fill(0);
    // No M.K. magic — detection should fail
    expect(isNRUFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer with M.K. but zero numOrders', () => {
    const buf = new Uint8Array(2108).fill(0);
    // 'M.K.' at offset 1080
    buf[1080] = 0x4d; buf[1081] = 0x2e; buf[1082] = 0x4b; buf[1083] = 0x2e;
    // numOrders = 0 at offset 950 — invalid
    buf[950] = 0x00;
    expect(isNRUFormat(buf.buffer)).toBe(false);
  });

  it('rejects buffer with M.K. and numOrders > 127', () => {
    const buf = new Uint8Array(2108).fill(0);
    buf[1080] = 0x4d; buf[1081] = 0x2e; buf[1082] = 0x4b; buf[1083] = 0x2e;
    buf[950] = 0x80; // = 128 > 127
    expect(isNRUFormat(buf.buffer)).toBe(false);
  });
});
