/**
 * Regression: Infogrames (.dum, "RobHubbard2") exposed a STUB pattern layout — a
 * 64-row 4-channel grid decoded with the generic MOD codec at file offset 0, so
 * pattern write-back matched under 1% of cells and never touched the real song.
 *
 * Infogrames is a TWO-file format: the .dum holds only the song / sequence data
 * (header-pointer + opcode-driven track command streams), while samples live in an
 * external .dum.set / .ins file loaded at runtime. The .dum therefore contains NO
 * sample PCM — every byte is part of the tune — but the note data is a command
 * stream, not a clean note/effect grid, so the faithful byte-exact inverse is a
 * per-byte carrier over the whole song: decodeCell stashes the exact source byte in
 * the invisible `period` carrier and encodeInfogramesCell reproduces it verbatim.
 *
 * On revert (stub layout / MOD codec) the encoder rewrites the stream bytes, so the
 * song bytes no longer round-trip and this fails.
 *
 * Fixture: public/data/songs/formats/bob4e.dum (real Infogrames module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseInfogramesFile } from '../InfogramesParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/bob4e.dum');

describe('Infogrames pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every song byte', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parseInfogramesFile(ab, 'bob4e.dum');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }
    expect(layout.formatId).toBe('infogrames');
    // The .dum is 100% song data — the located region is the whole file (1 byte/cell,
    // single channel), not the 64x4 MOD stub.
    expect(layout.bytesPerCell).toBe(1);
    expect(layout.numChannels).toBe(1);
    expect(layout.rowsPerPattern).toBe(raw.length);

    let checked = 0;
    let sawData = false; // a nonzero byte the canonical (zero) encode can't reproduce
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] !== 0x00) sawData = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBe(raw.length);
    expect(sawData, 'fixture exercises nonzero song bytes').toBe(true);
  });
});
