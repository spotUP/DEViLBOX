/**
 * Regression: Graoumf Tracker 2 (.gt2) pattern write-back was lossy.
 *
 * Each 5-byte GT2 cell is [note, instr, effect, param, volume]. decodeCell renders
 * a narrow XM view that loses three lanes:
 *   - the effect+param bytes pass through a many-to-one translateEffect(), so
 *     unmapped and 12-bit effects collapse (e.g. [.,.,0xA8,5,.] -> XM 0x0F -> 0x0F,
 *     [.,.,0x11,1,.] -> dropped -> [0,0]);
 *   - the volume byte's per-pattern codingVersion (÷4 vs −0x10) is unknown to a
 *     single-cell decoder, so decode ÷4 + encode +0x10 mangles it (64 -> 16 -> 32).
 * Note/instrument (bytes 0-1) round-trip losslessly.
 *
 * decodeCell now stashes the exact raw effect/param/volume bytes in invisible
 * carriers (period/pan/cutoff) and encodeCell reproduces them verbatim. These
 * carriers are private to the round-trip codec — the grid is built by the parser's
 * own pattern loop (rawPatterns), so an edited grid cell arrives carrier-less and
 * keeps the lossy derivation.
 *
 * Fixture: public/data/songs/graoumf-tracker-2/living-on-video.gt2 (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGraoumfTracker2File } from '../GraoumfTracker2Parser';

const FIXTURE = join(process.cwd(), 'public/data/songs/graoumf-tracker-2/living-on-video.gt2');

describe('Graoumf Tracker 2 pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parseGraoumfTracker2File(new Uint8Array(ab), 'living-on-video.gt2');
    expect(song, 'parse succeeded').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawDroppedEffect = false; // effect byte that translateEffect collapses to 0
    let sawLossyVolume = false;   // volume byte where decode÷4 + encode+0x10 disagrees
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[4] > 0 && Math.min(Math.trunc(orig[4] / 4), 64) + 0x10 !== orig[4]) sawLossyVolume = true;
          if (orig[2] === 0x11 || orig[2] === 0xA8) sawDroppedEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawDroppedEffect, 'fixture exercises an effect byte translateEffect drops').toBe(true);
    expect(sawLossyVolume, 'fixture exercises a volume byte the ÷4/+0x10 path mangles').toBe(true);
  });
});
