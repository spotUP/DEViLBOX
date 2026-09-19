/**
 * X17 — the dub bus and EQ sliders sat still while the performer worked.
 *
 * Reported 2026-09-19: "i see no action in the eq and dub bus sliders at all
 * they use to move". I closed this once as a symptom of the idle-performer bug
 * and was wrong — the user confirmed the sliders were STILL dead after that
 * fix. This is the actual cause.
 *
 * Dub moves modulate the audio nodes directly, which is deliberate: routing
 * every gesture through the store would put a React render inside an
 * audio-rate path. The cost is that nothing tells the UI. Only
 * `dub.channelSend.chN` ever announced itself — which is exactly why the
 * channel faders always moved and nothing else did.
 *
 * `DubBus.announce` is the publish half; this is the subscribe half.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveDubParam } from '../useLiveDubParam';
import { fireParamLiveSubscribers } from '@/midi/performance/parameterRouter';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('a control follows the move that is modulating it', () => {
  it('rests at the value the user set', () => {
    const { result } = renderHook(() => useLiveDubParam('dub.echoIntensity', 0.55));
    expect(result.current).toBe(0.55);
  });

  it('moves when the bus announces a modulation', () => {
    const { result } = renderHook(() => useLiveDubParam('dub.echoIntensity', 0.55));
    act(() => { fireParamLiveSubscribers('dub.echoIntensity', 0.9); });
    expect(result.current).toBeCloseTo(0.9, 6);
  });

  it('returns to the user value once the move lets go', () => {
    const { result } = renderHook(() => useLiveDubParam('dub.echoIntensity', 0.55));
    act(() => { fireParamLiveSubscribers('dub.echoIntensity', 0.9); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(0.55);
  });

  it('keeps following while a move is still announcing', () => {
    const { result } = renderHook(() => useLiveDubParam('dub.echoIntensity', 0.55));
    for (const v of [0.7, 0.8, 0.9]) {
      act(() => { fireParamLiveSubscribers('dub.echoIntensity', v); });
      act(() => { vi.advanceTimersByTime(100); });
    }
    expect(result.current).toBeCloseTo(0.9, 6);
  });

  it('ignores announcements for a different control', () => {
    const { result } = renderHook(() => useLiveDubParam('dub.echoIntensity', 0.55));
    act(() => { fireParamLiveSubscribers('dub.springWet', 0.2); });
    expect(result.current).toBe(0.55);
  });
});

describe('controls in their own units', () => {
  it('maps the announced 0..1 through the caller mapping', () => {
    // The HPF slider reads hertz; the router defines the control as
    // 20 + n * 980.
    const { result } = renderHook(
      () => useLiveDubParam('dub.hpfCutoff', 65, (n) => 20 + n * 980),
    );
    act(() => { fireParamLiveSubscribers('dub.hpfCutoff', 0.5); });
    expect(result.current).toBeCloseTo(510, 6);
  });

  it('refuses a value that is not a number rather than blanking the control', () => {
    const { result } = renderHook(
      () => useLiveDubParam('dub.hpfCutoff', 65, () => Number.NaN),
    );
    act(() => { fireParamLiveSubscribers('dub.hpfCutoff', 0.5); });
    expect(result.current).toBe(65);
  });
});

describe('it lets go cleanly', () => {
  it('unsubscribes on unmount', () => {
    const { unmount, result } = renderHook(
      () => useLiveDubParam('dub.echoIntensity', 0.55),
    );
    unmount();
    // No subscriber left to throw into, and no pending timer to fire.
    expect(() => fireParamLiveSubscribers('dub.echoIntensity', 0.9)).not.toThrow();
    expect(result.current).toBe(0.55);
  });
});
