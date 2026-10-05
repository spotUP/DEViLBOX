/**
 * Regression: Fashion Tracker (EX.*) pattern write-back rewrote every note's pitch.
 *
 * Fashion Tracker stores each cell in standard ProTracker MOD packing, but with raw Amiga
 * periods whose range is wider than the ProTracker period table. The shared decodeMODCell picks
 * the nearest table period and encodeMODCell re-derives the period from that note, so any
 * off-table period was rewritten on write-back (0.2249 match — only the sample/effect/param
 * bytes round-tripped; both period bytes were lossy).
 *
 * Fix: a Fashion-Tracker-specific layout codec carries the exact source period in cell.period (a
 * field the grid loop never sets, so edited cells fall back to the canonical note→period) and the
 * encoder writes the raw period nibbles back verbatim when they still match the note.
 *
 * Fixture: public/data/songs/fashion-tracker/ivory tover ii.ex (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFashionTrackerFile } from '../FashionTrackerParser';
import { encodeMODCell } from '@/engine/uade/encoders/MODEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/fashion-tracker/ivory tover ii.ex');

describe('Fashion Tracker pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseFashionTrackerFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
      'ivory tover ii.ex',
    );
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;         // note-bearing cell
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          const period = ((orig[0] & 0x0f) << 8) | orig[1];
          if (period > 0) sawNote = true;
          const decoded = layout.decodeCell(orig);
          const re = layout.encodeCell(decoded);
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note-bearing cell').toBe(true);
  });

  it('writes an off-table raw period back verbatim (the fixture holds only on-table periods)', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const layout = parseFashionTrackerFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
      'ivory tover ii.ex',
    ).uadePatternLayout!;
    // Period 0x0171 is not a ProTracker table value; the shared codec would snap it.
    const orig = Uint8Array.of(0x01, 0x71, 0x12, 0x34);
    const decoded = layout.decodeCell!(orig);
    expect([...layout.encodeCell!(decoded)]).toEqual([...orig]);
    expect([...encodeMODCell({ ...decoded, period: undefined })]).not.toEqual([...orig]);
  });
});
