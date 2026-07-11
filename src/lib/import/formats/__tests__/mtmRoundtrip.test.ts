/**
 * Regression: MultiTracker (.mtm) pattern write-back was lossy.
 *
 * Each 3-byte MTM cell is [ (rawNote<<2)|instrHi, (instrLo<<4)|cmd, param ]. decodeCell
 * loses two lanes:
 *   - the note byte: mtmNoteToXM adds 25 and clamps to 96, but encodeMTMCell reversed it
 *     with the XM note directly (min(96,note)<<2), so every note byte was rewritten;
 *   - the effect: mapMTMEffect is many-to-one (0x0A keeps a single volume-slide nibble,
 *     0x08 panning and several 0x0E sub-commands drop to nothing), so the cmd/param
 *     bytes could not be reproduced from the XM view.
 * Instrument (split across byte0 bits[1:0] + byte1 bits[7:4]) round-trips losslessly.
 *
 * decodeCell now stashes all three source bytes in the invisible period/pan/cutoff
 * carriers and encodeMTMCell reproduces them verbatim. The carriers are private to the
 * round-trip codec — the editor grid is built by the parser's own track loop (no
 * carriers), so an edited cell arrives carrier-less and keeps the canonical derivation.
 *
 * Fixture: public/data/songs/formats/anonymous in 4ce.mtm (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMTMFile } from '../MTMParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/anonymous in 4ce.mtm');

describe('MultiTracker pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseMTMFile(ab, 'anonymous in 4ce.mtm');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;      // note byte the +25/clamp path cannot reverse
    let sawVolSlide = false;  // 0x0A volume slide (mapMTMEffect nibble-filters it)
    for (let p = 0; p < song.patterns.length; p++) {
      const pat = song.patterns[p];
      for (let r = 0; r < pat.length; r++) {
        for (let c = 0; c < pat.channels.length; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if ((orig[0] >> 2) > 0) sawNote = true;
          if ((orig[1] & 0x0F) === 0x0A) sawVolSlide = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note byte the +25/clamp reverse mangles').toBe(true);
    expect(sawVolSlide, 'fixture exercises a 0x0A volume slide mapMTMEffect filters').toBe(true);
  });
});
