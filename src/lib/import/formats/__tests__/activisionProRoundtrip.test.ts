/**
 * Regression: Activision Pro (.avp) pattern write-back was lossy.
 *
 * Each 1-byte AVP cell packs bits 5..0 = note index (into AVP_PERIODS) and bits 7..6 =
 * instrument. decodeCell maps the index through avpNoteToXM, which clamps the XM note to
 * [1,96]; every note index below 24 collapses onto xm 1, and encodeActivisionProCell
 * reverses xm 1 back to index 24 — a lossy lower-clamp that rewrites the note byte
 * (e.g. 0x43 idx3 -> 0x58 idx24). 95/1176 cells in gettysburg.avp mangled on write-back.
 *
 * decodeCell now stashes the exact source note+instrument byte in the invisible `period`
 * carrier and encodeActivisionProCell reproduces it verbatim. The carrier is private to
 * the round-trip codec — the editor grid is built by decodeAvpTrack, which sets no period,
 * so an edited cell arrives carrier-less and keeps the canonical derivation.
 *
 * Fixture: public/data/songs/activision-pro/gettysburg.avp (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseActivisionProFile } from '../ActivisionProParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/activision-pro/gettysburg.avp');

describe('Activision Pro pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parseActivisionProFile(new Uint8Array(ab), 'gettysburg.avp');
    expect(song, 'parse succeeded').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawLowClamp = false; // note index below 24 that avpNoteToXM collapses onto xm 1
    for (let p = 0; p < song!.patterns.length; p++) {
      const pat = song!.patterns[p];
      for (let r = 0; r < pat.length; r++) {
        for (let c = 0; c < pat.channels.length; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          const idx = orig[0] & 0x3F;
          if (idx > 0 && idx < 24) sawLowClamp = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawLowClamp, 'fixture exercises a note index the [1,96] clamp collapses').toBe(true);
  });
});
