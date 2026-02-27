/**
 * ActivisionProParser Tests
 *
 * API:
 *   isActivisionProFormat(buffer: ArrayBuffer | Uint8Array, filename?: string): boolean
 *
 * Detection is purely heuristic (M68k opcode scan). No static magic bytes.
 * The init function pattern 0x48E7FCFE is searched in the first ~4096 bytes.
 * No reference music files found for this format.
 */
import { describe, it, expect } from 'vitest';
import { isActivisionProFormat } from '../formats/ActivisionProParser';

describe('isActivisionProFormat', () => {
  it('rejects an all-zero buffer', () => {
    expect(isActivisionProFormat(new Uint8Array(8192))).toBe(false);
  });

  it('rejects a buffer that is too short', () => {
    expect(isActivisionProFormat(new Uint8Array(10))).toBe(false);
  });

  it('rejects a random non-matching buffer', () => {
    const buf = new Uint8Array(4096);
    for (let i = 0; i < buf.length; i++) buf[i] = (i * 137 + 43) & 0xFF;
    expect(isActivisionProFormat(buf)).toBe(false);
  });
});
