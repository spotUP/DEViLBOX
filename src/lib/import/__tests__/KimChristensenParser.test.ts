/**
 * KimChristensenParser Tests
 *
 * API:
 *   isKimChristensenFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Detection is purely heuristic (M68k opcode scan).
 * Scans for sequence: 0x207C then 0x0680 then 0xE341 then 0x227C then 0x0680 then 0x0087.
 * File must be >= 1800 bytes.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isKimChristensenFormat } from '../formats/KimChristensenParser';

describe('isKimChristensenFormat', () => {
  it('rejects an all-zero buffer', () => {
    expect(isKimChristensenFormat(new ArrayBuffer(4096))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isKimChristensenFormat(new ArrayBuffer(100))).toBe(false);
  });

  it('rejects a random byte pattern that lacks the opcode sequence', () => {
    const buf = new Uint8Array(4096);
    // Fill with incrementing bytes - unlikely to match the opcode scan
    for (let i = 0; i < buf.length; i++) buf[i] = i & 0xFF;
    expect(isKimChristensenFormat(buf.buffer)).toBe(false);
  });
});
