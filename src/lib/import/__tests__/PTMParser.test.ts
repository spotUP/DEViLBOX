/**
 * PTMParser Tests
 * Detection and parse tests for PolyTracker (.ptm) PC format.
 * No Reference Music files available — uses crafted magic-byte buffers.
 *
 * PTM detection requires:
 *   - "PTMF" magic at offset 44
 *   - dosEOF = 26 at offset 28
 *   - versionHi <= 2 at offset 30
 */

import { describe, it, expect } from 'vitest';
import { isPTMFormat } from '../formats/PTMParser';

// Minimum valid PTM detection buffer (608 bytes for HEADER_SIZE)
function makePTMBuffer(): ArrayBuffer {
  const buf = new ArrayBuffer(608);
  const v = new DataView(buf);
  // dosEOF = 26 at offset 28
  v.setUint8(28, 26);
  // versionLo = 3, versionHi = 0
  v.setUint8(29, 3);
  v.setUint8(30, 0);
  // "PTMF" at offset 44
  v.setUint8(44, 0x50); // P
  v.setUint8(45, 0x54); // T
  v.setUint8(46, 0x4D); // M
  v.setUint8(47, 0x46); // F
  // numChannels = 4 (offset 38, uint16LE), numOrders = 1 (offset 32)
  v.setUint16(32, 1, true);   // numOrders
  v.setUint16(34, 1, true);   // numSamples
  v.setUint16(36, 1, true);   // numPatterns
  v.setUint16(38, 4, true);   // numChannels
  v.setUint16(40, 0, true);   // flags must be 0
  return buf;
}

// ── Detection ─────────────────────────────────────────────────────────────────

describe('isPTMFormat', () => {
  it('detects crafted valid PTM buffer', () => {
    expect(isPTMFormat(makePTMBuffer())).toBe(true);
  });

  it('rejects all-zero buffer', () => {
    expect(isPTMFormat(new ArrayBuffer(608))).toBe(false);
  });

  it('rejects buffer shorter than 608 bytes', () => {
    expect(isPTMFormat(new ArrayBuffer(100))).toBe(false);
  });

  it('rejects buffer with wrong magic', () => {
    const buf = makePTMBuffer();
    const v = new DataView(buf);
    v.setUint8(44, 0x58); // 'X' instead of 'P'
    expect(isPTMFormat(buf)).toBe(false);
  });

  it('rejects buffer with wrong dosEOF', () => {
    const buf = makePTMBuffer();
    const v = new DataView(buf);
    v.setUint8(28, 0); // dosEOF must be 26
    expect(isPTMFormat(buf)).toBe(false);
  });
});
