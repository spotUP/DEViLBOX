/**
 * Regression: FastTracker 2 (.xm) uses variable-length packed pattern data where
 * every cell is 1-5 bytes and an empty cell may be encoded EITHER as a single
 * 0x80 pack byte OR as five zero bytes. That packing is non-canonical, so no
 * from-scratch encoder can reproduce a given file's bytes — and XMEncoder encodes
 * a single channel while an XM pattern block interleaves all channels, so the
 * encoderRoundtrip harness measured xm at 0.0000 (every block re-packed wrong).
 *
 * Fix (structural raw-block carrier, the user-chosen mechanism): the parser stashes
 * each pattern block's original packed byte slice (blockRawBytes) plus a decoded
 * baseline (blockRows). encodeVariableBlock emits the raw bytes verbatim when the
 * block is unedited (byte-exact) and falls back to the packer when a cell differs.
 *
 * This asserts BOTH branches so the carrier can't degenerate into gaming:
 *   1. unedited block → encodeVariableBlock === original raw slice (byte-exact)
 *   2. edited block   → encodeVariableBlock returns packer output (!= raw slice)
 *
 * On revert (no blockRawBytes carrier) branch 1 fails: encodeVariableBlock falls
 * through to the per-channel packer and no block is byte-exact.
 *
 * Fixture: public/data/songs/formats/*.xm (the encoderRoundtrip xm fixture).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseXMFile } from '../XMParser';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { ENCODER_FIXTURES } from '@/engine/uade/__tests__/fixtures.map';
import type { TrackerCell } from '@/types';

const XM_FIXTURE = ENCODER_FIXTURES.find((f) => f.formatId === 'xm')!.fixture;
const FIXTURE = join(process.cwd(), XM_FIXTURE);

describe('XM pattern block round-trip', () => {
  it('encodeVariableBlock reproduces every unedited block byte-for-byte', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const song = await parseXMFile(ab, 'fixture.xm');
    const layout = song.uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('xm');
    expect(layout.blockRawBytes, 'raw-byte carrier present').toBeTruthy();
    expect(layout.blockRows, 'baseline rows present').toBeTruthy();
    const rawBytes = layout.blockRawBytes!;
    const baseline = layout.blockRows!;

    let checked = 0;
    for (let fp = 0; fp < layout.numFilePatterns; fp++) {
      const raw = rawBytes[fp];
      const rows = baseline[fp];
      if (!raw || !rows || raw.length === 0) continue; // empty (0-byte) pattern: skipped by harness
      const re = encodeVariableBlock(layout, fp, rows, 0);
      expect([...re], `unedited block fp=${fp}`).toEqual([...raw]);
      checked++;
    }
    expect(checked, 'exercised real blocks').toBeGreaterThan(0);
  });

  it('encodeVariableBlock falls back to the packer when a block is edited', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const song = await parseXMFile(ab, 'fixture.xm');
    const layout = song.uadeVariableLayout!;
    const rawBytes = layout.blockRawBytes!;
    const baseline = layout.blockRows!;

    let fp = 0;
    while (fp < layout.numFilePatterns && (!rawBytes[fp] || rawBytes[fp].length === 0)) fp++;
    expect(fp).toBeLessThan(layout.numFilePatterns);

    const edited: TrackerCell[] = baseline[fp].map((c) => ({ ...c }));
    edited[0] = { ...edited[0], note: ((edited[0].note ?? 0) % 60) + 25 };
    expect(edited[0].note).not.toBe(baseline[fp][0].note ?? 0);

    const re = encodeVariableBlock(layout, fp, edited, 0);
    expect([...re]).not.toEqual([...rawBytes[fp]]);
  });
});
