import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceRecorder, type VoiceRecorderDeps } from '../useVoiceRecorder';
import { DEFAULT_PITCH_SETTINGS } from '@/lib/voice/pitchNotes';
import { LIVE_HOP_SECONDS } from '@/lib/voice/liveWindow';
import type { PitchModel } from '@/lib/voice/basicPitchModel';

describe('useVoiceRecorder live preview', () => {
  afterEach(() => vi.useRealTimers());

  it('a failing live preview shows its error instead of silently freezing the ghost notes', async () => {
    vi.useFakeTimers();
    let deliver: (b: Float32Array) => void = () => {};
    const deps: VoiceRecorderDeps = {
      getStream: async () => ({}) as MediaStream,
      createCapture: () => ({
        sampleRate: 22050,
        start: async (cb) => { deliver = cb; },
        click: () => {},
        stop: () => {},
      }),
      listDevices: async () => [],
    };
    const model: PitchModel = { evaluate: async () => { throw new Error('model not loaded'); } };
    const { result } = renderHook(() => useVoiceRecorder(model, DEFAULT_PITCH_SETTINGS, deps));

    await act(async () => { await result.current.start({ countInBeats: 0, beatSeconds: 0.5 }); });
    act(() => deliver(new Float32Array(2205).fill(0.2)));
    await act(async () => { await vi.advanceTimersByTimeAsync(LIVE_HOP_SECONDS * 1000 + 1); });

    expect(result.current.error).toBe('Live preview failed: model not loaded');
    act(() => { result.current.stop(); });
  });

  it('a level-check or training take (livePreview off) never runs the pitch model, so no ghost notes appear', async () => {
    vi.useFakeTimers();
    let deliver: (b: Float32Array) => void = () => {};
    const deps: VoiceRecorderDeps = {
      getStream: async () => ({}) as MediaStream,
      createCapture: () => ({
        sampleRate: 22050,
        start: async (cb) => { deliver = cb; },
        click: () => {},
        stop: () => {},
      }),
      listDevices: async () => [],
    };
    let calls = 0;
    const model: PitchModel = { evaluate: async () => { calls++; return { frames: [], onsets: [], contours: [] }; } };
    const { result } = renderHook(() => useVoiceRecorder(model, DEFAULT_PITCH_SETTINGS, deps));

    await act(async () => { await result.current.start({ countInBeats: 0, beatSeconds: 0.5, livePreview: false }); });
    act(() => deliver(new Float32Array(2205).fill(0.2)));
    await act(async () => { await vi.advanceTimersByTimeAsync(LIVE_HOP_SECONDS * 1000 * 5); });

    expect(calls).toBe(0);
    expect(result.current.liveNotes).toEqual([]);
    act(() => { result.current.stop(); });
  });
});
