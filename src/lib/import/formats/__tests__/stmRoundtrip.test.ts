/**
 * Regression: ScreamTracker 2 (.stm) pattern write-back mangled note/instrument/volume/effect.
 *
 * Each 4-byte STM cell is [noteByte, insVol, volCmd, cmdInf]. The XM view collapses several
 * distinct source bytes: the note sentinels 0xFB/0xFC (empty/continue) and 0xFD/0xFE (both
 * note-cut) fold together, instruments >31 clamp to 0, volumes >64 clamp to 0, and the STM
 * effect map is many-to-one (encode packs the set-speed param into the high nibble, dropping
 * the low). encodeSTMCell re-derived all four bytes from that lossy view, so almost no cell
 * round-tripped (ratchet 0.0017 match).
 *
 * Fix: STMParser.decodeCell stashes the exact 4 source bytes in the invisible period/pan/cutoff
 * carriers (fields the parser's channelRows grid loop never sets, so edited cells fall back to
 * the canonical derivation), and encodeSTMCell reproduces all 4 bytes verbatim.
 *
 * Fixture: public/data/songs/formats/slideshow i.stm (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSTMFile } from '../STMParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/slideshow i.stm');

describe('ScreamTracker 2 (STM) pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseSTMFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
      'slideshow i.stm',
    );
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;    // pitched note cell
    let sawEffect = false;  // cell carrying an effect the lossy map collapses
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] < 0x60) sawNote = true;
          if ((orig[2] & 0x0F) !== 0) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a pitched note cell').toBe(true);
    expect(sawEffect, 'fixture exercises an effect the lossy map collapses').toBe(true);
  });
});
