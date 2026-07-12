/**
 * Regression: Digital Sonix & Chrome (.dsc) exposed a STUB pattern layout — a 64-row
 * empty grid decoded with the generic MOD codec over raw bytes at file offset 0 (module
 * header), so pattern write-back matched only ~8% of cells and never touched the real song.
 *
 * A DSC module is fully linear (header, instrument entries, a 4-byte-per-entry sequence
 * table, sample info, PCM); the sequence table at seqTableOff is the module's only on-disk
 * song data (seqTableOff + seqCount*4 === sampleInfoOff). Its entries are a packed
 * position/trigger stream, not a clean note/effect cell, so the faithful byte-exact inverse
 * is a whole-entry carrier: decodeCell stashes the four source bytes in the invisible
 * period/pan/cutoff carriers and encodeDscCell reproduces them verbatim.
 *
 * On revert (stub layout at offset 0 / no carriers) the encoder rewrites the sequence bytes,
 * so the non-0xFF trigger cells no longer round-trip and this fails.
 *
 * Fixture: public/data/songs/digital-sonix-and-chrome/dragon'sbreath ingame 1.dsc (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDscFile } from '../DigitalSonixChromeParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), "public/data/songs/digital-sonix-and-chrome/dragon'sbreath ingame 1.dsc");

describe('Digital Sonix & Chrome pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over the whole sequence table', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parseDscFile(ab, "dragon'sbreath ingame 1.dsc");
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }
    expect(layout.formatId).toBe('digitalSonixChrome');
    // Must point at the real sequence table, not the stub offset 0.
    expect(layout.patternDataFileOffset).toBeGreaterThan(0);

    let checked = 0;
    let sawTrigger = false; // an entry carrying a position byte (not an all-0xFF rest)
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] !== 0xFF || orig[1] !== 0xFF || orig[2] !== 0xFF || orig[3] !== 0xFF) {
            sawTrigger = true;
          }
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawTrigger, 'fixture exercises non-rest sequence entries').toBe(true);
  });
});
