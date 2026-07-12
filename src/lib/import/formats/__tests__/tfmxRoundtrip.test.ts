/**
 * Regression: TFMX (mdat.*) pattern write-back mangled cells.
 *
 * Each TFMX pattern command is a 4-byte big-endian longword [note/cmd, macro, relVol<<4,
 * wait/detune]. The XM view is lossy: the note is a clamped table lookup, the relative
 * volume nibble is scaled (b2>>4)*4, and pattern/wait/detune bytes collapse into the narrow
 * XM effect columns, so encodeTFMXCell (re-deriving all 4 bytes from that view) reproduced
 * few source cells (ratchet 0.1469 match).
 *
 * Fix: TFMXParser.decodeCell stashes all 4 source bytes in the invisible period/pan/cutoff
 * carriers (fields the grid loop never sets — it pushes a separately-built cmds[row].cell),
 * and encodeTFMXCell reproduces all 4 bytes verbatim when present.
 *
 * Fixture: public/data/songs/formats/mdat.rocknroll (real module).
 *
 * The layout declares rowsPerPattern=1 (patterns are variable-length), so — mirroring the
 * harness — the round-trip is measured over the first row of every pattern/channel.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTFMXFile } from '../TFMXParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/mdat.rocknroll');

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('TFMX pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over every measured cell', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseTFMXFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, 'mdat.rocknroll');
    const layout = song.uadePatternLayout;
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    let checked = 0;
    let sawLossy = false; // a cell the carrier-less derivation would have mangled
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          const cell = layout.decodeCell(orig);
          expect([...layout.encodeCell(cell)], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          // Prove the carrier is load-bearing: without it, the canonical derivation differs.
          const bare = { ...cell };
          delete bare.period; delete bare.pan; delete bare.cutoff;
          if (!bytesEqual(layout.encodeCell(bare), orig)) sawLossy = true;
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(sawLossy, 'fixture exercises a cell the lossy derivation would mangle').toBe(true);
  });
});
