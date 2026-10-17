import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_TAKES, useVoiceStore } from '../useVoiceStore';
import { LATENCY_STORAGE_KEY } from '@/lib/voice/latencyCalibration';
import { MELODY_RANGE_STORAGE_KEY } from '@/lib/voice/pitchNotes';
import { DEFAULT_SEGMENT_SETTINGS } from '@/lib/voice/segmentNotes';

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
    s.setSamples([{ drum: 'kick', features: { low: 1, mid: 0, high: 0, decay: 0.2, zcr: 0.01, bursts: 1, bands: [1, 0, 0, 0, 0, 0, 0, 0], centroid: 0.01, flatness: 0, attack: 0 } }]);
    s.setTraining(null);
    useVoiceStore.getState().reset();
    expect(useVoiceStore.getState().samples).toHaveLength(1);
    expect(useVoiceStore.getState().training).toBeNull();
  });

  it('the singer range survives a reload; a broken stored range falls back to the default', () => {
    useVoiceStore.getState().patchFine({ minMidiNote: 52, maxMidiNote: 74, transpose: 12 });
    useVoiceStore.getState().reset();
    const { fine } = useVoiceStore.getState();
    expect([fine.minMidiNote, fine.maxMidiNote, fine.transpose]).toEqual([52, 74, 12]);
    localStorage.setItem(MELODY_RANGE_STORAGE_KEY, JSON.stringify({ minMidiNote: 80, maxMidiNote: 40, transpose: 0 }));
    useVoiceStore.getState().reset();
    expect(useVoiceStore.getState().fine.minMidiNote).toBe(DEFAULT_SEGMENT_SETTINGS.minMidiNote);
    expect(useVoiceStore.getState().fine.maxMidiNote).toBe(DEFAULT_SEGMENT_SETTINGS.maxMidiNote);
  });

  it('changing the microphone reloads its stored latency', () => {
    localStorage.setItem(LATENCY_STORAGE_KEY, JSON.stringify({ mic1: 120 }));
    useVoiceStore.getState().setDeviceId('mic1');
    expect(useVoiceStore.getState().calibratedMs).toBe(120);
  });
});
