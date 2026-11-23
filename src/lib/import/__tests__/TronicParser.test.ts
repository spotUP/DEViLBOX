/**
 * TronicParser Tests - Tronic detection follows nuade tronic_module_parse (sequences, instrument table, pattern block).
 * The grid, export and edits are covered by tronicEditable.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { isTronicFormat, parseTronicFile } from '../formats/TronicParser';

describe('isTronicFormat', () => {
  it('rejects an empty buffer', () => {
    expect(isTronicFormat(new ArrayBuffer(0))).toBe(false);
  });

  it('rejects a buffer with no valid sequences', () => {
    expect(isTronicFormat(new ArrayBuffer(100))).toBe(false);
  });
});

describe('parseTronicFile', () => {
  it('throws on a non-Tronic buffer', async () => {
    await expect(parseTronicFile(new ArrayBuffer(100), 'test.trc')).rejects.toThrow();
  });
});
