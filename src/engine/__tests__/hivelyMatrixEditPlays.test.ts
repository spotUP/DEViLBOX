/**
 * Owner 2026-11-03: "my matrix edits look like they change the pattern but pressing play plays the unchanged song"
 * (AHX and HVL).
 *
 * Cause: the position matrix wrote only hivelyNative.positions. The tracker grid (one pattern per position, the
 * position's transpose folded in) was not projected again, so the song looked unedited (gridIsEdited false),
 * editedModuleForPlay returned null and play loaded the module as opened. The running tune was not told either.
 *
 * Real songs through the real import path (importTrackerModule); the edit is the matrix's own write path
 * (editHivelyPosition); the next play's module is what engineLoadArgs loads (editedModuleForPlay), read back with the
 * Hively parser.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: () => () => undefined });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => null };
});
const setPosition = vi.fn();
const settle = () => new Promise((r) => setTimeout(r, 50));

async function load(rel: string): Promise<void> {
  const bytes = readFileSync(rel);
  const file = new File([new Uint8Array(bytes)], basename(rel));
  const { importTrackerModule } = await import('@/lib/song/songBranches');
  await importTrackerModule({
    metadata: { title: basename(rel), type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
    arrayBuffer: await file.arrayBuffer(), file,
  } as never, { useLibopenmpt: true } as never);
}

async function nextPlay() {
  const { liveTrackerSong } = await import('@/lib/song/liveSong');
  const { playingDescriptor } = await import('@/engine/replayer/liveCellEdits');
  const { editedModuleForPlay } = await import('@/engine/replayer/editedModuleForPlay');
  const { parseHivelyFile } = await import('@/lib/import/formats/HivelyParser');
  const song = liveTrackerSong();
  const desc = playingDescriptor(song);
  expect(desc?.key, 'the song plays on the Hively engine').toBe('Hively');
  const edited = await editedModuleForPlay(song, desc!);
  expect(edited, 'play loads an edited module, not the one opened').not.toBeNull();
  const buf = edited instanceof Uint8Array ? edited.slice().buffer : edited!.slice(0);
  return parseHivelyFile(buf as ArrayBuffer, desc!.key).hivelyNative!;
}

describe('Hively: a position matrix edit is what the next play plays', { timeout: 120000 }, () => {
  // the running engine is the real class with its instance stubbed (a module mock with importActual hands later
  // dynamic imports the real class, so the poke would be missed)
  beforeAll(async () => {
    await import('@stores');
    const { HivelyEngine } = await import('@/engine/hively/HivelyEngine');
    vi.spyOn(HivelyEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(HivelyEngine, 'getInstance').mockReturnValue({ setPosition, setTrackStep: () => {} } as never);
  }, 120000);

  for (const rel of ['public/data/songs/ahx/amanda.ahx', 'public/data/songs/formats/hexplosion.hvl']) {
    it(`track and transpose edits (${basename(rel)})`, async () => {
      await load(rel);
      const { useFormatStore } = await import('@stores/useFormatStore');
      const { useTrackerStore } = await import('@stores/useTrackerStore');
      const { editHivelyPosition } = await import('@/components/hively/hivelyEdit');
      const { hivelyStepToCell } = await import('@/lib/import/formats/HivelyParser');
      const native = useFormatStore.getState().hivelyNative!;
      const was = native.positions[0].track[0];
      const sig = (t: number) => JSON.stringify(native.tracks[t].steps);
      const to = native.tracks.findIndex((_, t) => t !== was && sig(t) !== sig(was) && native.tracks[t].steps.some((s) => s.note > 0));
      expect(to, 'the song has another track to choose').toBeGreaterThanOrEqual(0);
      const tr = (native.positions[1]?.transpose[1] ?? 0) + 5;

      setPosition.mockClear();
      editHivelyPosition(0, 0, 'track', to);
      editHivelyPosition(1, 1, 'transpose', tr);
      await settle();

      // the grid the pattern editor and the play check read holds the new track at position 0, channel 0
      const after = useFormatStore.getState().hivelyNative!;
      const grid = useTrackerStore.getState().patterns[0].channels[0].rows;
      after.tracks[to].steps.forEach((s, r) => expect(grid[r].note, `row ${r}`).toBe(hivelyStepToCell(s, after.positions[0].transpose[0]).note));

      // the next play's module carries both edits
      const played = await nextPlay();
      expect(played.positions[0].track[0]).toBe(to);
      expect(played.positions[1].transpose[1]).toBe(tr);

      // the running tune got the same positions (sentinel: the live write path ran)
      expect(setPosition).toHaveBeenCalledWith(0, 0, to, after.positions[0].transpose[0]);
      expect(setPosition).toHaveBeenCalledWith(1, 1, after.positions[1].track[1], tr);
    });
  }
});
