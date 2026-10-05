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

/**
 * Regression: the grid drew byte3 of each cell as the note, but byte3 is the BYTE offset into
 * the player's word Periods table (`MOVE.W $36(A0,D2.W),D1`, D2 = byte3), i.e. note * 2. Every
 * interval came out doubled and the grid showed a melody the player never plays.
 *
 * EXPECTED below is what UADE's Tomy Tracker eagleplayer writes to Paula: the note-trigger burst
 * (AUDxLCH, AUDxLCL, AUDxLEN, AUDxPER of one voice) read through periodToPtNote, captured once
 * with the Paula write log (tools/uade-audit/gridVsPaula.ts, strict reading). The capture starts
 * after the player's first row (UADE runs the first interrupt inside load), so the grid is read
 * from row 1 of the first position. Notes under tone portamento (commands 1 and 2) do not
 * retrigger and a pattern break (command 11) ends the pattern, as in the player.
 */
const EXPECTED: Record<string, number[][]> = {
  'public/data/songs/tomy-tracker/inconvenient intro.sg': [
    [32, 32, 39, 39, 39, 39, 39, 39, 39, 39, 32, 32, 32, 39, 39, 39, 39, 39, 39, 39, 39, 32, 32, 32, 39, 39, 39, 39, 39, 39, 39, 39],
    [22, 22, 22, 22, 25, 35, 34, 33, 32, 31, 30, 29, 28, 24, 21, 15, 24, 23, 22, 20, 17, 15, 13, 30, 30, 30, 42, 42, 30, 35, 35, 35],
    [18, 18, 18, 18, 18, 14, 26, 26, 26, 24, 14, 14, 26, 26, 26, 24, 24, 24, 14, 26, 26, 26, 24, 14, 14, 26, 26, 29, 26, 24, 19, 21],
    [18, 18, 18, 18, 18, 18, 18, 18, 18, 35, 37, 37, 33, 35, 38, 35, 33, 35, 35, 35, 37, 37, 35, 37, 37, 33, 35, 38, 35, 33, 35, 23],
  ],
  'public/data/songs/formats/irrepressible intro.sg': [
    [37, 37, 37, 37, 37, 37, 27, 22, 22, 22, 22, 22, 27, 27, 27, 27, 27, 20, 20, 20, 27, 27, 27, 27, 27, 22, 22, 22, 22, 22, 22, 22],
    [34, 34, 34, 32, 32, 34, 34, 34, 39, 39, 39, 41, 41, 41, 41, 41, 34, 34, 34, 32, 32, 34, 34, 34, 39, 39, 39, 39, 39, 39, 39, 39],
    [29, 38, 38, 38, 38, 38, 38, 38, 38, 38, 31, 31, 31, 31, 33, 33, 36, 33, 36, 33, 31, 33, 38, 38, 38, 38, 38, 38, 38, 38, 38, 38],
    [37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37],
  ],
};

describe('TomyTracker grid is the tune the player plays', () => {
  it('byte3 2 is C-1 (Periods[1] = 856) and encodes back to 2', () => {
    const cell = decodeTomyCell(new Uint8Array([0, 0, 7, 2]));
    expect(cell.note).toBe(13);
    expect([...encodeTomyCell(cell)]).toEqual([0, 0, 7, 2]);
  });

  for (const [file, expected] of Object.entries(EXPECTED)) {
    it(`first 32 notes per channel of ${file.split('/').pop()} match the Paula note-ons`, () => {
      const b = readFileSync(join(process.cwd(), file));
      const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      const song = parseTomyTrackerFile(ab, file.split('/').pop()!);
      const played: number[][] = [[], [], [], []];
      song.songPositions.forEach((p, pi) => {
        const pat = song.patterns[p];
        for (let row = pi === 0 ? 1 : 0; row < pat.length; row++) {
          let brk = false;
          for (let ch = 0; ch < 4; ch++) {
            const cell = pat.channels[ch].rows[row];
            if (cell.note > 0 && cell.effTyp !== 1 && cell.effTyp !== 2) played[ch].push(cell.note);
            if (cell.effTyp === 11) brk = true;
          }
          if (brk) break;
        }
      });
      expect(played.map((seq) => seq.slice(0, 32))).toEqual(expected);
    });
  }
});
