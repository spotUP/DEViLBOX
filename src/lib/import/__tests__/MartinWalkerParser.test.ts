/**
 * MartinWalkerParser Tests
 *
 * API:
 *   isMartinWalkerFormat(buffer: ArrayBuffer | Uint8Array): boolean
 *
 * Detection is heuristic (M68k opcode scan). Five format variants are recognized.
 * Format 1: file starts with 0x48E7FCFE (MOVEM.L), no 0x45FA at offset 220.
 * Minimum file size: 300 bytes.
 * No reference music files found.
 */
import { describe, it, expect } from 'vitest';
import { isMartinWalkerFormat } from '../formats/MartinWalkerParser';

describe('isMartinWalkerFormat', () => {
  it('rejects an all-zero buffer', () => {
    expect(isMartinWalkerFormat(new ArrayBuffer(2000))).toBe(false);
  });

  it('rejects a too-short buffer', () => {
    expect(isMartinWalkerFormat(new ArrayBuffer(10))).toBe(false);
  });

  it('rejects a random non-matching buffer', () => {
    const buf = new Uint8Array(2000);
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 137 + 43) & 0xFF;
    expect(isMartinWalkerFormat(buf.buffer)).toBe(false);
  });
});
