/**
 * Regression: WallyBeben write-back flattened the rest/hold byte.
 *
 * A WallyBeben phrase byte in 0x24-0x7F is a "rest/hold" that renders as an empty row.
 * The old codec decoded every such byte to a plain rest and re-encoded it as the canonical
 * 0x24, so any rest byte with a different value (e.g. 0x7B) was silently rewritten — a
 * mutated file for an unedited cell. The format has no public replayer source, so the exact
 * byte is opaque; the codec now preserves it verbatim in eff2 (an invisible carrier for this
 * MOD-style single-effect view) and restores it on encode. Note bytes (0x00-0x23) already
 * round-tripped (b -> b+13 -> b); new/edited rest cells still collapse to the canonical 0x24.
 *
 * Fixture: public/data/songs/formats/wicked.wb (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseWallyBebenFile } from '../WallyBebenParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/wicked.wb');

function loadFixture(): ArrayBuffer {
  const b = readFileSync(FIXTURE);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('WallyBeben pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over the whole pattern region', () => {
    const buf = loadFixture();
    const song = parseWallyBebenFile(buf, 'wicked.wb');
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.encodeCell || !layout.getCellFileOffset) {
      throw new Error('layout incomplete');
    }

    const raw = new Uint8Array(buf);
    let checked = 0;
    let sawNonCanonicalRest = false; // rest byte in 0x25-0x7F — the previously-mangled case
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          const b = orig[0] ?? 0;
          if (b > 0x24 && b <= 0x7F) sawNonCanonicalRest = true;
          const re = layout.encodeCell(layout.decodeCell(orig));
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    // The fixture must actually exercise the previously-broken rest-byte lane.
    expect(sawNonCanonicalRest, 'fixture has at least one non-canonical rest byte (0x25-0x7F)').toBe(true);
  });
});
