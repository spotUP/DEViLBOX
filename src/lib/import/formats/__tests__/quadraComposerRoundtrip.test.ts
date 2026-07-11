/**
 * Regression: Quadra Composer (.emod/.qc) pattern write-back rewrote most cells (~35%
 * survived).
 *
 * Each 4-byte QC cell is [instrument, note, effect(low nibble), param]. The XM view
 * double-rounds the vibrato depth and sample-offset params, masks b2's high nibble
 * (&0x0F), forces the empty-note byte to 0xFF (any >35 source value is lost), and
 * encodeQCCell's note derivation (xmNote-37) did not invert decodeCell's note decode
 * (note+13) — so the exact source bytes could not be rebuilt.
 *
 * Fix: layout.decodeCell stashes the exact source bytes in the invisible period/pan/cutoff
 * carriers (fields the QC grid loop never sets, so edited cells fall back to the canonical
 * derivation), and the encoder reproduces all 4 bytes verbatim.
 *
 * Fixture: public/data/songs/formats/synth_corn.emod (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseQuadraComposerFile } from '../QuadraComposerParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/synth_corn.emod');

describe('QuadraComposer pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseQuadraComposerFile(ab, 'synth_corn.emod');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;   // note-bearing cell (the note-offset bug rewrote every one)
    let sawEffect = false; // cell carrying an effect the lossy decode mangled
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[1] <= 35) sawNote = true;
          if ((orig[2] & 0x0F) !== 0 || orig[3] !== 0) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note-bearing cell').toBe(true);
    expect(sawEffect, 'fixture exercises an effect the lossy decode mangled').toBe(true);
  });
});
