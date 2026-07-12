/**
 * Regression: SidMon 1.0 (.sid1) pattern write-back mangled note/effect/speed.
 *
 * Each 5-byte SM1 cell is [note, sample, effect, effectParam, speed]. The XM view is heavily
 * lossy: the note round-trips through a period-table nearest-match, and the effect/effectParam
 * bytes have no XM mapping at all (decode drops them, encode wrote 0). encodeSidMon1Cell
 * re-derived all five bytes from that lossy view, so no cell round-tripped (ratchet 0.0 match).
 *
 * Fix: SidMon1Parser.decodeCell stashes the exact 5 source bytes in the invisible
 * period/pan/cutoff/resonance carriers (fields the grid loop never sets, so edited cells fall
 * back to the canonical derivation), and encodeSidMon1Cell reproduces all 5 bytes verbatim.
 *
 * SM1 uses track/pattern indirection, so layout.getCellFileOffset maps cell -> file.
 *
 * Fixture: public/data/songs/formats/anarchy.sid1 (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSidMon1File } from '../SidMon1Parser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/anarchy.sid1');

describe('SidMon 1.0 (SID1) pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseSidMon1File(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
      'anarchy.sid1',
    );
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;    // pitched note cell
    let sawEffect = false;  // cell carrying an effect/speed byte the XM view drops
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] > 0) sawNote = true;
          if (orig[2] !== 0 || orig[3] !== 0 || orig[4] !== 0) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a pitched note cell').toBe(true);
    expect(sawEffect, 'fixture exercises an effect/speed byte the XM view drops').toBe(true);
  });
});
