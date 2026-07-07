/**
 * Regression: Tomy Tracker is now editable/exportable, not detection-only. The parser decodes
 * every pattern cell and the layout's encodeCell must be a byte-exact inverse over the real
 * pattern data — otherwise editing + export would corrupt the module.
 *
 * Fixture: public/data/songs/tomy-tracker/inconvenient intro.sg (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTomyTrackerFile, isTomyTrackerFormat } from '../TomyTrackerParser';
import { decodeTomyCell, encodeTomyCell, TOMY_BYTES_PER_CELL } from '@engine/uade/encoders/TomyTrackerEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/tomy-tracker/inconvenient intro.sg');
const PATTERN_BASE = 704;
const PATTERN_SIZE = 1024;

function loadFixture(): Uint8Array {
  const b = readFileSync(FIXTURE);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

describe('TomyTracker parse + codec', () => {
  it('detects the fixture as Tomy Tracker', () => {
    expect(isTomyTrackerFormat(loadFixture())).toBe(true);
  });

  it('decodes patterns (not empty) and a real order list', () => {
    const buf = loadFixture();
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const song = parseTomyTrackerFile(ab, 'SG.inconvenient intro');
    const patternCount = (buf[4]! << 24 | buf[5]! << 16 | buf[6]! << 8 | buf[7]!) >>> 0;
    const expectedPatterns = (patternCount - PATTERN_BASE) / PATTERN_SIZE;
    expect(song.patterns.length).toBe(expectedPatterns);
    expect(song.songPositions.length).toBeGreaterThan(1);
    // At least one cell in pattern 0 has a note (the fixture's first row is not silent).
    const anyNote = song.patterns[0].channels.some((c) => c.rows.some((r) => (r.note ?? 0) > 0));
    expect(anyNote).toBe(true);
  });

  it('encodeTomyCell is a byte-exact inverse of decodeTomyCell over the whole pattern region', () => {
    const buf = loadFixture();
    const d2 = (buf[4]! << 24 | buf[5]! << 16 | buf[6]! << 8 | buf[7]!) >>> 0;
    const end = Math.min(d2, buf.length); // pattern region ends at D2
    let checked = 0;
    for (let off = PATTERN_BASE; off + TOMY_BYTES_PER_CELL <= end; off += TOMY_BYTES_PER_CELL) {
      const orig = buf.subarray(off, off + TOMY_BYTES_PER_CELL);
      const re = encodeTomyCell(decodeTomyCell(orig));
      expect([...re], `cell @${off}`).toEqual([...orig]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
