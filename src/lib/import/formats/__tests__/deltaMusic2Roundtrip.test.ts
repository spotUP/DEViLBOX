/**
 * Regression: DeltaMusic 2.0 write-back mangled effect cells.
 *
 * The layout's decodeCell remapped DM2 effect commands to a lossy XM subset — arpeggio
 * (0x08) with argument 0 was dropped entirely (`if (dm2Arg !== 0)`), and volume/global-
 * volume used double-rounding (÷63×64 then ÷64×63) — while encodeCell wrote the mapped
 * effTyp/eff straight back. So `08 00` ("select arpeggio table 0", a real command in the
 * deltamusic2-wasm replayer) re-encoded to `.. .. 00 00` and the effect was lost on
 * chip-RAM write-back.
 *
 * decodeCell now stores the DM2 effect command + argument VERBATIM (native raw codes), the
 * exact inverse of encodeDeltaMusic2Cell — the DeltaMusic1 / Tomy Tracker model — so the
 * codec is byte-exact over real pattern data.
 *
 * Fixture: public/data/songs/delta-music-2/asperity megademo 3.dm2 (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDeltaMusic2File } from '../DeltaMusic2Parser';
import '@engine/uade/encoders/index';

const FIXTURE = join(process.cwd(), 'public/data/songs/delta-music-2/asperity megademo 3.dm2');

function loadFixture(): Uint8Array {
  const b = readFileSync(FIXTURE);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

describe('DeltaMusic2 pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over the whole pattern region', async () => {
    const buf = loadFixture();
    const song = await parseDeltaMusic2File(buf, 'asperity megademo 3.dm2');
    expect(song, 'parser returned a song').toBeTruthy();
    if (!song) throw new Error('parse failed');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.getCellFileOffset) throw new Error('layout incomplete');

    let checked = 0;
    let sawArpZero = false; // the previously-dropped `08 00` case
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > buf.length) continue;
          const orig = buf.subarray(off, off + layout.bytesPerCell);
          if ((orig[2] ?? 0) === 0x08 && (orig[3] ?? 0) === 0x00) sawArpZero = true;
          const cell = layout.decodeCell(orig);
          const re = layout.encodeCell(cell);
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    // The fixture must actually exercise the previously-broken arpeggio-table-0 path.
    expect(sawArpZero, 'fixture has at least one `08 00` (select arpeggio table 0) cell').toBe(true);
  });
});
