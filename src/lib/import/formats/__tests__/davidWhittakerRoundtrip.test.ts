/**
 * Regression: David Whittaker was a fake-grid stub — it emitted a tick-quantized
 * 64-row pattern and a fixed UADEPatternLayout whose getCellFileOffset addressed
 * fabricated row-major offsets into 68k player code (the generic decodeMODCell over
 * those offsets round-tripped ~7% of NON-pattern bytes: matchPct 0.0693).
 *
 * A DW "song" is a per-channel command BYTE STREAM, not a cell grid: each channel
 * steps through an ordered list of blocks, and each block is a contiguous run of
 * variable-length commands ending in the -128 marker. There is no per-cell offset,
 * so the only faithful byte-exact inverse is a whole-block encoder.
 *
 * Fix: the parser now decodes each block into one carrier-bearing TrackerCell per
 * stream command (cutoff=length, period=b0, pan=b1, resonance=b2) and exposes a
 * UADEVariablePatternLayout. davidWhittakerEncoder.encodePattern concatenates the
 * carrier bytes to reproduce every block byte-for-byte.
 *
 * This test replicates the harness's variable round-trip: for every file-pattern it
 * encodes the mapped channel rows and asserts the bytes equal the original block.
 * On revert (fixed stub layout) song.uadeVariableLayout is undefined → this fails.
 *
 * Fixture: public/data/songs/david-whittaker/garfield2+.dw (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDavidWhittakerFile } from '../DavidWhittakerParser';

const FIXTURE = join(process.cwd(), 'public/data/songs/david-whittaker/garfield2+.dw');

describe('David Whittaker pattern codec', () => {
  it('the variable encoder reproduces every command block byte-for-byte', () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = parseDavidWhittakerFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      'garfield2+.dw',
    );
    expect(song, 'parse succeeds').toBeTruthy();

    const layout = (song as unknown as { uadeVariableLayout?: import('@/engine/uade/UADEPatternEncoder').UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present (NOT the fixed stub)').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('davidWhittaker');

    const { filePatternAddrs, filePatternSizes, trackMap, encoder } = layout;
    expect(filePatternAddrs.length, 'has file-pattern blocks').toBeGreaterThan(0);

    let checked = 0;
    let sawCommands = false; // a block with real command bytes (not just a bare -128)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      // Find first (tp,ch) mapping to this file-pattern (mirrors the harness).
      let mapped: { tp: number; ch: number } | null = null;
      for (let tp = 0; tp < trackMap.length && !mapped; tp++) {
        const row = trackMap[tp];
        if (!row) continue;
        for (let ch = 0; ch < row.length; ch++) {
          if (row[ch] === fp) { mapped = { tp, ch }; break; }
        }
      }
      expect(mapped, `file-pattern ${fp} is referenced by the trackMap`).toBeTruthy();
      if (!mapped) continue;

      const rows = song.patterns[mapped.tp]?.channels[mapped.ch]?.rows;
      expect(rows, `rows for tp${mapped.tp} ch${mapped.ch}`).toBeTruthy();
      if (!rows) continue;

      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      expect(addr).toBeGreaterThanOrEqual(0);
      expect(size).toBeGreaterThan(0);
      expect(addr + size).toBeLessThanOrEqual(raw.length);

      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      const re = encoder.encodePattern(rows, mapped.ch);
      expect([...re], `block fp${fp} @${addr} size ${size}`).toEqual([...orig]);
      checked++;
    }

    expect(checked, 'at least one block round-tripped').toBeGreaterThan(0);
    expect(sawCommands, 'fixture exercises multi-command blocks').toBe(true);
  });
});
