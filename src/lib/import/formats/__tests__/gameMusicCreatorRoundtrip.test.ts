/**
 * Regression: Game Music Creator (.gmc) pattern write-back mangled off-table periods and
 * dropped effect bytes on round-trip (only ~63% of cells survived).
 *
 * Each 4-byte GMC cell is [ (sample<<4)|(period>>8), period&0xFF, cmd, param ]. The parser
 * decodes the period to the nearest MOD-table note, and encodeGameMusicCreatorCell
 * re-derived the period from that note via the same table — so any raw Amiga period not
 * exactly on the table came back as a different pair of bytes. The GMC effect map is also
 * many-to-one (cmd 0 drops its param, byte2's high nibble and unmapped commands collapse to
 * 0), so byte2/byte3 could not be reproduced from the XM effect view.
 *
 * Fix: layout.decodeCell stashes the exact source period, byte2 and byte3 in the invisible
 * period/pan/cutoff carriers (fields the GMC grid loop never sets, so edited cells fall back
 * to the canonical note→period + effect-map derivation), and the encoder reproduces them
 * verbatim on every path.
 *
 * Fixture: public/data/songs/formats/knights_of_sky.gmc (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { parseGameMusicCreatorFile } from '../GameMusicCreatorParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/knights_of_sky.gmc');

describe('Game Music Creator pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern cell', () => {
    const b = readFileSync(FIXTURE);
    const raw = new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const song = parseGameMusicCreatorFile(raw, 'knights_of_sky.gmc');
    expect(song, 'parsed').toBeTruthy();
    const layout = song!.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawNote = false;   // note-bearing cell (the off-table period lane)
    let sawEffect = false; // cell with a GMC effect command (the byte2/3 lane)
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          const notecut = orig[0] === 0xFF && orig[1] === 0xFE;
          if (!notecut && (((orig[0] & 0x0F) << 8) | orig[1]) > 0) sawNote = true;
          if ((orig[2] & 0x0F) > 0) sawEffect = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawNote, 'fixture exercises a period the table round-trip mangled').toBe(true);
    expect(sawEffect, 'fixture exercises an effect byte the lossy map dropped').toBe(true);
  });
});
