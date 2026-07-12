/**
 * Regression: GlueMon (GLUE magic) exposed a STUB pattern layout — a 64-row empty
 * grid decoded with the generic MOD codec over raw bytes at file offset 0 (module
 * header), so pattern write-back matched only ~8% of cells and never touched the song.
 *
 * GlueMon's replayer (third-party/uade-3.05/players/GlueMon, InitSound at code 0x544)
 * plays from a struct pointer == module base + 8: rowsPerPattern = file[29], the
 * contiguous pattern data begins at 8 + ((file[158]-105)&0xFF), and the order list at
 * file[159] (0xFF-terminated) names the patterns used. Each pattern is `rows` rows of
 * 4 bytes — one byte per voice [v0,v1,v2,v3]; 0xFF = rest/hold, 0xFE = note-off, and
 * the v3 lane also carries command markers 0xC8-0xCF (waveform/sample select). The
 * stream is not a clean note/effect cell, so the faithful byte-exact inverse is a
 * per-byte carrier: decodeCell exposes a best-effort display note and stashes the
 * exact source byte in the invisible `period` carrier, and encodeGlueMonCell
 * reproduces it verbatim.
 *
 * On revert (stub layout at offset 0 / MOD codec) the encoder rewrites the stream
 * bytes, so the rest/command/high bytes no longer round-trip and this fails.
 *
 * Fixture: public/data/songs/formats/memphis.glue (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseGlueMonFile } from '../GlueMonParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/memphis.glue');

describe('GlueMon pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every pattern-stream byte', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parseGlueMonFile(ab, 'memphis.glue');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }
    expect(layout.formatId).toBe('glueMon');
    // Must point at the real pattern data, not the stub offset 0.
    expect(layout.patternDataFileOffset).toBeGreaterThan(0);
    expect(layout.bytesPerCell).toBe(1);
    expect(layout.numChannels).toBe(4);

    let checked = 0;
    let sawRest = false;    // 0xFF rest — the note-only view decodes note 0, so needs the carrier
    let sawCommand = false; // 0xC8-0xCF command byte the note-only view can't reconstruct
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if (orig[0] === 0xff) sawRest = true;
          if (orig[0] >= 0xc8 && orig[0] <= 0xcf) sawCommand = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawRest, 'fixture exercises rest bytes').toBe(true);
    expect(sawCommand, 'fixture exercises high command bytes').toBe(true);
  });
});
