/**
 * Preset-aware bassLock round-trip.
 *
 * `EffectConfig.bassLock` is optional — undefined falls back to the
 * per-type default in `bassLockDefaults.ts`. When a preset explicitly
 * sets `bassLock: true` or `bassLock: false` on one of its effects,
 * that override MUST survive the preset → `addMasterEffectConfig`
 * → `masterEffects` store → `effectiveBassLock()` round-trip.
 *
 * Without this test, a future refactor that filters unknown fields
 * out of the preset spread (e.g. swapping `...effect` for a
 * whitelist) would silently drop the override and every preset would
 * revert to per-type defaults — invisible to the user.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAudioStore } from '../../../stores/useAudioStore';
import { effectiveBassLock, getDefaultBassLock } from '../bassLockDefaults';
import type { EffectConfig } from '@typedefs/instrument';

// Stub rAF so batched store writes fire synchronously
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });

describe('bassLock — preset round-trip via addMasterEffectConfig', () => {
  beforeEach(() => {
    // Clear master effects between tests.
    const fx = useAudioStore.getState().masterEffects;
    for (const e of [...fx]) useAudioStore.getState().removeMasterEffect(e.id);
  });

  it('per-type default applies when bassLock is undefined (reverb → ON)', () => {
    const preset: Omit<EffectConfig, 'id'> = {
      category: 'wasm',
      type: 'DattorroPlate',
      enabled: true,
      wet: 50,
      parameters: {},
    };
    useAudioStore.getState().addMasterEffectConfig(preset);
    const added = useAudioStore.getState().masterEffects[0];
    expect(added.bassLock).toBeUndefined();
    expect(effectiveBassLock(added.type, added.bassLock)).toBe(true);
    expect(getDefaultBassLock('DattorroPlate')).toBe(true);
  });

  it('per-type default applies when bassLock is undefined (distortion → OFF)', () => {
    const preset: Omit<EffectConfig, 'id'> = {
      category: 'tonejs',
      type: 'Distortion',
      enabled: true,
      wet: 100,
      parameters: { drive: 0.4 },
    };
    useAudioStore.getState().addMasterEffectConfig(preset);
    const added = useAudioStore.getState().masterEffects[0];
    expect(effectiveBassLock(added.type, added.bassLock)).toBe(false);
  });

  it('explicit bassLock: false on a reverb preset overrides the ON default', () => {
    // Unusual but legitimate — a preset that wants a reverb to process the
    // low end (e.g. a pad-wash preset where the sub IS supposed to ring out).
    const preset: Omit<EffectConfig, 'id'> = {
      category: 'wasm',
      type: 'MadProfessorPlate',
      enabled: true,
      wet: 60,
      parameters: {},
      bassLock: false,
    };
    useAudioStore.getState().addMasterEffectConfig(preset);
    const added = useAudioStore.getState().masterEffects[0];
    expect(added.bassLock, 'preset bassLock override must survive the store roundtrip').toBe(false);
    expect(effectiveBassLock(added.type, added.bassLock), 'explicit false wins over per-type default ON').toBe(false);
  });

  it('explicit bassLock: true on a distortion preset overrides the OFF default', () => {
    // Also legitimate — a preset where distortion is used purely for color
    // on the mids and the sub should stay clean.
    const preset: Omit<EffectConfig, 'id'> = {
      category: 'tonejs',
      type: 'Distortion',
      enabled: true,
      wet: 100,
      parameters: { drive: 0.4 },
      bassLock: true,
    };
    useAudioStore.getState().addMasterEffectConfig(preset);
    const added = useAudioStore.getState().masterEffects[0];
    expect(added.bassLock).toBe(true);
    expect(effectiveBassLock(added.type, added.bassLock)).toBe(true);
  });

  it('updateMasterEffect can flip bassLock after load (UI toggle path)', () => {
    const preset: Omit<EffectConfig, 'id'> = {
      category: 'wasm',
      type: 'DattorroPlate',
      enabled: true,
      wet: 50,
      parameters: {},
    };
    useAudioStore.getState().addMasterEffectConfig(preset);
    const { id } = useAudioStore.getState().masterEffects[0];
    useAudioStore.getState().updateMasterEffect(id, { bassLock: false });
    const after = useAudioStore.getState().masterEffects[0];
    expect(after.bassLock).toBe(false);
    expect(effectiveBassLock(after.type, after.bassLock)).toBe(false);
  });
});
