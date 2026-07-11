/**
 * Regression: ZoundMonitor (.sng) pattern write-back rewrote most cells (only ~48%
 * survived).
 *
 * Each 4-byte ZoundMonitor cell is a u32BE bitfield packing note, sample, a control nibble,
 * a context-dependent volAdd byte, an effect param, and DMA/reserved top bits. The parser's
 * decodeCell maps the control nibble to XM effects (many-to-one) and drops the volAdd and
 * reserved bits, and encodeZoundMonitorCell re-derived the word from that lossy XM view — so
 * the packed bits could not be reconstructed.
 *
 * Fix: layout.decodeCell stashes the exact source word in the invisible period/pan/cutoff
 * carriers (fields the ZM grid loop never sets, so edited cells fall back to the canonical
 * derivation), and the encoder reproduces all 4 bytes verbatim.
 *
 * Fixture: public/data/songs/zoundmonitor/sonjavanveen.sng (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseZoundMonitorFile } from '../ZoundMonitorParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/zoundmonitor/sonjavanveen.sng');

describe('ZoundMonitor pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseZoundMonitorFile(ab, 'sonjavanveen.sng');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;    // note-bearing cell
    let sawVolOrCtl = false; // cell carrying volAdd/control bits the lossy decode dropped
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (((orig[0] >> 0) & 0x3F) > 0) sawNote = true;
          if (orig[2] !== 0 || (orig[1] & 0x0F) !== 0) sawVolOrCtl = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note-bearing cell').toBe(true);
    expect(sawVolOrCtl, 'fixture exercises volAdd/control bits the lossy decode dropped').toBe(true);
  });
});
