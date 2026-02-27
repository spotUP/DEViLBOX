/**
 * TronicParser Tests — Tronic format detection
 *
 * No public format spec or magic bytes. Detection returns true for any
 * non-empty file. Routing layer filters by extension (.trc, .dp, .tro).
 * parseTronicFile always throws (playback delegated to UADE).
 */
import { describe, it, expect } from 'vitest';
import { isTronicFormat, parseTronicFile } from '../formats/TronicParser';

describe('isTronicFormat', () => {
  it('returns true for any non-empty buffer', () => {
    const buf = new ArrayBuffer(100);
    expect(isTronicFormat(buf)).toBe(true);
  });

  it('returns false for empty buffer', () => {
    expect(isTronicFormat(new ArrayBuffer(0))).toBe(false);
  });

  it('returns true for single-byte buffer', () => {
    expect(isTronicFormat(new ArrayBuffer(1))).toBe(true);
  });
});

describe('parseTronicFile', () => {
  it('throws to indicate UADE delegation', async () => {
    await expect(parseTronicFile(new ArrayBuffer(100), 'test.trc')).rejects.toThrow();
  });
});
