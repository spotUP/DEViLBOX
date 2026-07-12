/**
 * Regression: Digital Mugician (.dmu) pattern write-back mangled note/sample/effect.
 *
 * Each 4-byte DM cell is [noteIdx, sample, effect, param]. The XM view is lossy: the note
 * index round-trips through a period-table nearest-match (and clamps at 96), the sample byte
 * drops its top 2 bits (&0x3F), and the effect byte maps many-to-one onto XM effTyp/eff (most
 * effect codes collapse to 0). encodeDigitalMugicianCell re-derived all four bytes from that
 * lossy view, so almost no cell round-tripped (ratchet 0.0052 match).
 *
 * Fix: DigitalMugicianParser.decodeCell stashes the exact 4 source bytes in the invisible
 * period/pan/cutoff carriers (fields the channelRows grid loop never sets, so edited cells
 * fall back to the canonical derivation), and encodeDigitalMugicianCell reproduces all 4
 * bytes verbatim.
 *
 * DM uses track indirection: each song pattern's channels reference sub-patterns in a flat
 * pool, so layout.getCellFileOffset (not the shared contiguous helper) maps cell -> file.
 *
 * Fixture: public/data/songs/digital-mugician/believe.dmu (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDigitalMugicianFile } from '../DigitalMugicianParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/digital-mugician/believe.dmu');

describe('Digital Mugician (DMU) pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseDigitalMugicianFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
      'believe.dmu',
    );
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;    // pitched note cell
    let sawEffect = false;  // cell carrying an effect the lossy map collapses
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] > 0) sawNote = true;
          if (orig[2] !== 64) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a pitched note cell').toBe(true);
    expect(sawEffect, 'fixture exercises an effect the lossy map collapses').toBe(true);
  });
});
