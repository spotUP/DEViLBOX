/**
 * Regression: InStereo! 2.0 (.is20) pattern write-back rewrote ~77% of cells.
 *
 * Each 4-byte IS20 cell is [note, instrument, flags|arp|effect, param]. byte2's top nibble
 * (disableSoundTranspose/disableNoteTranspose flags + arpeggio index) is dropped by &0x0F,
 * the IS20 effect map is many-to-one, and the note byte is clamped. encodeInStereo2Cell
 * re-derived all four bytes from that lossy XM view (forcing the transpose flags and
 * arpeggio to 0), so the exact source bytes could not be rebuilt.
 *
 * Fix: layout.decodeCell stashes the exact source bytes in the invisible period/pan/cutoff
 * carriers (fields the IS20 grid loop never sets, so edited cells fall back to the canonical
 * derivation), and the encoder reproduces all 4 bytes verbatim.
 *
 * Fixture: public/data/songs/instereo!-2.0/spaceflight.is20 (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseInStereo2File } from '../InStereo2Parser';

const FIXTURE = join(process.cwd(), 'public/data/songs/instereo!-2.0/spaceflight.is20');

describe('InStereo2 pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseInStereo2File(raw, 'spaceflight.is20');
    expect(song, 'parse succeeds').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;   // note-bearing cell
    let sawFlags = false;  // cell carrying byte2 top-nibble bits the lossy decode dropped
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] > 0 && orig[0] !== 0x7f) sawNote = true;
          if ((orig[2] & 0xF0) !== 0) sawFlags = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note-bearing cell').toBe(true);
    expect(sawFlags, 'fixture exercises byte2 top-nibble bits the lossy decode dropped').toBe(true);
  });
});
