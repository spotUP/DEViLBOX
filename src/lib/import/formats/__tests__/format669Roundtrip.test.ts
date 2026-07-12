/**
 * Regression: Composer 669 (.669) pattern write-back mangled note/instrument/volume/effect.
 *
 * Each 3-byte 669 cell is [noteInstr, instrVol, effParam]: it packs a 6-bit instrument split
 * across both bytes, a 4-bit volume the XM view round-trips through a /15 scale, and a many-to-one
 * effect map. encode669Cell re-derived all three bytes from that lossy XM view (and mis-split the
 * instrument bits), so almost no cell round-tripped (0.0026 match).
 *
 * Fix: layout.decodeCell stashes the exact 3 source bytes in the invisible period/pan carriers
 * (fields the buildPattern grid loop never sets, so edited cells fall back to the canonical
 * derivation), and encode669Cell reproduces all 3 bytes verbatim.
 *
 * Fixture: public/data/songs/composer-669/speed fighter.669 (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse669File } from '../Format669Parser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/composer-669/speed fighter.669');

describe('Composer 669 pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parse669File(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
      'speed fighter.669',
    );
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;    // note+instrument bearing cell
    let sawEffect = false;  // cell carrying an effect the lossy map collapses
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] < 0xFE) sawNote = true;
          if (orig[2] !== 0xFF) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note-bearing cell').toBe(true);
    expect(sawEffect, 'fixture exercises an effect the lossy map collapses').toBe(true);
  });
});
