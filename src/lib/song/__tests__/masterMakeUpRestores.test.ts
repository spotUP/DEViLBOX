/**
 * A restored master chain keeps the make-up gain it was calibrated with (FX4, 2026-10-08).
 *
 * Seen live: the owner's chain read 4.5 dB under an empty chain. It was
 * "Big Room" (MVerb, StereoWidener, Compressor, EQ3), which carries a +4.6 dB
 * make-up, and a measured chain without its make-up is exactly that much
 * quieter. get_audio_state (the app's own store) showed the chain after a
 * reload with presetGainCompensationDb 0: the make-up lived only in the store,
 * never in the autosave or project, so every restore played the chain without
 * it. The save now carries it, the restore sets it, and the chain key rebuilds
 * the chain when only the make-up changes.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(), ensureInstrumentReady: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

import { openSong } from '@/lib/song/openSong';
import { setDevilboxAudioContext } from '@/utils/audio-context';

setDevilboxAudioContext({ sampleRate: 44100, currentTime: 0 } as unknown as AudioContext);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const bytesOf = (rel: string): ArrayBuffer => {
  const b = readFileSync(resolve(ROOT, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

import { masterChainKey } from '@/utils/masterChainKey';
import { FX_PRESETS } from '@/constants/fxPresets';

describe('the master chain make-up gain survives a save and a restore', () => {
  it('a restored preset chain plays with the make-up it was measured for', async () => {
    const { snapshotSong } = await import('@/lib/song/snapshotSong');
    const { applySavedProject } = await import('@hooks/useProjectPersistence');
    const { CURRENT_SCHEMA } = await import('@/lib/persistence/migrations');
    const { useAudioStore } = await import('@/stores/useAudioStore');
    const rel = 'public/data/songs/sid/abaddon-starfish-test.sid';
    const r = await openSong({ kind: 'bytes', name: basename(rel), bytes: bytesOf(rel) }, { origin: 'mcp' });
    expect(r.ok).toBe(true);

    const preset = FX_PRESETS.find((p) => p.name === 'Big Room')!;
    expect(preset.gainCompensationDb).toBeGreaterThan(3);
    const effects = preset.effects.map((fx, i) => ({ ...fx, id: `master-fx-1-${i}` }));
    useAudioStore.getState().setMasterEffects(effects as never, preset.gainCompensationDb);

    const saved = structuredClone({ version: '1.0.0', schemaVersion: CURRENT_SCHEMA, savedAt: '', ...snapshotSong() });
    useAudioStore.getState().setMasterEffects([], 0);
    expect(await applySavedProject(saved as never, { fromRecovery: true })).toBe(true);

    expect(useAudioStore.getState().masterEffects.map((e) => e.type)).toEqual(preset.effects.map((e) => e.type));
    expect(useAudioStore.getState().presetGainCompensationDb).toBe(preset.gainCompensationDb);
  }, 120000);

  it('a save of a chain without make-up restores none', async () => {
    const { snapshotSong } = await import('@/lib/song/snapshotSong');
    const { applySavedProject } = await import('@hooks/useProjectPersistence');
    const { CURRENT_SCHEMA } = await import('@/lib/persistence/migrations');
    const { useAudioStore } = await import('@/stores/useAudioStore');
    useAudioStore.getState().setMasterEffects([{ id: 'a', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: {} }] as never, 0);
    const saved = structuredClone({ version: '1.0.0', schemaVersion: CURRENT_SCHEMA, savedAt: '', ...snapshotSong() });
    useAudioStore.getState().setMasterEffects([], 3);
    expect(await applySavedProject(saved as never, { fromRecovery: true })).toBe(true);
    expect(useAudioStore.getState().presetGainCompensationDb).toBe(0);
  }, 120000);
});

describe('the master chain is rebuilt when only its make-up gain changes', () => {
  const fx = [{ id: 'a', category: 'tonejs', type: 'EQ3', enabled: true, wet: 100, parameters: {} }] as never;
  it('same effects, different make-up: different key', () => {
    expect(masterChainKey(fx, 4.6)).not.toBe(masterChainKey(fx, 0));
  });
  it('same effects, same make-up: same key (a parameter change does not rebuild)', () => {
    expect(masterChainKey(fx, 4.6)).toBe(masterChainKey(fx, 4.6));
  });
});
