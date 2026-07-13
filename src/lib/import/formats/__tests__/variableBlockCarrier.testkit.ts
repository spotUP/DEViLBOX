/**
 * Shared assertions for the structural raw-block carrier (UADE variable-length
 * pattern formats). A parser that captures real per-block file offsets/sizes plus
 * blockRawBytes (original packed bytes) + blockRows (decoded baseline) must:
 *
 *   1. re-emit every unedited block byte-for-byte via encodeVariableBlock
 *      (byte-exact — the property the encoderRoundtrip ratchet enforces), and
 *   2. fall back to the format packer the moment a cell differs (editability
 *      preserved — proves the carrier is not just gaming the metric).
 *
 * On revert of the carrier, assertion 1 fails: encodeVariableBlock falls straight
 * through to the packer and no block reproduces the original bytes.
 *
 * Each format's own <fmt>Roundtrip.test.ts is a thin wrapper around this so the
 * regression lives in the test:ci glob and fails on revert per format.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import { ENCODER_FIXTURES } from '@/engine/uade/__tests__/fixtures.map';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';

type ParseFn = (buffer: ArrayBuffer, filename: string) => TrackerSong | Promise<TrackerSong>;

/** Register the two carrier assertions for one variable-length format. */
export function describeVariableBlockCarrier(formatId: string, parse: ParseFn): void {
  const entry = ENCODER_FIXTURES.find((f) => f.formatId === formatId);
  const fixturePath = entry ? join(process.cwd(), entry.fixture) : '';

  async function load(): Promise<TrackerSong> {
    const b = readFileSync(fixturePath);
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    return parse(ab, `fixture.${formatId}`);
  }

  describe(`${formatId} variable-block round-trip`, () => {
    it('encodeVariableBlock reproduces every unedited block byte-for-byte', async () => {
      expect(entry, `fixture registered for ${formatId}`).toBeTruthy();
      const song = await load();
      const layout = song.uadeVariableLayout;
      expect(layout, 'variable layout present').toBeTruthy();
      if (!layout) throw new Error('no variable layout');
      expect(layout.formatId).toBe(formatId);
      expect(layout.blockRawBytes, 'raw-byte carrier present').toBeTruthy();
      expect(layout.blockRows, 'baseline rows present').toBeTruthy();
      const rawBytes = layout.blockRawBytes!;
      const baseline = layout.blockRows!;
      const numPatterns = layout.numFilePatterns / layout.numChannels;

      let checked = 0;
      for (let fp = 0; fp < layout.numFilePatterns; fp++) {
        const raw = rawBytes[fp];
        const rows = baseline[fp];
        if (!raw || !rows || raw.length === 0) continue; // empty block: skipped by harness
        // per-channel formats index fp as channel*numPatterns+pat; whole-pattern
        // formats index fp as the pattern (channel 0). Either way the carrier
        // compares rows to its own baseline, so any consistent channel works.
        const channel = numPatterns > 0 && Number.isInteger(numPatterns)
          ? Math.floor(fp / numPatterns)
          : 0;
        const re = encodeVariableBlock(layout, fp, rows, channel);
        expect([...re], `unedited block fp=${fp}`).toEqual([...raw]);
        checked++;
      }
      expect(checked, 'exercised real blocks').toBeGreaterThan(0);
    });

    it('encodeVariableBlock falls back to the packer when a block is edited', async () => {
      const song = await load();
      const layout = song.uadeVariableLayout!;
      const rawBytes = layout.blockRawBytes!;
      const baseline = layout.blockRows!;

      // Pick the first block with real bytes AND at least one editable row.
      // Some formats (e.g. Future Player) carry pure command/call blocks with no
      // note rows — those have real bytes but nothing a cell edit could change,
      // so they are not valid subjects for the "edit diverges" assertion.
      let fp = 0;
      while (
        fp < layout.numFilePatterns &&
        (!rawBytes[fp] || rawBytes[fp].length === 0 || !baseline[fp] || baseline[fp].length === 0)
      ) fp++;
      expect(fp).toBeLessThan(layout.numFilePatterns);

      const edited: TrackerCell[] = baseline[fp].map((c) => ({ ...c }));
      edited[0] = { ...edited[0], note: ((edited[0].note ?? 0) % 60) + 25 };
      expect(edited[0].note).not.toBe(baseline[fp][0].note ?? 0);

      const re = encodeVariableBlock(layout, fp, edited, 0);
      expect([...re]).not.toEqual([...rawBytes[fp]]);
    });
  });
}
