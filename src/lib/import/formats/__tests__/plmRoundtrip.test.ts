/**
 * Regression: Disorder Tracker 2 (.plm) pattern write-back mangled note/volume/effect.
 *
 * Each 5-byte PLM cell is [note, instrument, volume, cmd, param]. The XM view is lossy: the
 * volume column maps 0xFF -> 0 and clamps values >64, and transformEffect is a many-to-one
 * command map. encodePLMCell re-derived all five bytes from that lossy view, so almost no
 * cell round-tripped (ratchet 0.0 match).
 *
 * Fix: PLMParser.decodeCell stashes the exact 5 source bytes in the invisible
 * period/pan/cutoff/resonance carriers (fields the grid loop never sets, so edited cells
 * fall back to the canonical derivation), and encodePLMCell reproduces all 5 bytes verbatim.
 *
 * PLM lays patterns on a 2D canvas, so layout.getCellFileOffset (a pre-built offset map)
 * maps cell -> file rather than the shared contiguous helper.
 *
 * Fixture: public/data/songs/disorder-tracker-2/hyper geckoo.plm (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePLMFile } from '../PLMParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/disorder-tracker-2/hyper geckoo.plm');

describe('Disorder Tracker 2 (PLM) pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parsePLMFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
      'hyper geckoo.plm',
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
          if (orig[0] > 0 && orig[0] < 0x90) sawNote = true;
          if (orig[3] !== 0) sawEffect = true;
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
