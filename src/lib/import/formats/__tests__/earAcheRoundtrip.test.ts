/**
 * Regression: EarAche (.ea, "EASO") exposed a STUB pattern layout — a 64-row 4-channel
 * grid decoded with the generic MOD codec at file offset 0 (header magic), so pattern
 * write-back matched only ~33% of cells and never touched the real score.
 *
 * An EASO module is a container: a 4-byte magic + a 6-entry u32 section offset table
 * (relative to byte 4); section[0] is the score command-stream (opcode-driven event
 * bytes — 0x19/0x1b/0x1c note+control ops, 0x31/0x36/0x38 args), the rest are
 * instrument / envelope / sample tables. The score has no clean note/effect grid, so
 * the faithful byte-exact inverse is a per-byte carrier over the located score region:
 * decodeCell stashes the exact source byte in the invisible `period` carrier and
 * encodeEarAcheCell reproduces it verbatim.
 *
 * On revert (stub layout at offset 0 / MOD codec) the encoder rewrites the stream
 * bytes, so the opcode/high bytes no longer round-trip and this fails.
 *
 * Fixture: public/data/songs/earache/bladerunner.ea (real EASO module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseEarAcheFile } from '../EarAcheParser';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/earache/bladerunner.ea');

describe('EarAche pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every score-stream byte', () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const raw = new Uint8Array(ab);
    const song = parseEarAcheFile(ab, 'bladerunner.ea');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell) {
      throw new Error('layout incomplete');
    }
    expect(layout.formatId).toBe('earAche');
    // Must point at the real score region, not the stub offset 0.
    expect(layout.patternDataFileOffset).toBeGreaterThan(0);
    expect(layout.bytesPerCell).toBe(1);
    expect(layout.numChannels).toBe(1);

    let checked = 0;
    let sawData = false; // a nonzero opcode byte the canonical (rest) encode can't reproduce
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = getCellFileOffset(layout, p, r, c);
          if (off <= 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          // Canonical encode of a carrier-less cell emits 0x00 — any nonzero source
          // byte proves the byte only round-trips because the carrier preserved it.
          if (orig[0] !== 0x00) sawData = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawData, 'fixture exercises nonzero score bytes').toBe(true);
  });
});
