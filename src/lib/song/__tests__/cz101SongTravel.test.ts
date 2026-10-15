/**
 * A CZ-101 instrument carries its own patch, so a saved song plays the same sound on a browser whose
 * User library is empty, and the patch is listed there afterwards (once, by content).
 * Goes through the real project save (serializeProjectToBlob) and load (loadProjectFromObject).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));

import { setDevilboxAudioContext } from '@/utils/audio-context';
import { encodeCzSysex, czToneBytes, czToneToBase64, CZ101_TONE_NAME_PARAM, CZ101_TONE_PARAM, decodeCzTone, czToneFromBase64 } from '@engine/cz101/cz101Sysex';
import { CZ101_PRESET_BANK } from '@engine/cz101/cz101Presets';
import { useCz101UserPatchStore, CZ101_USER_PATCH_STORE_VERSION } from '@stores/useCz101UserPatchStore';
import { czToneFromPatch } from '@engine/cz101/cz101Sysex';
import type { CZPatch } from '@engine/cz101/cz101Types';

setDevilboxAudioContext({ sampleRate: 44100, currentTime: 0 } as unknown as AudioContext);

const PATCH: CZPatch = {
  ...CZ101_PRESET_BANK[0].patch,
  name: 'Travel',
  octave: 1,
  line2: { ...CZ101_PRESET_BANK[0].patch.line1, detune: 700 },
};
const TONE = czToneToBase64(czToneBytes(encodeCzSysex(PATCH)));

const emptyLibrary = () => useCz101UserPatchStore.setState({ patches: [], nextId: 1 });

async function saveWithCzInstrument(): Promise<unknown> {
  const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
  const { serializeProjectToBlob } = await import('@hooks/useProjectPersistence');
  const { decompressProject } = await import('@/lib/projectCompression');
  useInstrumentStore.getState().loadInstruments([{
    id: 1, name: 'CZ Travel', type: 'synth', synthType: 'CZ101', effects: [], volume: -8, pan: 0,
    parameters: { _program: 0, [CZ101_TONE_PARAM]: TONE, [CZ101_TONE_NAME_PARAM]: 'Travel', volume: 0.8 },
  } as never], { skipPreload: true });
  await Promise.resolve();
  const blob = serializeProjectToBlob();
  return JSON.parse(decompressProject(await blob.arrayBuffer()));
}

describe('a CZ-101 instrument travels inside a saved song', { timeout: 120000 }, () => {
  beforeEach(emptyLibrary);

  it('the saved project holds the tone bytes, and loading it on an empty library restores the instrument and lists the patch once', async () => {
    const saved = await saveWithCzInstrument() as { instruments: { parameters: Record<string, unknown> }[]; schemaVersion: number };
    expect(saved.instruments[0].parameters[CZ101_TONE_PARAM]).toBe(TONE);

    // another browser: nothing in the User library, no instrument loaded
    emptyLibrary();
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    useInstrumentStore.getState().loadInstruments([], { skipPreload: true });
    await Promise.resolve();
    expect(useCz101UserPatchStore.getState().patches).toEqual([]);

    const { loadProjectFromObject } = await import('@hooks/useProjectPersistence');
    expect(await loadProjectFromObject(structuredClone(saved))).toBe(true);
    await Promise.resolve();

    const loaded = useInstrumentStore.getState().instruments.find((i) => i.synthType === 'CZ101')!;
    const parameters = loaded.parameters as Record<string, unknown>;
    expect(parameters[CZ101_TONE_PARAM]).toBe(TONE);
    expect(decodeCzTone(czToneFromBase64(parameters[CZ101_TONE_PARAM] as string)).patch.line2?.detune).toBeCloseTo(700, -1);
    expect(useCz101UserPatchStore.getState().patches.map((p) => [p.name, p.tone])).toEqual([['Travel', TONE]]);

    // loading it a second time does not list it twice
    expect(await loadProjectFromObject(structuredClone(saved))).toBe(true);
    await Promise.resolve();
    expect(useCz101UserPatchStore.getState().patches.length).toBe(1);
  });

  it('a library entry of another name for the same sound is not duplicated, and keeps its own name', () => {
    useCz101UserPatchStore.getState().addTones([{ name: 'My Name', tone: TONE }]);
    useCz101UserPatchStore.getState().addTones([{ name: 'Travel', tone: TONE }]);
    expect(useCz101UserPatchStore.getState().patches.map((p) => p.name)).toEqual(['My Name']);
  });

  it('the stored library of the first release (decoded patches, version 1) migrates to tone bytes', () => {
    const persist = (useCz101UserPatchStore as unknown as { persist: { getOptions: () => { migrate: (s: unknown, v: number) => { patches: { id: number; name: string; tone: string }[] } } } }).persist;
    const migrated = persist.getOptions().migrate({ patches: [{ id: 3, name: 'Old', patch: PATCH }], nextId: 4 }, 1);
    expect(CZ101_USER_PATCH_STORE_VERSION).toBe(2);
    expect(migrated.patches).toEqual([{ id: 3, name: 'Old', tone: czToneToBase64(czToneFromPatch(PATCH)) }]);
  });
});
