/**
 * Regression: Paul Shields (.ps) exposed a STUB pattern layout — a 64-row empty grid
 * decoded with the generic MOD codec over raw bytes at file offset 0 (module header),
 * so pattern write-back matched only ~34% of cells and never touched the real song.
 *
 * A Paul Shields module addresses its per-channel sequence/note-command streams via a
 * 4-entry song-pointer table. Those streams are opcode-driven dispatch bytes (JMP
 * (PC,D0.W)), not a clean note/effect grid, so the faithful byte-exact inverse is a
 * per-byte carrier: decodeCell stashes the exact source byte in the invisible `period`
 * carrier and encodePaulShieldsCell reproduces it verbatim.
 *
 * On revert (stub layout at offset 0 / no carrier) the encoder rewrites the stream
 * bytes, so the command/high bytes no longer round-trip and this fails.
 *
 * Fixture: public/data/songs/formats/jug-hiscore.ps (real 'old'-variant module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePaulShieldsFile } from '../PaulShieldsParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/jug-hiscore.ps');

describe('Paul Shields pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every command-stream byte', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parsePaulShieldsFile(ab, 'jug-hiscore.ps');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }
    expect(layout.formatId).toBe('paulShields');
    // Must point at the real command region, not the stub offset 0.
    expect(layout.patternDataFileOffset).toBeGreaterThan(0);
    expect(layout.bytesPerCell).toBe(1);

    let checked = 0;
    let sawCommand = false; // a high dispatch byte the note-only view can't reconstruct
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] > 0x3f) sawCommand = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawCommand, 'fixture exercises high command bytes').toBe(true);
  });
});
