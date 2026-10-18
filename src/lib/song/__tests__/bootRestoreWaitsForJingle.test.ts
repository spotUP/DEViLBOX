/**
 * "the jingle dont animate when i dismiss the modal now" / "it does still not
 * show 12 channels" (2026-10-18).
 *
 * The startup jingle draws its lips as overlay channels in the current pattern
 * (injectMouthPatterns). The silent boot restore opens the saved song through
 * openSong's stored-song branch, which returned before the jingle gate, so a
 * restore landing while the jingle played replaced the 12 lip channels with the
 * restored pattern and the animation drew into channels that no longer existed.
 * A stored-song open now waits for the jingle like every other tracker load.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(), ensureInstrumentReady: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

import { setDevilboxAudioContext } from '@/utils/audio-context';
setDevilboxAudioContext({ sampleRate: 44100, currentTime: 0 } as unknown as AudioContext);

const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0)); };

describe('the boot restore waits for the startup jingle', () => {
  it('a restored song does not land in the tracker until the jingle ends', async () => {
    const { snapshotSong } = await import('@/lib/song/snapshotSong');
    const { applySavedProject } = await import('@hooks/useProjectPersistence');
    const { CURRENT_SCHEMA } = await import('@/lib/persistence/migrations');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const { useUIStore } = await import('@/stores/useUIStore');

    // The saved project: a song with 6 channels.
    useTrackerStore.getState().addOverlayChannels(6);
    const saved = structuredClone({ version: '1.0.0', schemaVersion: CURRENT_SCHEMA, savedAt: '', ...snapshotSong() });
    expect(saved.patterns[0].channels.length).toBe(6);

    // The jingle is playing with its 12 lip channels in the tracker.
    useTrackerStore.getState().addOverlayChannels(12);
    useUIStore.getState().setStartupJingleStage('playing');

    let done = false;
    const restore = applySavedProject(saved as never, { fromRecovery: true }).then((ok) => { done = true; return ok; });
    await flush();
    expect(done).toBe(false);
    expect(useTrackerStore.getState().patterns[0].channels.length).toBe(12);

    // The jingle ends: the restore lands.
    useUIStore.getState().setStartupJingleStage('done');
    expect(await restore).toBe(true);
    expect(useTrackerStore.getState().patterns[0].channels.length).toBe(6);
  });
});
