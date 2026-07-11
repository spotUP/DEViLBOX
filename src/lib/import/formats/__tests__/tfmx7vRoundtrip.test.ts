/**
 * Regression: Jochen Hippel TFMX-7V (.hip7) pattern write-back was lossy.
 *
 * Each 2-byte row is [noteByte, infoByte]. decodeCell renders a narrow XM view
 * (note = tfmxNote+1, instrument = infoByte & 0x1F) that discards the portamento
 * bit (noteByte bit7), the 0/1 note sentinels, and the info byte's high 3 bits;
 * encodeCell additionally zeroed the whole row whenever note <= 0, dropping the
 * info byte of note-0 rows. So cells failed to round-trip:
 *   - info high bits lost (e.g. [12, 64] -> [12, 0]).
 *   - note-0 rows carrying an instrument lost it (e.g. [0, 6] -> [0, 0]).
 * decodeCell now stashes the exact raw note/info bytes in invisible carriers
 * (period/pan) and encodeCell reproduces them verbatim. These carriers are private
 * to the round-trip codec — the grid is built by decodeTFMX7VPattern and tfmx7v has
 * no chip-RAM edit / native export path — so an edited cell arrives carrier-less.
 *
 * Fixture: public/data/songs/formats/ghostbattle_gameover.hip7 (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseJochenHippel7VFile } from '../JochenHippel7VParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/ghostbattle_gameover.hip7');

describe('TFMX-7V pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern row', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parseJochenHippel7VFile(ab, 'ghostbattle_gameover.hip7');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawHighInfo = false;   // info byte with bits above 0x1F — dropped by the XM view
    let sawNoteZeroInfo = false; // note-0 row carrying an info byte — zeroed by the encoder
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if ((orig[1] & 0xE0) !== 0) sawHighInfo = true;
          if ((orig[0] & 0x7F) === 0 && orig[1] !== 0) sawNoteZeroInfo = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `row p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawHighInfo, 'fixture exercises an info byte with high bits set').toBe(true);
    expect(sawNoteZeroInfo, 'fixture exercises a note-0 row carrying an info byte').toBe(true);
  });
});
