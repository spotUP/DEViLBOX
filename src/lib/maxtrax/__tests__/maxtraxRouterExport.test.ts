// src/lib/maxtrax/__tests__/maxtraxRouterExport.test.ts
/**
 * Regression guard for the nativeExportRouter MaxTrax store-preference path.
 *
 * The isMaxTrax branch in dispatchNativeExport must read the LIVE edited model
 * from useFormatStore.maxTraxData (preserving edits) rather than always
 * re-parsing the original song.maxTraxFileData bytes (which discards edits).
 *
 * Commit 8ec292d50 added a round-trip test (maxtraxRoundTrip.test.ts) that
 * exercises the codec directly — but reverting the router's `live ??` to plain
 * `parseMaxTrax(song.maxTraxFileData!)` leaves BOTH existing tests green because
 * neither exercises the router. This test closes that gap.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMaxTrax } from '@/lib/import/formats/maxtrax/maxtraxFormat';
import { setNoteDuration } from '@/lib/maxtrax/maxtraxGrid';
import { exportNativeSong } from '@/lib/export/nativeExportRouter';
import { useFormatStore } from '@/stores/useFormatStore';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const FIXTURE_PATH = join(process.cwd(), 'public/data/songs/maxtrax', 'contraptionzack-march.mxtx');

function loadFixtureBuffer(): ArrayBuffer {
  const nodeBuffer = readFileSync(FIXTURE_PATH);
  // Copy into a clean ArrayBuffer (avoids Node pool-slice issues).
  const ab = new ArrayBuffer(nodeBuffer.byteLength);
  new Uint8Array(ab).set(nodeBuffer);
  return ab;
}

afterEach(() => {
  // Clear live MaxTrax model so store state doesn't leak between tests.
  useFormatStore.getState().setMaxTraxData(null);
});

describe('MaxTrax router export — store-preference path', () => {
  it('encodes the live store model (not re-parsed raw bytes) when maxTraxData is set', async () => {
    const originalBuffer = loadFixtureBuffer();
    const originalBytes = new Uint8Array(originalBuffer);

    // Parse the fixture and mutate a note's stopTime to a recognisable sentinel.
    const mutated = parseMaxTrax(originalBytes);
    const scoreIdx = 0;
    const noteIdx = mutated.scores[scoreIdx].events.findIndex((e) => e.command <= 0x7f);
    expect(noteIdx).toBeGreaterThanOrEqual(0); // sanity: fixture has at least one note event
    mutated.scores[scoreIdx] = setNoteDuration(mutated.scores[scoreIdx], noteIdx, 999);

    // Confirm the sentinel differs from whatever the original bytes decode to,
    // so a fallback re-parse of originalBuffer would NOT produce 999.
    const unedited = parseMaxTrax(originalBytes);
    expect(unedited.scores[scoreIdx].events[noteIdx].stopTime).not.toBe(999);

    // Wire the mutated model into the store (simulates an in-editor edit).
    useFormatStore.getState().setMaxTraxData(mutated);

    // Build the minimal TrackerSong the router needs:
    //   - maxTraxFileData carries the ORIGINAL bytes so isMaxTrax() fires AND so
    //     that reverting the router's `live ??` to plain `parseMaxTrax(...)` would
    //     produce the unedited encoding (making this test fail, which is the goal).
    const song = {
      name: 'contraptionzack-march',
      format: 'MOD',
      patterns: [],
      instruments: [],
      songPositions: [],
      songLength: 0,
      restartPosition: 0,
      numChannels: 4,
      initialSpeed: 6,
      initialBPM: 125,
      maxTraxFileData: originalBuffer,
    } as unknown as TrackerSong;

    const result = await exportNativeSong(song);

    expect(result).not.toBeNull();
    expect(result!.filename).toMatch(/\.mxtx$/);

    // Re-parse the exported bytes. If the router used the LIVE store model the
    // mutated stopTime (999) must be present. If it re-parsed song.maxTraxFileData
    // instead, it would read the original unedited stopTime — and this assertion fails.
    const reimported = parseMaxTrax(new Uint8Array(result!.data));
    expect(reimported.scores[scoreIdx].events[noteIdx].stopTime).toBe(999);
  });
});
