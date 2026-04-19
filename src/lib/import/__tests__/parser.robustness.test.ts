/**
 * Robustness tests for the core PC-tracker parsers.
 *
 * These guard against the class of bugs that caused the 63 "format import"
 * fix commits in the last 3 months: format detection returning false
 * positives, parsers crashing on truncated files, memory reads past EOF, etc.
 *
 * We use the real committed MOD fixture as the "known-good" input, then
 * mutate it to produce malformed variants. CI-safe — no Reference Music/.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isMODFormat, parseMODFile } from '@/lib/import/formats/MODParser';
import { isS3MFormat } from '@/lib/import/formats/S3MParser';
import { isXMFormat } from '@/lib/import/formats/XMParser';

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../__tests__/fixtures',
);

function loadFixture(name: string): ArrayBuffer {
  const bytes = readFileSync(resolve(FIXTURES, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

const REAL_MOD = loadFixture('mortimer-twang-2118bytes.mod');

describe('format detection — positive path on the real MOD', () => {
  it('isMODFormat returns true', () => {
    expect(isMODFormat(REAL_MOD)).toBe(true);
  });
  it('isS3MFormat returns false for the MOD', () => {
    expect(isS3MFormat(new Uint8Array(REAL_MOD))).toBe(false);
  });
  it('isXMFormat returns false for the MOD', () => {
    expect(isXMFormat(REAL_MOD)).toBe(false);
  });
});

describe('format detection — negative paths', () => {
  it('all detectors reject an empty buffer', () => {
    const empty = new ArrayBuffer(0);
    expect(isMODFormat(empty)).toBe(false);
    expect(isS3MFormat(new Uint8Array(empty))).toBe(false);
    expect(isXMFormat(empty)).toBe(false);
  });

  it('all detectors reject a 64-byte zero buffer', () => {
    const small = new ArrayBuffer(64);
    expect(isMODFormat(small)).toBe(false);
    expect(isS3MFormat(new Uint8Array(small))).toBe(false);
    expect(isXMFormat(small)).toBe(false);
  });

  it('all detectors reject a 4 KB zero buffer (past most header offsets)', () => {
    const big = new ArrayBuffer(4096);
    expect(isMODFormat(big)).toBe(false);
    expect(isS3MFormat(new Uint8Array(big))).toBe(false);
    expect(isXMFormat(big)).toBe(false);
  });

  it('isMODFormat rejects a MOD with a corrupted format tag', () => {
    const corrupted = REAL_MOD.slice(0);
    const u8 = new Uint8Array(corrupted);
    // Format tag is at offset 1080-1083 — scrub it to garbage.
    u8[1080] = 0xff;
    u8[1081] = 0xff;
    u8[1082] = 0xff;
    u8[1083] = 0xff;
    expect(isMODFormat(corrupted)).toBe(false);
  });
});

describe('parseMODFile — malformed input tolerance', () => {
  it('parsing the real fixture succeeds', async () => {
    const song = await parseMODFile(REAL_MOD, 'probe.mod');
    expect(song).toBeTruthy();
    expect(song.patterns.length).toBeGreaterThan(0);
  });

  it('parsing a zero-filled buffer does not crash or hang', async () => {
    const nonsense = new ArrayBuffer(2048);
    const start = Date.now();
    try {
      await parseMODFile(nonsense, 'nonsense.mod');
    } catch {
      /* acceptable */
    }
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('parsing a truncated MOD header does not hang', async () => {
    const truncated = REAL_MOD.slice(0, 200); // well short of the 1084-byte header
    const start = Date.now();
    try {
      await parseMODFile(truncated, 'truncated.mod');
    } catch {
      /* acceptable */
    }
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('parsing an EOF-truncated MOD (header valid, pattern data cut) does not hang', async () => {
    // Keep the full 1084-byte header but cut off all pattern + sample data.
    const headerOnly = REAL_MOD.slice(0, 1090);
    const start = Date.now();
    try {
      await parseMODFile(headerOnly, 'no-data.mod');
    } catch {
      /* acceptable */
    }
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('parsing the full fixture twice in sequence succeeds (no global state corruption)', async () => {
    const a = await parseMODFile(REAL_MOD, 'run-a.mod');
    const b = await parseMODFile(REAL_MOD, 'run-b.mod');
    expect(a.patterns.length).toBe(b.patterns.length);
    expect(a.instruments.length).toBe(b.instruments.length);
  });
});
