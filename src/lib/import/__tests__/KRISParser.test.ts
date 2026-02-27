/**
 * KRISParser Tests
 *
 * API:
 *   isKRISFormat(buffer: ArrayBuffer): boolean
 *   parseKRISFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong>
 *
 * Magic: "KRIS" (0x4B524953) at offset 952. Buffer must be >= 960 bytes.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isKRISFormat } from '../formats/KRISParser';

function makeKRISBuf(): ArrayBuffer {
  const buf = new Uint8Array(1200);
  buf[952] = 0x4B; // 'K'
  buf[953] = 0x52; // 'R'
  buf[954] = 0x49; // 'I'
  buf[955] = 0x53; // 'S'
  return buf.buffer;
}

describe('isKRISFormat', () => {
  it('detects a crafted KRIS buffer', () => {
    expect(isKRISFormat(makeKRISBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isKRISFormat(new ArrayBuffer(1200))).toBe(false);
  });

  it('rejects a too-short buffer (< 960 bytes)', () => {
    expect(isKRISFormat(new ArrayBuffer(100))).toBe(false);
  });

  it('rejects when magic bytes are wrong', () => {
    const buf = new Uint8Array(makeKRISBuf());
    buf[952] = 0x00;
    expect(isKRISFormat(buf.buffer)).toBe(false);
  });

  it('rejects exactly 960-byte buffer with wrong magic', () => {
    expect(isKRISFormat(new ArrayBuffer(960))).toBe(false);
  });
});
