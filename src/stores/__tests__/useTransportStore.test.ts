import { describe, it, expect, beforeEach } from 'vitest';
import { useTransportStore } from '../useTransportStore';
import { resetStore } from './_harness';

describe('useTransportStore — clamping and pure state', () => {
  beforeEach(() => resetStore(useTransportStore));

  it('starts stopped with a defined BPM and speed', () => {
    const s = useTransportStore.getState();
    expect(s.isPlaying).toBe(false);
    expect(s.isPaused).toBe(false);
    expect(s.bpm).toBeGreaterThan(0);
    expect(s.speed).toBeGreaterThanOrEqual(1);
  });

  it('setGlobalPitch clamps to [-16, +16] semitones', () => {
    const { setGlobalPitch } = useTransportStore.getState();
    setGlobalPitch(20);
    expect(useTransportStore.getState().globalPitch).toBe(16);
    setGlobalPitch(-42);
    expect(useTransportStore.getState().globalPitch).toBe(-16);
    setGlobalPitch(3);
    expect(useTransportStore.getState().globalPitch).toBe(3);
  });

  it('setJitter clamps to [0, 100] percent', () => {
    const { setJitter } = useTransportStore.getState();
    setJitter(250);
    expect(useTransportStore.getState().jitter).toBe(100);
    setJitter(-5);
    expect(useTransportStore.getState().jitter).toBe(0);
    setJitter(35);
    expect(useTransportStore.getState().jitter).toBe(35);
  });

  it('setSmoothScrolling toggles without touching other fields', () => {
    const bpmBefore = useTransportStore.getState().bpm;
    useTransportStore.getState().setSmoothScrolling(true);
    expect(useTransportStore.getState().smoothScrolling).toBe(true);
    expect(useTransportStore.getState().bpm).toBe(bpmBefore);
    useTransportStore.getState().setSmoothScrolling(false);
    expect(useTransportStore.getState().smoothScrolling).toBe(false);
  });

  it('setMetronomeVolume clamps into [0, 100]', () => {
    const { setMetronomeVolume } = useTransportStore.getState();
    setMetronomeVolume(250);
    const v = useTransportStore.getState().metronomeVolume;
    expect(v).toBeLessThanOrEqual(100);
    expect(v).toBeGreaterThanOrEqual(0);
    setMetronomeVolume(-5);
    const v2 = useTransportStore.getState().metronomeVolume;
    expect(v2).toBeGreaterThanOrEqual(0);
  });

  it('toggleMetronome flips the enabled flag', () => {
    const before = useTransportStore.getState().metronomeEnabled;
    useTransportStore.getState().toggleMetronome();
    expect(useTransportStore.getState().metronomeEnabled).toBe(!before);
    useTransportStore.getState().toggleMetronome();
    expect(useTransportStore.getState().metronomeEnabled).toBe(before);
  });

  it('setTimeSignature stores the [numerator, denominator] tuple', () => {
    useTransportStore.getState().setTimeSignature(7, 8);
    expect(useTransportStore.getState().timeSignature).toEqual([7, 8]);
    useTransportStore.getState().setTimeSignature(3, 4);
    expect(useTransportStore.getState().timeSignature).toEqual([3, 4]);
  });
});
