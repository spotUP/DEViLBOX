/**
 * Images Music System notes play the period their index names. ProWizard's
 * IMS converter (NostalgicPlayer ImagesMusicSystemFormat.cs, extendedPeriods)
 * gives index 0 = 1712 up to 47 = 113. A parsed cell's note must play that
 * period in DEViLBOX (noteToPeriod), and export must write the same index back.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIMSFile } from '../IMSParser';
import { encodeIMSCell } from '@/engine/uade/encoders/IMSEncoder';
import { noteToPeriod } from '@/lib/amiga/periodNotes';

/** ProWizard extendedPeriods, the periods IMS note indices 0..47 play. */
const IMS_PERIODS = [
  1712, 1616, 1525, 1440, 1357, 1281, 1209, 1141, 1077, 1017, 961, 907,
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

const FIXTURE = join('public', 'data', 'songs', 'images-music-system', 'chip5.ims');
const HEADER_SIZE = 1084;
const BYTES_PER_PATTERN = 64 * 4 * 3;

describe('Images Music System note pitch', () => {
  it('chip5.ims: every note plays the period its stored index names and exports the same index', async () => {
    const raw = readFileSync(FIXTURE);
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const song = await parseIMSFile(buf, 'chip5.ims');
    let checked = 0;
    song.patterns.forEach((pat, p) => {
      for (let row = 0; row < 64; row++) {
        for (let ch = 0; ch < 4; ch++) {
          const at = HEADER_SIZE + p * BYTES_PER_PATTERN + (row * 4 + ch) * 3;
          const index = raw[at] & 0x3f;
          const cell = pat.channels[ch].rows[row];
          if (index === 63) {
            expect(cell.note).toBe(0);
            continue;
          }
          expect(noteToPeriod(cell.note), `pattern ${p} row ${row} ch ${ch}`).toBe(IMS_PERIODS[index]);
          expect(encodeIMSCell(cell)[0] & 0x3f).toBe(index);
          checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(100);
  });
});
