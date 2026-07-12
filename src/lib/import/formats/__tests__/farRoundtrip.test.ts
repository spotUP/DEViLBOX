/**
 * Regression: Farandole Composer (.far) pattern write-back mangled volume/instrument/effect.
 *
 * Each 4-byte FAR cell is [note, instrument, volume, effByte]. The XM view is lossy: the
 * volume double-rounds through a /15 scale (1-16 <-> 0-64), the instrument is offset by 1,
 * and convertFAREffect is a many-to-one map (skipEffect drops the effect entirely, routing
 * it into the volume column). encodeFARCell re-derived all four bytes from that lossy view,
 * so few cells round-tripped (ratchet 0.1017 match).
 *
 * Fix: FARParser.decodeCell stashes the exact 4 source bytes in the invisible
 * period/pan/cutoff carriers (fields the grid loop never sets, so edited cells fall back to
 * the canonical derivation), and encodeFARCell reproduces all 4 bytes verbatim.
 *
 * Fixture: public/data/songs/farandole-composer/dark dreams.far (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFARFile } from '../FARParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/farandole-composer/dark dreams.far');

describe('Farandole Composer (FAR) pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseFARFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
      'dark dreams.far',
    );
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;   // pitched note cell
    let sawVolume = false; // cell carrying a volume the /15 scale double-rounds
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] >= 1 && orig[0] <= 72) sawNote = true;
          if (orig[2] >= 1 && orig[2] <= 16) sawVolume = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a pitched note cell').toBe(true);
    expect(sawVolume, 'fixture exercises a volume cell').toBe(true);
  });
});
