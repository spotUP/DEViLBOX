import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_TAKES, useVoiceStore } from '../useVoiceStore';
import { LATENCY_STORAGE_KEY } from '@/lib/voice/latencyCalibration';

function audio(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * 22050));
}

describe('useVoiceStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useVoiceStore.getState().reset();
  });

  it('keeps the newest 8 takes and makes the newest current', () => {
    const { addTake } = useVoiceStore.getState();
    for (let i = 1; i <= 11; i++) addTake({ mode: 'melody', audio: audio(i), track: null, hits: [] });
    const { takes, take } = useVoiceStore.getState();
    expect(takes).toHaveLength(MAX_TAKES);
    expect(takes[0].seconds).toBeCloseTo(11, 3);
    expect(take?.id).toBe(takes[0].id);
  });

  it('useTake brings an earlier take back with its mode', () => {
    const { addTake } = useVoiceStore.getState();
    const drums = addTake({ mode: 'drums', audio: audio(1), track: null, hits: [] });
    addTake({ mode: 'melody', audio: audio(2), track: null, hits: [] });
    useVoiceStore.getState().useTake(drums.id);
    expect(useVoiceStore.getState().take?.id).toBe(drums.id);
    expect(useVoiceStore.getState().mode).toBe('drums');
  });

  it('patchFine merges nested effect toggles without dropping the rest', () => {
    const { patchFine } = useVoiceStore.getState();
    patchFine({ strength: 0.5 });
    patchFine({ effects: { ...useVoiceStore.getState().fine.effects, vibrato: false } });
    const { fine } = useVoiceStore.getState();
    expect(fine.strength).toBe(0.5);
    expect(fine.effects.vibrato).toBe(false);
    expect(fine.effects.slides).toBe(true);
  });

  it('persists training samples and result through drumModel storage', () => {
    const s = useVoiceStore.getState();
    s.setSamples([{ drum: 'kick', features: { low: 1, mid: 0, high: 0, decay: 0.2, zcr: 0.01, bursts: 1 } }]);
    s.setTraining(null);
    useVoiceStore.getState().reset();
    expect(useVoiceStore.getState().samples).toHaveLength(1);
    expect(useVoiceStore.getState().training).toBeNull();
  });

  it('changing the microphone reloads its stored latency', () => {
    localStorage.setItem(LATENCY_STORAGE_KEY, JSON.stringify({ mic1: 120 }));
    useVoiceStore.getState().setDeviceId('mic1');
    expect(useVoiceStore.getState().calibratedMs).toBe(120);
  });
});
