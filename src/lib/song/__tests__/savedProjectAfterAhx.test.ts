/**
 * A saved project loads as a whole song: its own editor mode, its mixer.
 *
 * The three project restores (boot / recovery, file, revision) and the
 * loader's .dbx branch each applied a project by hand (2026-09-29 audit).
 * None reset the editor mode unless the project had native engine data -
 * restoreNativeEngineData returned early - so a project saved from a MOD,
 * opened after an AHX, came up in the AHX editor. The .dbx branch also
 * dropped the mixer. All four now go savedSongToApply -> applySong.
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
