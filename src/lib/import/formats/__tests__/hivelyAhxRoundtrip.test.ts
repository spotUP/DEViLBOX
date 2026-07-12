/**
 * Regression: AHX (Abyss' Highest eXperience) pattern write-back rewrote most cells.
 *
 * The AHX layout carried no decodeCell, so the round-trip encoded the flattened grid cell —
 * which folds per-position transpose into the note (`xmNote = step.note + transpose`) and maps
 * the HVL effect to XM many-to-one via mapHvlEffect. Neither is invertible from the XM view, so
 * encodeAHXCell could not rebuild the exact 3 source bytes of each track step.
 *
 * Fix: the AHX layout now has a decodeCell that is the byte-exact inverse of encodeAHXCell — it
 * reads the raw 3 bytes and stashes them in the invisible period/pan carriers (fields the AHX
 * grid loop never sets, so edited cells fall back to the canonical derivation), and the encoder
 * reproduces all 3 bytes verbatim.
 *
 * Fixture: public/data/songs/ahx/amanda.ahx (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHivelyFile } from '../HivelyParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/ahx/amanda.ahx');

describe('AHX pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseHivelyFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'amanda.ahx');
    expect(song, 'parse succeeds').toBeTruthy();
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;    // note-bearing step
    let sawEffect = false;  // step carrying an HVL effect the lossy grid map collapses
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if ((orig[0] >> 2) !== 0) sawNote = true;
          if ((orig[1] & 0x0f) !== 0 || orig[2] !== 0) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note-bearing step').toBe(true);
    expect(sawEffect, 'fixture exercises an HVL effect the lossy grid map collapses').toBe(true);
  });
});
