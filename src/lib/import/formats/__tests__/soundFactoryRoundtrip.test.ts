/**
 * Regression: Sound Factory (.psf) opcode-stream write-back mangled every cell.
 *
 * Each PSF note event is 3 bytes: [opcode, durationHi, durationLo]. The XM view is fully
 * lossy: the note is a clamped period-table lookup, pause opcodes (0x80+) flatten to an
 * empty cell, and the uint16 duration is dropped entirely, so encodeSoundFactoryCell
 * (re-deriving the opcode from the XM note and hardcoding duration=1) reproduced almost no
 * source cells (ratchet 0.0 match).
 *
 * Fix: SoundFactoryParser.decodeCell stashes all 3 source bytes in the invisible period/pan
 * carriers (fields the grid loop never sets, so edited cells fall back to the canonical
 * derivation), and encodeSoundFactoryCell reproduces all 3 bytes verbatim.
 *
 * Fixture: public/data/songs/soundfactory/im maien.psf (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSoundFactoryFile } from '../SoundFactoryParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/soundfactory/im maien.psf');

describe('Sound Factory (PSF) pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every event cell', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseSoundFactoryFile(raw, 'im maien.psf');
    expect(song, 'parse succeeded').toBeTruthy();
    const layout = song!.uadePatternLayout;
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;
    let sawPause = false;
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] < 0x80) sawNote = true;
          if (orig[0] >= 0x80) sawPause = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note cell').toBe(true);
    expect(sawPause, 'fixture exercises a pause cell').toBe(true);
  });
});
