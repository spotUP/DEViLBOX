/**
 * A saved project loads as a whole song: its own editor mode, its mixer, its
 * dub bus.
 *
 * The three project restores (boot / recovery, file, revision) and the
 * loader's .dbx branch each applied a project by hand (2026-09-29 audit).
 * None reset the editor mode unless the project had native engine data -
 * restoreNativeEngineData returned early - so a project saved from a MOD,
 * opened after an AHX, came up in the AHX editor. The .dbx branch also
 * dropped the mixer. All four now go savedSongToApply -> applySong.
 *
 * The dub bus is here for a different reason: a project saved while the bus's
 * return was closed used to restore a bus that could not be heard, and it
 * overwrote the repair the localStorage boot path had just made (2026-10-01).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
// The CED instrument classifier runs in a web worker; no worker server in node.
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

describe('a saved project after an AHX', () => {
  it('opens in the classic editor with no AHX data and its own mixer', async () => {
    const { useFormatStore } = await import('@/stores/useFormatStore');
    const { useMixerStore } = await import('@stores/useMixerStore');
    const { makeEmptyTestSnapshot, loadProjectFromObject } = await import('@hooks/useProjectPersistence');

    // A plain (MOD-like) project whose mixer has channel 1 at 37 %.
    const project = makeEmptyTestSnapshot() as unknown as Record<string, unknown>;
    project.patterns = [{ id: 'p0', name: 'P0', length: 64, channels: [] }];
    project.mixer = { channels: [{ volume: 0.37 }] };
    delete project.nativeEngineData;
    delete project.nativeEngineMeta;

    // The AHX that was playing before.
    useFormatStore.getState().applyEditorMode({
      hivelyNative: { song: {} } as never,
      hivelyFileData: new ArrayBuffer(16),
    });
    expect(useFormatStore.getState().editorMode).toBe('hively');

    expect(await loadProjectFromObject(project)).toBe(true);
    const s = useFormatStore.getState();
    expect(s.editorMode).toBe('classic');
    expect(s.hivelyNative).toBeNull();
    expect(useMixerStore.getState().channels[0]?.volume).toBeCloseTo(0.37);
  }, 30000);
});

describe('a project saved with the dub bus return closed', () => {
  it('opens with a tail it can be heard through', async () => {
    const { useDrumPadStore } = await import('@/stores/useDrumPadStore');
    const { DEFAULT_DUB_BUS } = await import('@/types/dub');
    const { makeEmptyTestSnapshot, loadProjectFromObject } = await import('@/hooks/useProjectPersistence');

    // The CC47-53 wet bank dumped to its minimums, as it was on disk on
    // 2026-10-01. springWet at maximum proves the file's own values loaded
    // rather than the store falling back to factory wholesale.
    const project = makeEmptyTestSnapshot() as unknown as Record<string, unknown>;
    project.patterns = [{ id: 'p0', name: 'P0', length: 64, channels: [] }];
    project.dubBus = { ...DEFAULT_DUB_BUS, returnGain: 0, echoWet: 0, echoIntensity: 0, springWet: 1 };
    delete project.nativeEngineData;
    delete project.nativeEngineMeta;

    expect(await loadProjectFromObject(project)).toBe(true);

    const dubBus = useDrumPadStore.getState().dubBus;
    expect(dubBus.returnGain).toBe(DEFAULT_DUB_BUS.returnGain);
    expect(dubBus.echoWet).toBe(DEFAULT_DUB_BUS.echoWet);
    expect(dubBus.springWet).toBe(1);
  }, 30000);
});
