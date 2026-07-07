/**
 * Regression: DeltaMusic 1.0 write-back dropped every effect column.
 *
 * The layout's decodeCell remapped DM1 effect commands to a lossy, incomplete XM subset
 * (only 5 of DM1's commands; 0x06, 0x17, … had no XM equivalent and became effTyp=0),
 * while encodeCell wrote effTyp/eff straight into bytes[2]/[3]. So any cell carrying a DM1
 * effect re-encoded to `.. .. 00 00` and the effect was lost on chip-RAM write-back.
 *
 * decodeCell now stores the DM1 effect command + argument VERBATIM (native raw codes), the
 * exact inverse of encodeDeltaMusic1Cell, so the codec is byte-exact over real pattern data.
 *
 * Fixture: public/data/songs/delta-music/triplex1.dm (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDeltaMusic1File } from '../DeltaMusic1Parser';
import '@engine/uade/encoders/index';

const FIXTURE = join(process.cwd(), 'public/data/songs/delta-music/triplex1.dm');

function loadFixture(): Uint8Array {
  const b = readFileSync(FIXTURE);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

describe('DeltaMusic1 pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over the whole pattern region', async () => {
    const buf = loadFixture();
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const song = await parseDeltaMusic1File(ab, 'triplex1.dm');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.getCellFileOffset) throw new Error('layout incomplete');

    let checked = 0;
    let sawEffect = false;
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > buf.length) continue;
          const orig = buf.subarray(off, off + layout.bytesPerCell);
          const cell = layout.decodeCell(orig);
          if ((orig[2] ?? 0) !== 0 || (orig[3] ?? 0) !== 0) sawEffect = true;
          const re = layout.encodeCell(cell);
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    // The fixture must actually exercise the previously-broken effect path.
    expect(sawEffect, 'fixture has at least one cell with a DM1 effect').toBe(true);
  });
});
