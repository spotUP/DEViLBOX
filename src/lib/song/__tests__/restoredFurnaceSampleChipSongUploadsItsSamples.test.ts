/**
 * A restored Furnace sample-chip song uploads the same samples and
 * instruments as a fresh load (FURNACE-RECOVERY-SILENT, 2026-10-14).
 *
 * Meaningful Connection (Furnace ES5506) came back from crash recovery at
 * rms 0.00026 where a fresh load plays at 0.116. The song's module samples
 * and wavetables were not part of the song: the .fur parser put them on the
 * dispatch engine singleton as a side effect, no store held them, no save
 * carried them, and the engine uploaded whatever the last parse had left
 * (nothing, after a reload) when the restored song played. The ES5506 played
 * its instruments with no sample memory.
 *
 * The song now carries them through the one load/save path: parse -> applySong
 * -> stores -> snapshotSong -> savedSongToApply -> applySong, and the engine
 * takes them from the song it is told to play. Only the WASM worklet boundary
 * is stubbed (the audio context throws, so the start stops before the chips).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from '@/lib/import/__tests__/furnaceFileOpsWasmHarness';

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
// The WASM boundary: no audio context, so a start stops before it creates chips.
vi.mock('@utils/audio-context', () => ({
  getDevilboxAudioContext: () => { throw new Error('no audio context under test'); },
  getNativeAudioNode: () => null,
}));

const FILE = 'furnace/misc/meaningful_connection_es5506.fur';

type Sample = { data: ArrayLike<number>; rate: number; depth: number; loopStart: number; loopEnd: number; loopMode: number; name: string };

/** What the dispatch engine holds for the song it was last told to play. */
async function whatTheDispatchUploads() {
  const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');
  const { liveTrackerSong } = await import('../liveSong');
  const { collectIns2Uploads } = await import('@engine/furnace-dispatch/ins2Uploads');
  const engine = FurnaceDispatchEngine.getInstance();
  const song = liveTrackerSong();
  const result = await engine.startWithCoordinator({} as never, {
    song, synthBus: null, isStillCurrent: () => true, initialSongPos: 0, initialPattPos: 0,
  });
  expect(result.started).toBe(false);   // stopped at the stubbed audio context
  const samples = (engine.getModuleSamples() ?? []) as Sample[];
  return {
    samples: samples.map((s) => ({ ...s, data: Array.from(s.data), type: s.data.constructor.name })),
    wavetables: engine.getModuleWavetables() ?? [],
    ins2: collectIns2Uploads(song.instruments as never[]).map(({ slot, data }) => ({ slot, bytes: Array.from(data) })),
  };
}

describe('a restored Furnace sample-chip song', { timeout: 120000 }, () => {
  beforeAll(installFurnaceFileOpsWasm);

  it('uploads the same samples and instruments as a fresh load', async () => {
    const { importTrackerModule } = await import('@/lib/song/songBranches');
    const { snapshotSong } = await import('../snapshotSong');
    const { savedSongToApply } = await import('../savedSong');
    const { applySong } = await import('../applySong');
    const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');

    const buf = readSong(FILE);
    const file = new File([buf], 'meaningful_connection_es5506.fur');
    await importTrackerModule({
      metadata: { title: file.name, type: 'FUR', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: buf, file,
    } as never, {} as never);
    const fresh = await whatTheDispatchUploads();
    expect(fresh.samples.length).toBeGreaterThan(0);   // an ES5506 song: its sound is its samples
    expect(fresh.ins2.length).toBeGreaterThan(0);

    // The crash-recovery slot: the snapshot through JSON-safe storage, then a
    // reload (the engine singleton is new and holds nothing), then the restore.
    const saved = structuredClone(snapshotSong());
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleSamples(null);
    engine.setModuleWavetables(null);
    await applySong(savedSongToApply(saved), 'recovery');
    const restored = await whatTheDispatchUploads();

    expect(restored.samples.length).toBe(fresh.samples.length);
    expect(restored.samples).toEqual(fresh.samples);
    expect(restored.wavetables).toEqual(fresh.wavetables);
    expect(restored.ins2).toEqual(fresh.ins2);
  });

  it('survives the .dbx file route (JSON), not only structured clone', async () => {
    const { snapshotSong } = await import('../snapshotSong');
    const { savedSongToApply } = await import('../savedSong');
    const { applySong } = await import('../applySong');
    const before = await whatTheDispatchUploads();
    expect(before.samples.length).toBeGreaterThan(0);
    const json = JSON.parse(JSON.stringify(snapshotSong()));
    await applySong(savedSongToApply(json), 'project');
    const after = await whatTheDispatchUploads();
    expect(after.samples).toEqual(before.samples);
    expect(after.wavetables).toEqual(before.wavetables);
  });
});
