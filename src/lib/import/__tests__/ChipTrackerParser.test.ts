/**
 * ChipTrackerParser Tests
 *
 * API:
 *   isChipTrackerFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Magic: 'KRIS' (0x4B525349) at byte offset 952.
 * File size must be strictly > 2240 bytes.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isChipTrackerFormat } from '../formats/ChipTrackerParser';

function makeChipTrackerBuf(): Uint8Array {
  const buf = new Uint8Array(2300);
  buf[952] = 0x4B; // 'K'
  buf[953] = 0x52; // 'R'
  buf[954] = 0x49; // 'I'
  buf[955] = 0x53; // 'S'
  return buf;
}

describe('isChipTrackerFormat', () => {
  it('detects a crafted ChipTracker buffer', () => {
    expect(isChipTrackerFormat(makeChipTrackerBuf().buffer as ArrayBuffer)).toBe(true);
  });

  it('detects using Uint8Array input', () => {
    expect(isChipTrackerFormat(makeChipTrackerBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isChipTrackerFormat(new ArrayBuffer(2300))).toBe(false);
  });

  it('rejects a buffer of exactly 2240 bytes (must be strictly greater)', () => {
    const buf = new Uint8Array(2240);
    buf[952] = 0x4B; buf[953] = 0x52; buf[954] = 0x49; buf[955] = 0x53;
    expect(isChipTrackerFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });

  it('rejects when magic bytes are wrong', () => {
    const buf = makeChipTrackerBuf();
    buf[952] = 0x00;
    expect(isChipTrackerFormat(buf.buffer as ArrayBuffer)).toBe(false);
  });
});
