/**
 * Regression: UltraTracker (.ult) is a variable-length (RLE-compressed) pattern
 * format. Its encoder (ULTEncoder.encodePattern) emits an UNCOMPRESSED 5-byte/row
 * stream with a many-to-one effect remap, so it structurally cannot reproduce the
 * original 0xFC-run-length source bytes — the encoderRoundtrip harness measured
 * ult at 0.0000 (every block re-packed to a different byte sequence).
 *
 * Fix (structural raw-block carrier, the user-chosen mechanism): the parser now
 * captures each file pattern-block's original byte slice (blockRawBytes) plus a
 * deep-copied baseline of its decoded rows (blockRows). encodeVariableBlock emits
 * the raw bytes VERBATIM when the block's rows still equal the baseline (unedited
 * → byte-exact), and falls back to the real ULTEncoder packer the moment any cell
 * differs (edited → re-pack). This is wired into the live chip-RAM rewrite path
 * (UADEChipEditor.rewriteVariablePattern) so the harness measures the same path
 * the editor uses.
 *
 * This test asserts BOTH branches so the carrier can't degenerate into gaming the
 * metric:
 *   1. unedited block  → encodeVariableBlock === original raw slice (byte-exact)
 *   2. edited block    → encodeVariableBlock returns the real packer output, which
 *                        differs from the raw slice (editability preserved)
 *
 * On revert (no blockRawBytes carrier) branch 1 fails: encodeVariableBlock falls
 * straight through to the lossy packer and no block is byte-exact.
 *
 * Fixture: public/data/songs/formats/seasons.ult (real UltraTracker module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseULTFile } from '../ULTParser';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerCell } from '@/types';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/seasons.ult');

describe('ULT pattern block round-trip', () => {
  it('encodeVariableBlock reproduces every unedited block byte-for-byte', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const song = await parseULTFile(ab, 'seasons.ult');
    const layout = song.uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('ult');
    expect(layout.blockRawBytes, 'raw-byte carrier present').toBeTruthy();
    expect(layout.blockRows, 'baseline rows present').toBeTruthy();
    const rawBytes = layout.blockRawBytes!;
    const baseline = layout.blockRows!;

    const numPatterns = layout.numFilePatterns / layout.numChannels;
    let checked = 0;
    for (let fp = 0; fp < layout.numFilePatterns; fp++) {
      const channel = Math.floor(fp / numPatterns);
      const raw = rawBytes[fp];
      const rows = baseline[fp];
      if (!raw || !rows || raw.length === 0) continue;
      const re = encodeVariableBlock(layout, fp, rows, channel);
      expect([...re], `unedited block fp=${fp}`).toEqual([...raw]);
      checked++;
    }
    expect(checked, 'exercised real blocks').toBeGreaterThan(0);
  });

  it('encodeVariableBlock falls back to the real packer when a block is edited', async () => {
    const b = readFileSync(FIXTURE);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const song = await parseULTFile(ab, 'seasons.ult');
    const layout = song.uadeVariableLayout!;
    const rawBytes = layout.blockRawBytes!;
    const baseline = layout.blockRows!;
    const numPatterns = layout.numFilePatterns / layout.numChannels;

    // Find the first non-empty block and edit a cell.
    let fp = 0;
    while (fp < layout.numFilePatterns && (!rawBytes[fp] || rawBytes[fp].length === 0)) fp++;
    expect(fp).toBeLessThan(layout.numFilePatterns);
    const channel = Math.floor(fp / numPatterns);

    const edited: TrackerCell[] = baseline[fp].map((c) => ({ ...c }));
    edited[0] = { ...edited[0], note: ((edited[0].note ?? 0) % 60) + 25 }; // force a change
    // sanity: the edit actually differs from baseline
    expect(edited[0].note).not.toBe(baseline[fp][0].note ?? 0);

    const re = encodeVariableBlock(layout, fp, edited, channel);
    // Edited block re-packs via the real encoder → NOT the verbatim raw slice.
    expect([...re]).not.toEqual([...rawBytes[fp]]);
  });
});
