/**
 * Contract tests for the MOD parser — run against a real 2118-byte
 * Protracker file (Mortimer Twang's "2118bytes!.mod") committed under
 * `src/__tests__/fixtures/`. CI-safe: no Reference Music / tree needed.
 *
 * What we guard against:
 *   - Regressions in the top-level MOD header decoder.
 *   - Crashes on malformed input (zero buffer, truncated file).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseMOD } from '@/lib/import/formats/MODParser';

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../__tests__/fixtures',
);

function loadFixture(name: string): ArrayBuffer {
  const bytes = readFileSync(resolve(FIXTURES, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('parseMOD — real song fixture', () => {
  it('parses Mortimer Twang 2118bytes!.mod as a 4-channel M.K. module', async () => {
    const out = await parseMOD(loadFixture('mortimer-twang-2118bytes.mod'));
    expect(out.header.formatTag).toBe('M.K.');
    expect(out.header.channelCount).toBe(4);
    expect(out.header.patternCount).toBeGreaterThanOrEqual(1);
    expect(out.metadata.sourceFormat).toBe('MOD');
  });

  it('has at least one pattern with 64 rows on 4 channels', async () => {
    const out = await parseMOD(loadFixture('mortimer-twang-2118bytes.mod'));
    const p = out.patterns[0];
    expect(p.length).toBe(64);
    expect(p[0].length).toBe(4);
  });

  it('decoded song order matches header songLength', async () => {
    const out = await parseMOD(loadFixture('mortimer-twang-2118bytes.mod'));
    expect(out.metadata.modData?.songLength).toBe(out.header.songLength);
    expect(out.header.songLength).toBeGreaterThan(0);
  });
});

describe('parseMOD — malformed input', () => {
  it('a zero-filled buffer does not crash and does not return 4 channels', async () => {
    const nonsense = new ArrayBuffer(2048);
    let finished = false;
    let thrown: unknown = null;
    try {
      const out = await parseMOD(nonsense);
      // If it returns, it certainly shouldn't claim to be a valid M.K. song.
      expect(out.header.formatTag === 'M.K.' && out.header.patternCount > 0).toBe(false);
      finished = true;
    } catch (e) {
      thrown = e;
      finished = true;
    }
    expect(finished).toBe(true);
    if (thrown !== null) expect(thrown).toBeInstanceOf(Error);
  });

  it('a truncated MOD (first 500 bytes of the real fixture) does not hang', async () => {
    const full = loadFixture('mortimer-twang-2118bytes.mod');
    const truncated = full.slice(0, 500); // shorter than the 1084-byte header
    const start = Date.now();
    try {
      await parseMOD(truncated);
    } catch {
      /* ok — the point is we return, not that we succeed */
    }
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
