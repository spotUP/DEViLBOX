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
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseDavidWhittakerFile } from '../DavidWhittakerParser';
import { walkDavidWhittaker, DW_WALK } from '../DavidWhittakerWasmExtractor';
import { installDwNodeFetch } from '../../__tests__/helpers/dwNodeFetch';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/david-whittaker/garfield2+.dw');
const load = (path: string) => {
  const raw = new Uint8Array(readFileSync(join(process.cwd(), path)));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
};

let restoreFetch = () => {};
beforeAll(() => { restoreFetch = installDwNodeFetch(); });
afterAll(() => restoreFetch());

describe('David Whittaker pattern codec', () => {
  it('the variable encoder reproduces every command block byte-for-byte', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseDavidWhittakerFile(load('public/data/songs/david-whittaker/garfield2+.dw'), 'garfield2+.dw');
    expect(song, 'parse succeeds').toBeTruthy();

    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present (NOT the fixed stub)').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('davidWhittaker');

    const { filePatternAddrs, filePatternSizes, blockRows, blockRawBytes, encoder } = layout;
    expect(filePatternAddrs.length, 'has file-pattern blocks').toBeGreaterThan(0);
    // The grid is the replayer's tick timeline, so the byte-exact source is the off-grid block carriers.
    expect(blockRows?.length, 'a carrier row set per block').toBe(filePatternAddrs.length);

    let sawCommands = false; // a block with real command bytes (not just a bare -128)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      expect(addr).toBeGreaterThanOrEqual(0);
      expect(size).toBeGreaterThan(0);
      expect(addr + size).toBeLessThanOrEqual(raw.length);
      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      expect([...encoder.encodePattern(blockRows![fp], 0)], `block fp${fp} @${addr} size ${size} (carriers)`).toEqual([...orig]);
      expect([...blockRawBytes![fp]], `block fp${fp} raw bytes`).toEqual([...orig]);
    }
    expect(sawCommands, 'fixture exercises multi-command blocks').toBe(true);
  });

  // Regression: the structure scan stepped back onto its own `move.w x(a5),d1`
  // after reading the period table and spun there until its iteration limit, so
  // it never reached the `subi.b #$c0/#$b0/#$a0,d0` instructions that give each
  // player's command ranges. garfield2+'s player uses 0xc0 / 0xb0 / 0xa0, so its
  // first block `c2 b6 ff 82 ...` selects sample 3 and volume sequence 6; apb.dw's
  // player really uses 0xb0 / 0xa0 / 0x90 (`ae b1 ...`: volume sequence, sample 2).
  // The replayer's own walk is the oracle for what each command is.
  it('reads sample-change commands with the command ranges of the module\'s own player', async () => {
    const firstSample = async (path: string) => {
      const walk = await walkDavidWhittaker(load(path));
      return walk.events.find((e) => e.channel === 0 && e.kind === DW_WALK.sample)?.a;
    };
    expect(await firstSample('public/data/songs/david-whittaker/garfield2+.dw')).toBe(2);   // sample 3
    expect(await firstSample('public/data/songs/formats/apb.dw')).toBe(1);                   // sample 2
  });
});
