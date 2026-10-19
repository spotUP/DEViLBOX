/**
 * An UpRoughSoftsynth instrument (voice + per-voice params + seed) travels through snapshotSong ->
 * savedSongToApply -> applySong unchanged: the instrument config is stored whole, no per-synth code.
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
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
vi.mock('@/stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

// The sparse worktree has no scratch pack metadata JSON; the catalogue is not part of this property.
vi.mock('@/engine/dj/scratch/scratchCatalogue', () => ({
  SCRATCH_METADATA_RATE: 22050, SCRATCH_PACK_DIR: '', SCRATCH_RECORDS: [], CRATE_LOAD_ORDER: [], SYNTH_SOURCE_NAMES: [],
  referenceRoleToScratchRoles: () => [], referenceStyleToScratchStyle: () => undefined,
}));

vi.stubGlobal('Worker', class { onmessage = null; postMessage(): void {} terminate(): void {} addEventListener(): void {} });

import { setDevilboxAudioContext } from '@/utils/audio-context';

setDevilboxAudioContext({ sampleRate: 44100, currentTime: 0 } as unknown as AudioContext);

describe('an UpRoughSoftsynth instrument travels inside a saved song', { timeout: 120000 }, () => {
  it('voice, params and seed survive snapshotSong -> savedSongToApply -> applySong', async () => {
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { snapshotSong } = await import('@/lib/song/snapshotSong');
    const { savedSongToApply } = await import('@/lib/song/savedSong');
    const { applySong } = await import('@/lib/song/applySong');
    const { getSoftsynthVoice } = await import('@/engine/uprough/voiceRegistry');
    const { voiceDefaults } = await import('@/engine/uprough/softsynthVoice');

    const voice = getSoftsynthVoice('kick')!;
    const params = { ...voiceDefaults(voice), [voice.params[0]!.key]: voice.params[0]!.default + 0.37 };
    const cfg = { voice: 'kick', params, seed: 1234 };

    useInstrumentStore.getState().loadInstruments([{
      id: 5, name: 'Softsynth', type: 'synth', synthType: 'UpRoughSoftsynth', effects: [], volume: -6, pan: 0,
      upRoughSoftsynth: cfg,
    } as never], { skipPreload: true });
    await Promise.resolve();

    const saved = structuredClone(snapshotSong());
    useInstrumentStore.getState().loadInstruments([], { skipPreload: true });
    await Promise.resolve();
    expect(useInstrumentStore.getState().instruments.find((i) => i.synthType === 'UpRoughSoftsynth')).toBeUndefined();

    await applySong(savedSongToApply(saved), 'project');
    await Promise.resolve();
    const loaded = useInstrumentStore.getState().instruments.find((i) => i.synthType === 'UpRoughSoftsynth')!;
    expect(loaded.upRoughSoftsynth).toEqual(cfg);
  });
});
