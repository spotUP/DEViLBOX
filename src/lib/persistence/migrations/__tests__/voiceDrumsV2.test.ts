import { beforeEach, describe, expect, it } from 'vitest';
import { DRUMS_RESET_KEY, V1_DRUM_KEYS, drumsResetPending, migrateVoiceDrumsV2 } from '../voiceDrumsV2';
import { DRUM_SAMPLES_KEY } from '@/lib/voice/drumModel';
import { markVoiceSetupSeen, shouldOpenVoiceSetup, storeLatencyMs } from '@/lib/voice/latencyCalibration';
import { useVoiceStore } from '@/stores/useVoiceStore';

describe('voice drums v1 to v2 migration (WD-4)', () => {
  beforeEach(() => localStorage.clear());

  it('removes v1 training and opens the setup wizard once, even after setup was done', () => {
    localStorage.setItem(V1_DRUM_KEYS[0], JSON.stringify({ version: 1, samples: [{ drum: 'kick', features: { low: 1 } }] }));
    localStorage.setItem(V1_DRUM_KEYS[1], '{}');
    storeLatencyMs('', 90);
    expect(shouldOpenVoiceSetup()).toBe(false);
    useVoiceStore.getState().reset(); // the store's fresh state runs the migration
    for (const k of V1_DRUM_KEYS) expect(localStorage.getItem(k)).toBeNull();
    expect(useVoiceStore.getState().samples).toEqual([]);
    expect(localStorage.getItem(DRUM_SAMPLES_KEY)).toBeNull();
    expect(drumsResetPending()).toBe(true);
    expect(shouldOpenVoiceSetup()).toBe(true);
    markVoiceSetupSeen();
    expect(localStorage.getItem(DRUMS_RESET_KEY)).toBeNull();
    expect(shouldOpenVoiceSetup()).toBe(false);
  });

  it('does nothing without v1 keys and survives unavailable storage', () => {
    expect(migrateVoiceDrumsV2()).toBe(false);
    expect(drumsResetPending()).toBe(false);
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    try {
      expect(migrateVoiceDrumsV2()).toBe(false);
      expect(drumsResetPending()).toBe(false);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
