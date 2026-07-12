/**
 * Regression: Paul Robotham (.dat) exposed a STUB pattern layout — a 64-row empty
 * grid decoded with the generic MOD codec over raw bytes at file offset 0 (module
 * header), so pattern write-back matched only ~8% of cells and never touched the song.
 *
 * A Paul Robotham module stores its song as header + voice/sequence/pattern pointer
 * tables + instrument records, then the pattern data: each pattern pointer addresses a
 * fixed-length per-voice note/command stream (note indices 0x1c-0x3e, 0x3f = rest, plus
 * high command bytes 0x80+). The stream is not a clean note/effect cell, so the faithful
 * byte-exact inverse is a per-byte carrier: decodeCell exposes a best-effort display note
 * and stashes the exact source byte in the invisible `period` carrier, and
 * encodePaulRobothamCell reproduces it verbatim.
 *
 * On revert (stub layout at offset 0 / no carrier) the encoder rewrites the stream bytes,
 * so the command/high bytes no longer round-trip and this fails.
 *
 * Fixture: public/data/songs/formats/dawnpatrol-sad.dat (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsePaulRobothamFile } from '../PaulRobothamParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/dawnpatrol-sad.dat');

describe('Paul Robotham pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern-stream byte', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parsePaulRobothamFile(ab, 'dawnpatrol-sad.dat');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }
    expect(layout.formatId).toBe('paulRobotham');
    // Must point at the real pattern data, not the stub offset 0.
    expect(layout.patternDataFileOffset).toBeGreaterThan(0);
    expect(layout.bytesPerCell).toBe(1);

    let checked = 0;
    let sawCommand = false; // a high command byte the note-only view can't reconstruct
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
