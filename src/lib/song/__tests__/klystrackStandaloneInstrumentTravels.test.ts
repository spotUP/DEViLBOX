/**
 * A standalone klystrack instrument (config.klystrack) keeps its edits through a real project save
 * (serializeProjectToBlob) and load (loadProjectFromObject): the instrument value is part of the instrument config.
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

vi.stubGlobal('Worker', class { onmessage = null; postMessage(): void {} terminate(): void {} addEventListener(): void {} });

import { setDevilboxAudioContext } from '@/utils/audio-context';
import { klysInitInstrument } from '@constants/klysPresets';

setDevilboxAudioContext({ sampleRate: 44100, currentTime: 0 } as unknown as AudioContext);

describe('a standalone klystrack instrument travels inside a saved song', { timeout: 120000 }, () => {
  it('the edited instrument value is in the saved project and is restored on load', async () => {
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { flushKlysInstrumentEdits, editKlysField } = await import('@/components/klystrack/klysInstrumentEdit');
    const { serializeProjectToBlob, loadProjectFromObject } = await import('@hooks/useProjectPersistence');
    const { decompressProject } = await import('@/lib/projectCompression');

    useInstrumentStore.getState().loadInstruments([{
      id: 3, name: 'Standalone', type: 'synth', synthType: 'KlysSynth', effects: [], volume: -8, pan: 0,
      klystrack: klysInitInstrument(),
    } as never], { skipPreload: true });
    await Promise.resolve();

    editKlysField(2, 'cutoff', 777);
    flushKlysInstrumentEdits();
    expect(useInstrumentStore.getState().instruments[0].klystrack!.cutoff).toBe(777);

    const blob = serializeProjectToBlob();
    const saved = JSON.parse(decompressProject(await blob.arrayBuffer())) as { instruments: Array<{ klystrack?: { cutoff: number } }> };
    expect(saved.instruments[0].klystrack?.cutoff).toBe(777);

    useInstrumentStore.getState().loadInstruments([], { skipPreload: true });
    await Promise.resolve();
    expect(await loadProjectFromObject(structuredClone(saved))).toBe(true);
    await Promise.resolve();
    const loaded = useInstrumentStore.getState().instruments.find((i) => i.synthType === 'KlysSynth')!;
    expect(loaded.klystrack?.cutoff).toBe(777);
    expect(loaded.klystrack?.program).toHaveLength(32);
  });
});
