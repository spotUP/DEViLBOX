/**
 * Regression: Sound Control (.sc) pattern write-back mangled note/volume/unused bytes.
 *
 * Each editable Sound Control note event is 4 bytes [noteByte, instrument, unused, volume].
 * The XM view is lossy: the note maps through a nearest-match period table, the volume masks
 * its top bit (&0x7F), and the unused byte is dropped. The encoder re-derived all four bytes
 * from that lossy view, so no cell round-tripped (ratchet 0.0 match).
 *
 * Fix: SoundControlParser.decodeCell stashes the exact 4 source bytes in the invisible
 * period/pan/cutoff carriers (fields the parser's grid loop never sets, so edited cells fall
 * back to the canonical derivation), and both encoders (SC 3.x + SC 4.0+) reproduce all 4
 * bytes verbatim.
 *
 * Sound Control uses variable-length track events with track indirection, so
 * layout.getCellFileOffset maps cell -> file and returns -1 for non-editable wait rows.
 *
 * Fixture: public/data/songs/soundcontrol/north sea inferno ongame1.sc (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSoundControlFile } from '../SoundControlParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/soundcontrol/north sea inferno ongame1.sc');

describe('Sound Control (SC) pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every editable note cell', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseSoundControlFile(raw, 'north sea inferno ongame1.sc');
    expect(song, 'parse succeeded').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;   // pitched note cell
    let sawVolume = false; // cell carrying a volume whose top bit the XM view masks
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off === 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] > 0) sawNote = true;
          if (orig[3] > 0) sawVolume = true;
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
