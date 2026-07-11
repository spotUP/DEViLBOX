/**
 * Regression: Art Of Noise (.aon) pattern write-back rewrote most cells (~44% survived).
 *
 * Each 4-byte AON cell packs two extra bits in the top of b0 (unused), b1 and b2
 * (arpeggio hi/lo) that the XM view masks off with &0x3F, and the AON effect map is
 * one-way. encodeAONCell re-derived all four bytes from that lossy XM view (and used a
 * note offset that did not invert decodeCell), so the exact source bytes could not be
 * rebuilt.
 *
 * Fix: layout.decodeCell stashes the exact source bytes in the invisible period/pan/cutoff
 * carriers (fields the AON grid loop never sets, so edited cells fall back to the canonical
 * derivation), and the encoder reproduces all 4 bytes verbatim.
 *
 * Fixture: public/data/songs/art-of-noise/inside.blipp.aon (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseArtOfNoiseFile } from '../ArtOfNoiseParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/art-of-noise/inside.blipp.aon');

describe('Art Of Noise pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    const song = parseArtOfNoiseFile(bytes, 'inside.blipp.aon');
    expect(song, 'parse succeeds').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;   // note-bearing cell (the old note-offset bug rewrote every one)
    let sawEffect = false; // cell carrying an effect the one-way map dropped
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > bytes.length) continue;
          const orig = bytes.subarray(off, off + layout.bytesPerCell);
          if ((orig[0] & 0x3F) > 0) sawNote = true;
          if ((orig[2] & 0x3F) !== 0 || orig[3] !== 0) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note-bearing cell').toBe(true);
    expect(sawEffect, 'fixture exercises an effect the lossy decode dropped').toBe(true);
  });
});
