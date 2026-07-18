import { describe, it, expect } from 'vitest';
import { parseSunTronicFile, readFixture } from './sunTestUtil';
import { reprojectSunGrid } from '../sunReproject';

/**
 * Reproject-identity gate: reprojecting the grid on an UNCHANGED pool must be a
 * no-op — every provenanced cell's displayed note must survive byte-identical.
 *
 * This catches the glide (0x94) / clamp-to-zero regression: a linear
 * `poolNote ± transpose` reproject model is lossy for cells whose pool note and
 * display note derive from different stream carriers. On shades.src there are 75
 * such glide cells — a linear reproject rewrites them to the wrong pitch (an
 * edit-round-trip ghost: the user sees note 94, saves nothing, and the grid
 * silently changes it to 41). The faithful re-decode-sunRaw-at-transpose model
 * leaves all of them untouched.
 *
 * Fails-on-revert: swap reprojectSunGrid back to the linear model and shades.src
 * reports 75 changed cells.
 */
const FILES = ['shades.src', 'analgestic2.src', 'ready'];

describe('SunTronic reproject identity on unchanged pool (glide-safe)', () => {
  for (const name of FILES) {
    it(`reprojecting ${name} on the unchanged pool changes no note`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const song: any = parseSunTronicFile(readFixture(name), name);
      const native = song.sunTronicNative;
      expect(native).toBeTruthy();

      // Snapshot every provenanced cell's displayed note BEFORE reprojection.
      const before: number[] = [];
      for (const pat of song.patterns) {
        for (const ch of pat.channels) {
          for (const cell of ch.rows) {
            if (cell.sunBlockIndex === undefined || cell.sunBlockIndex < 0) continue;
            before.push(cell.note);
          }
        }
      }

      // Reproject on the UNCHANGED pool — must be identity.
      reprojectSunGrid(song.patterns, native);

      let changed = 0;
      let i = 0;
      for (const pat of song.patterns) {
        for (const ch of pat.channels) {
          for (const cell of ch.rows) {
            if (cell.sunBlockIndex === undefined || cell.sunBlockIndex < 0) continue;
            if (cell.note !== before[i]) changed++;
            i++;
          }
        }
      }
      expect(changed).toBe(0);
    });
  }
});
