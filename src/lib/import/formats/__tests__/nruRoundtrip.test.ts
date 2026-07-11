/**
 * Regression: NoiseRunner (.nru) pattern write-back rewrote most cells (~44% survived).
 *
 * Each 4-byte NRU cell packs d0 (effect bits with a many-to-one map that also drops its
 * low 2 bits), d1 (effect param remapped by convertModEffect), d2 (note, whose odd bit is
 * lost to the /2 decode) and d3 (instrument in the upper 5 bits). encodeNRUCell re-derived
 * all four bytes from that lossy XM view, so the exact source bytes could not be rebuilt.
 *
 * Fix: layout.decodeCell stashes the exact source bytes in the invisible period/pan/cutoff
 * carriers (fields the NRU grid loop never sets, so edited cells fall back to the canonical
 * derivation), and the encoder reproduces all 4 bytes verbatim.
 *
 * Fixture: public/data/songs/formats/howiedavies.nru (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseNRUFile } from '../NRUParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/howiedavies.nru');

describe('NRU pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseNRUFile(ab, 'howiedavies.nru');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;   // note-bearing cell (d2 > 0)
    let sawEffect = false; // cell carrying effect bits the lossy decode dropped
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[2] > 0) sawNote = true;
          if (orig[0] !== 0 || orig[1] !== 0) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note-bearing cell').toBe(true);
    expect(sawEffect, 'fixture exercises effect bits the lossy decode dropped').toBe(true);
  });
});
