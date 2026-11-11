/**
 * Regression: Art Of Noise (.aon) pattern write-back rewrote most cells (~44% survived).
 *
 * Each 4-byte AON cell packs two extra bits in the top of b0 (unused), b1 and b2
 * (arpeggio hi/lo) that the XM view masks off with &0x3F, and the AON effect map is
 * one-way. encodeAONCell re-derived all four bytes from that lossy XM view (and used a
 * note offset that did not invert decodeCell), so the exact source bytes could not be
 * rebuilt.
 *
 * Fix: layout.decodeCell stashes the exact source bytes in the invisible period/pan/cutoff
 * carriers (fields the AON grid loop never sets, so edited cells fall back to the canonical
 * derivation), and the encoder reproduces all 4 bytes verbatim.
 *
 * Fixture: public/data/songs/art-of-noise/inside.blipp.aon (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseArtOfNoiseFile } from '../ArtOfNoiseParser';
import { AON_PERIODS } from '../aonNotes';
import { periodToNote } from '@/lib/amiga/periodNotes';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/art-of-noise/inside.blipp.aon');

describe('Art Of Noise pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    const song = parseArtOfNoiseFile(bytes, 'inside.blipp.aon');
    expect(song, 'parse succeeds').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;   // note-bearing cell (the old note-offset bug rewrote every one)
    let sawEffect = false; // cell carrying an effect the one-way map dropped
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > bytes.length) continue;
          const orig = bytes.subarray(off, off + layout.bytesPerCell);
          if ((orig[0] & 0x3F) > 0) sawNote = true;
          if ((orig[2] & 0x3F) !== 0 || orig[3] !== 0) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note-bearing cell').toBe(true);
    expect(sawEffect, 'fixture exercises an effect the lossy decode dropped').toBe(true);
  });

  it('Art of Noise notes show three octaves too high in the grid: file note n plays AON_PERIODS[0][n-1], grid note periodToNote of it', () => {
    const bytes = new Uint8Array(readFileSync(FIXTURE));
    const song = parseArtOfNoiseFile(bytes, 'inside.blipp.aon')!;
    const layout = song.uadePatternLayout!;
    let checked = 0;
    const octaves = new Map<number, number>();
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > bytes.length) continue;
          const orig = bytes.subarray(off, off + layout.bytesPerCell);
          const n = orig[0] & 0x3F;
          if (n < 1 || n > 60) continue;
          const cell = layout.decodeCell!(orig);
          // Measured: the replayer writes AON_PERIODS[0][n-1] (ArtOfNoiseWorker.cs DoNote).
          const measured = AON_PERIODS[0][n - 1];
          if (n >= 13) expect(cell.note, `file note ${n}`).toBe(periodToNote(measured));
          expect(cell.note).toBe(n - 12 > 0 ? n - 12 : n - 13);
          // An edited cell (no carriers) encodes back to the same note byte.
          const edited = layout.encodeCell({ ...cell, period: undefined, pan: undefined, cutoff: undefined });
          expect(edited[0] & 0x3F, `file note ${n} re-encoded`).toBe(n);
          const oct = Math.floor(((cell.note as number) - 1) / 12);
          octaves.set(oct, (octaves.get(oct) ?? 0) + 1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    console.log('AON grid octave histogram (0 = C-0):', JSON.stringify([...octaves.entries()].sort()));
  });
});
