/**
 * Regression: JamCracker write-back mangled the volume + phase columns.
 *
 * JamCracker's per-cell volume byte (nt_volume) is context-dependent (verified against
 * jamcracker-wasm/src/JamCrackerProReplay.c pp_nnt):
 *   - nt_speed bit7 SET   → nt_volume is an ABSOLUTE volume.
 *   - nt_speed bit7 CLEAR → nt_volume is a SIGNED volume SLIDE (bit7 = sign, low7 = magnitude).
 * The old codec always treated it as an absolute `1-65 → 0x10+` value, so signed slides
 * (0x8X, the common case when speed is 0) were clamped to a bogus set-volume and lost on
 * re-encode. The phase byte (nt_phase, an AM-synth modulation lane with no XM equivalent)
 * was dropped entirely.
 *
 * The codec now stores the raw nt_volume byte verbatim in the volume column (a byte-exact,
 * invertible mapping — 0x8X renders as an XM fine-slide, which matches the down-slide it is)
 * and preserves nt_phase in the second effect column. JamCracker plays through the dedicated
 * jamcracker-wasm replayer from these raw bytes, so verbatim preservation is what write-back
 * and native export require.
 *
 * Fixture: public/data/songs/formats/analogue_vibes.jam (committed real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseJamCrackerFile } from '../JamCrackerParser';
import '@engine/uade/encoders/index';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/analogue_vibes.jam');

function loadFixture(): ArrayBuffer {
  const b = readFileSync(FIXTURE);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('JamCracker pattern codec', () => {
  it('encodeCell is a byte-exact inverse of decodeCell over the whole pattern region', async () => {
    const buf = loadFixture();
    const song = await parseJamCrackerFile(buf, 'analogue_vibes.jam');
    expect(song, 'parser returned a song').toBeTruthy();
    const layout = song.uadePatternLayout;
    expect(layout, 'layout present').toBeTruthy();
    if (!layout || !layout.decodeCell || !layout.getCellFileOffset) throw new Error('layout incomplete');

    const raw = new Uint8Array(buf);
    let checked = 0;
    let sawVolumeSlide = false; // nt_volume with bit7 set (signed slide) — the mangled case
    let sawPhase = false;       // nt_phase nonzero — the previously-dropped lane
    for (let p = 0; p < layout.numPatterns; p++) {
      for (let r = 0; r < layout.rowsPerPattern; r++) {
        for (let c = 0; c < layout.numChannels; c++) {
          const off = layout.getCellFileOffset(p, r, c);
          if (off < 0 || off + layout.bytesPerCell > raw.length) continue;
          const orig = raw.subarray(off, off + layout.bytesPerCell);
          if ((orig[6] ?? 0) & 0x80) sawVolumeSlide = true;
          if ((orig[5] ?? 0) !== 0) sawPhase = true;
          const cell = layout.decodeCell(orig);
          const re = layout.encodeCell(cell);
          expect([...re], `cell p${p} r${r} c${c} @${off}`).toEqual([...orig]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    // The fixture must actually exercise the previously-broken lanes.
    expect(sawVolumeSlide, 'fixture has at least one signed volume-slide cell (nt_volume bit7 set)').toBe(true);
    expect(sawPhase, 'fixture has at least one nt_phase cell').toBe(true);
  });
});
