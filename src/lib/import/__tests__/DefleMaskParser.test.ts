/**
 * DefleMaskParser Tests
 * Detection and parse tests for DefleMask module format (.dmf).
 * No Reference Music files available — uses crafted magic-byte buffers.
 */

import { describe, it, expect } from 'vitest';
import { DefleMaskParser } from '../formats/DefleMaskParser';

// DefleMask .dmf magic: ".DeFleMask." (first 11 chars, then version byte, padded to 16)
function makeDMFBuffer(version = 24): ArrayBuffer {
  const buf = new ArrayBuffer(256);
  const bytes = new Uint8Array(buf);
  // Magic: ".DeFleMask." = 46 44 65 46 6C 65 4D 61 73 6B 2E
  const magic = '.DeFleMask.';
  for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i);
  bytes[magic.length] = version; // version byte (e.g. 24)
  // Pad remaining magic bytes to 16
  for (let i = magic.length + 1; i < 16; i++) bytes[i] = 0;
  return buf;
}

// ── Detection (via parse throwing on invalid magic) ───────────────────────────

describe('DefleMaskParser', () => {
  it('accepts valid .dmf magic without throwing (version 24)', () => {
    const buf = makeDMFBuffer(24);
    // parse may throw on incomplete structure, but not on bad magic
    expect(() => {
      try { DefleMaskParser.parse(buf, 'dmf'); } catch (e) {
        // If it throws, must NOT be a magic error
        if (e instanceof Error) expect(e.message).not.toMatch(/Invalid DMF magic/i);
      }
    }).not.toThrow();
  });

  it('throws on invalid DMF magic (all zeros)', () => {
    const buf = new ArrayBuffer(256);
    expect(() => DefleMaskParser.parse(buf, 'dmf')).toThrow();
  });

  it('throws on invalid DMF magic (wrong signature)', () => {
    const buf = new ArrayBuffer(256);
    const bytes = new Uint8Array(buf);
    const wrong = 'WRONG_MAGIC!!!!';
    for (let i = 0; i < wrong.length; i++) bytes[i] = wrong.charCodeAt(i);
    expect(() => DefleMaskParser.parse(buf, 'dmf')).toThrow();
  });

  it('rejects buffer shorter than 16 bytes', () => {
    const buf = new ArrayBuffer(8);
    expect(() => DefleMaskParser.parse(buf, 'dmf')).toThrow();
  });
});
