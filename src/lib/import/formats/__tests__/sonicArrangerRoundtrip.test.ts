/**
 * Regression: Sonic Arranger (.sa) pattern write-back mangled note bytes and dropped
 * flags/effect-arg on round-trip (only ~65% of cells survived).
 *
 * Each 4-byte SA cell is [ note, instrument, flags|arp|effect, effectArg ]. The parser
 * decodes the note as `xmNote = saNote - 36`, but encodeSonicArrangerCell reversed it with
 * `saNote = xmNote + 12` — a 24-semitone offset mismatch that rewrote every note-bearing
 * byte. Byte2's disableST/disableNT flag bits (6-7) and the 0x80-release vs 0x7F-force-quiet
 * distinction were also lost, and the effect-arg byte3 was never reproduced by decodeCell.
 *
 * Fix: encoder note inverse is now `saNote = xmNote + 36`; layout.decodeCell stashes the
 * exact source note byte and flags byte in the invisible cutoff/pan carriers (fields the SA
 * grid loop never sets, so edited cells fall back to the canonical derivation) and carries
 * the effect-arg byte via saEffectArg, which the encoder already emits as byte3.
 *
 * Fixture: public/data/songs/formats/almighty.sa (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSonicArrangerFile } from '../SonicArrangerParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/almighty.sa');

describe('Sonic Arranger pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = await parseSonicArrangerFile(ab, 'almighty.sa');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;    // note-bearing cell (the offset-mismatch lane)
    let sawArg = false;     // byte3 effect-arg (lane the lossy decodeCell never reproduced)
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] > 0 && orig[0] !== 0x7F && orig[0] !== 0x80) sawNote = true;
          if (orig[3] > 0) sawArg = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a note byte the offset mismatch rewrote').toBe(true);
    expect(sawArg, 'fixture exercises an effect-arg byte the lossy decode dropped').toBe(true);
  });
});
