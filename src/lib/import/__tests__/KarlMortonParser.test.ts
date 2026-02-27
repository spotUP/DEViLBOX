/**
 * KarlMortonParser Tests
 *
 * API:
 *   isKarlMortonFormat(bytes: Uint8Array): boolean
 *   parseKarlMortonFile(bytes: Uint8Array, filename: string): TrackerSong | null
 *
 * First chunk must be SONG (ID=0x474E4F53 LE).
 * chunk length must be >= 8 + 1100 bytes (SONG header).
 * File must be at least 8 + 1100 + 8 = 1116 bytes.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isKarlMortonFormat } from '../formats/KarlMortonParser';

function u32LE(buf: Uint8Array, off: number, val: number) {
  buf[off]   = val & 0xFF;
  buf[off+1] = (val >>> 8) & 0xFF;
  buf[off+2] = (val >>> 16) & 0xFF;
  buf[off+3] = (val >>> 24) & 0xFF;
}

const SONG_FIXED_SIZE = 32 + 31 * 34 + 2 + 4 + 4 + 4; // 1100
const MIN_SIZE = 8 + SONG_FIXED_SIZE + 8; // 1116

function makeKarlBuf(): Uint8Array {
  const buf = new Uint8Array(MIN_SIZE);
  // SONG chunk ID (little-endian 'SONG' = 0x474E4F53)
  u32LE(buf, 0, 0x474E4F53);
  // chunk length = 8 + SONG_FIXED_SIZE (payload = SONG_FIXED_SIZE)
  u32LE(buf, 4, 8 + SONG_FIXED_SIZE);
  // numChannels at songBase+1088 = 8+1088 = 1096; set to 1
  u32LE(buf, 8 + 1088, 1);
  // musicSize at songBase+1096 = 8+1096 = 1104; set to 0
  // length - songHdrSize = (8 + SONG_FIXED_SIZE) - (8 + SONG_FIXED_SIZE) = 0 = musicSize ✓
  u32LE(buf, 8 + 1096, 0);
  // song name: all zeros — isValidKMString32 sets nullFound=true at byte 0 ✓
  // all 31 sample refs: all zeros — same string check passes ✓
  return buf;
}

describe('isKarlMortonFormat', () => {
  it('detects a crafted SONG chunk buffer', () => {
    expect(isKarlMortonFormat(makeKarlBuf())).toBe(true);
  });

  it('rejects an all-zero buffer', () => {
    expect(isKarlMortonFormat(new Uint8Array(MIN_SIZE))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isKarlMortonFormat(new Uint8Array(16))).toBe(false);
  });

  it('rejects unknown chunk ID', () => {
    const buf = makeKarlBuf();
    u32LE(buf, 0, 0xDEADBEEF);
    expect(isKarlMortonFormat(buf)).toBe(false);
  });

  it('rejects when chunk length is too small', () => {
    const buf = makeKarlBuf();
    u32LE(buf, 4, 8); // too small (need >= 8 + SONG_FIXED_SIZE)
    expect(isKarlMortonFormat(buf)).toBe(false);
  });
});
