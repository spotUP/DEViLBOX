/**
 * UAXParser Tests — Unreal Audio Package (.uax) format detection
 *
 * Detection: magic 0xC1 0x83 0x2A 0x9E at offset 0, valid header with offsets>=36,
 * positive counts, and presence of 'sound' in the name table.
 */
import { describe, it, expect } from 'vitest';
import { isUAXFormat } from '../formats/UAXParser';

describe('isUAXFormat', () => {
  it('rejects too-small buffer', () => {
    expect(isUAXFormat(new Uint8Array(20))).toBe(false);
  });

  it('rejects zeroed 100-byte buffer (wrong magic)', () => {
    expect(isUAXFormat(new Uint8Array(100))).toBe(false);
  });

  it('rejects wrong magic bytes', () => {
    const buf = new Uint8Array(200).fill(0);
    buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46; // RIFF instead
    expect(isUAXFormat(buf)).toBe(false);
  });

  it('rejects valid magic but invalid header (nameOffset < 36)', () => {
    const buf = new Uint8Array(200).fill(0);
    buf[0] = 0xc1; buf[1] = 0x83; buf[2] = 0x2a; buf[3] = 0x9e;
    // nameOffset (u32le at 16) = 10 < 36 -> invalid
    buf[16] = 10; buf[17] = 0; buf[18] = 0; buf[19] = 0;
    expect(isUAXFormat(buf)).toBe(false);
  });

  it('rejects valid magic and header but no sound entry in name table', () => {
    // Build header with valid offsets but name table containing no 'sound' entry
    const buf = new Uint8Array(500).fill(0);
    buf[0] = 0xc1; buf[1] = 0x83; buf[2] = 0x2a; buf[3] = 0x9e;
    // packageVersion = 40 at offset 4 (little-endian)
    buf[4] = 40;
    // nameCount = 1 at offset 12
    buf[12] = 1;
    // nameOffset = 36 at offset 16
    buf[16] = 36;
    // exportCount = 1 at offset 20
    buf[20] = 1;
    // exportOffset = 200 at offset 24
    buf[24] = 200;
    // importCount = 1 at offset 28
    buf[28] = 1;
    // importOffset = 300 at offset 32
    buf[32] = 300;

    // Name table at offset 36: null-terminated string 'music' (not 'sound')
    const name = 'music';
    for (let i = 0; i < name.length; i++) buf[36 + i] = name.charCodeAt(i);
    buf[36 + name.length] = 0; // null terminator
    // flags uint32 after string
    // -> 'sound' not found -> returns false

    expect(isUAXFormat(buf)).toBe(false);
  });
});
