/**
 * Regression: Ron Klaren (.rk) pattern write-back mangled every note cell.
 *
 * Each 2-byte RK note cell is [noteIdx, waitCount]. The XM view is doubly lossy: the note
 * is a clamped period-table lookup and the waitCount byte is dropped entirely, so
 * encodeRonKlarenCell (which re-derives noteIdx from the XM note and hardcodes waitCount=1)
 * reproduced almost no source cells (ratchet 0.0 match).
 *
 * Fix: RonKlarenParser.decodeCell stashes both source bytes in the invisible period carrier
 * (a field the grid loop never sets, so edited cells fall back to the canonical derivation),
 * and encodeRonKlarenCell reproduces both bytes verbatim.
 *
 * Fixture: public/data/songs/ron-klaren/astra 2.rk (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRonKlarenFile } from '../RonKlarenParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/ron-klaren/astra 2.rk');

describe('Ron Klaren (RK) pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every note cell', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseRonKlarenFile(raw, 'astra 2.rk');
    expect(song, 'parse succeeded').toBeTruthy();
    const layout = song!.uadePatternLayout;
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;
    let sawWait = false;
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] > 0) sawNote = true;
          if (orig[1] > 1) sawWait = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note cell').toBe(true);
    expect(sawWait, 'fixture exercises a waitCount the XM view drops').toBe(true);
  });
});
