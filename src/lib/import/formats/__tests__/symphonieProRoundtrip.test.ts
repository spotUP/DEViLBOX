/**
 * Regression: SymphoniePro (.symmod) SymEvent write-back was lossy.
 *
 * decodeCell renders each 4-byte SymEvent (command, note, param, inst) into a narrow
 * XM-style cell: volume = round(param * 0.64), the note byte on command events is
 * discarded, and param/inst are clamped. encodeCell could not reconstruct the exact
 * source bytes from that lossy view, so cells failed to round-trip:
 *   - KEYON: volume double-rounded (param 60 -> vol 38 -> param 59).
 *   - VOLSLIDE: the note byte (usually the -1/255 no-note sentinel, occasionally a real
 *     note riding the slide) and clamped param/inst were lost.
 * decodeCell now stashes the exact source note/param/inst bytes in invisible carriers
 * (pan/period/cutoff) and encodeCell reproduces them verbatim. These carriers are
 * private to the round-trip/chip-RAM codec — the editor grid is built by _convertEvent
 * and native export by SymphonieProExporter, neither of which reads them.
 *
 * Fixture: public/data/songs/symphonie/pas 2 jade.symmod (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSymphonieProFile } from '../SymphonieProParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/symphonie/pas 2 jade.symmod');

describe('SymphoniePro pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every SymEvent', async () => {
    const b = readFileSync(FIXTURE);
    const raw = new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const song = await parseSymphonieProFile(new Uint8Array(raw), 'pas 2 jade.symmod');
    expect(song, 'parser returned a song').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawLossyVolume = false;  // KEYON param whose round(param*0.64) has no clean inverse
    let sawDroppedNote = false;  // command event carrying a note byte the XM view discards
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          const cmd = orig[0];
          const noteByte = orig[1];
          const param = orig[2];
          if (cmd === 0 && param > 0 && param <= 100) {
            const vol = Math.min(Math.round(param * 0.64), 64);
            if (Math.round(vol / 0.64) !== param) sawLossyVolume = true;
          }
          if (cmd !== 0 && noteByte !== 0) sawDroppedNote = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `SymEvent p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawLossyVolume, 'fixture exercises a double-rounded KEYON volume').toBe(true);
    expect(sawDroppedNote, 'fixture exercises a command event with a non-zero note byte').toBe(true);
  });
});
