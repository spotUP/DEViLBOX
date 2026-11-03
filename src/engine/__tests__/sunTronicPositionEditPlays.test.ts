/**
 * Owner 2026-11-03: "my matrix edits look like they change the pattern but pressing play plays the unchanged song"
 * (checked for the SunTronic position matrix).
 *
 * Play loads the module bytes the format store holds (liveTrackerSong().uadeEditableFileData; the native engine
 * loads sunTronicSongFileData). This test pins that a position-matrix edit (block or transpose of one voice) is
 * in those bytes: the bytes the next play loads decode to the edited matrix.
 *
 * Real song through the real parser.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseSunTronicFile, readFixture } from '@/lib/import/formats/__tests__/sunTestUtil';
import { useFormatStore } from '@stores/useFormatStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { liveTrackerSong } from '@/lib/song/liveSong';
import type { TrackerSong } from '@/engine/TrackerReplayer';

let song: TrackerSong;

function loadSong(): void {
  song = parseSunTronicFile(readFixture('ready'), 'ready');
  useFormatStore.getState().applyEditorMode(song);
  useTrackerStore.getState().loadPatterns(song.patterns);
}

async function bytesChanged(before: ArrayBuffer | null): Promise<ArrayBuffer> {
  await vi.waitFor(() => {
    expect(useFormatStore.getState().uadeEditableFileData).not.toBe(before);
  }, { timeout: 10000 });
  return liveTrackerSong().uadeEditableFileData as ArrayBuffer;
}

describe('SunTronic: a position matrix edit is what the next play loads', () => {
  beforeEach(loadSong);

  it('a block change reaches the module bytes', async () => {
    const nd = song.sunTronicNative!;
    const v = nd.positions[0].blockIndex.findIndex((b) => b >= 0);
    expect(v, 'position 0 has a voice with a block').toBeGreaterThanOrEqual(0);
    const was = nd.positions[0].blockIndex[v];
    const to = nd.blocks.findIndex((b, i) => i !== was && JSON.stringify(b) !== JSON.stringify(nd.blocks[was]));
    expect(to, 'the pool has another block').toBeGreaterThanOrEqual(0);
    const wantBlock = JSON.stringify(nd.blocks[to]);

    const before = useFormatStore.getState().uadeEditableFileData;
    useFormatStore.getState().setSunTronicPositionCell(0, v, 'blockIndex', to);
    const bytes = await bytesChanged(before);

    const replayed = parseSunTronicFile(bytes.slice(0), 'ready').sunTronicNative!;
    expect(JSON.stringify(replayed.blocks[replayed.positions[0].blockIndex[v]])).toBe(wantBlock);
    // the grid is the new song, not a pending edit
    expect(useFormatStore.getState().sunTronicNative!.positions[0].blockIndex[v])
      .toBe(replayed.positions[0].blockIndex[v]);
  });

  it('a transpose change reaches the module bytes', async () => {
    const nd = song.sunTronicNative!;
    const v = nd.positions[0].blockIndex.findIndex((b) => b >= 0);
    const to = nd.positions[0].transpose[v] + 3;

    const before = useFormatStore.getState().uadeEditableFileData;
    useFormatStore.getState().setSunTronicPositionCell(0, v, 'transpose', to);
    const bytes = await bytesChanged(before);

    const replayed = parseSunTronicFile(bytes.slice(0), 'ready').sunTronicNative!;
    expect(replayed.positions[0].transpose[v]).toBe(to);
  });
});
