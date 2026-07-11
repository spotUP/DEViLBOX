/**
 * Regression: UNIC Tracker (.unic) pattern write-back rewrote every note byte.
 *
 * Each 3-byte UNIC cell is [ instrHi|noteIdx, instrLo|cmd, param ]. The parser decodes
 * the note as `xmNote = noteIdx + UNIC_NOTE_OFFSET` (12), but encodeUNICCell reversed it
 * with `noteIdx = xmNote - 36` — a 24-semitone offset mismatch that rewrote the note byte
 * of every note-bearing cell (only ~65% of cells survived write-back). The effect
 * (cmd = b1 & 0x0F, param = b2) and instrument round-trip losslessly.
 *
 * Fix is the clean inverse: encodeUNICCell now uses `noteIdx = xmNote - UNIC_NOTE_OFFSET`.
 *
 * Fixture: public/data/songs/formats/african dreams.unic (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseUNICFile } from '../UNICParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/african dreams.unic');

describe('UNIC Tracker pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseUNICFile(ab, 'african dreams.unic');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false; // note-bearing cell (the offset-mismatch lane)
    for (let p = 0; p < song.patterns.length; p++) {
      const pat = song.patterns[p];
      for (let r = 0; r < pat.length; r++) {
        for (let c = 0; c < pat.channels.length; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if ((orig[0] & 0x3F) > 0) sawNote = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note byte the offset mismatch rewrote').toBe(true);
  });
});
