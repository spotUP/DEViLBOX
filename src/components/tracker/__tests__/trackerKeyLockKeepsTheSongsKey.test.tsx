/**
 * TRACKER-KEY-LOCK: the tracker view's pitch slider got the DJ deck's Key Lock.
 * With Key Lock on, the slider changes tempo only; pitch stays at the song's key.
 *
 * One reachability test through the real entry point: the slider component ->
 * the transport store -> PatternScheduler.setGlobalPitchOffset -> the engines.
 * The engines are recording fakes; the tempo/pitch decision is the real shared
 * computeTempoPitchSplit(), wrapped so the test can prove it ran.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';

const engineState = vi.hoisted(() => ({
  globalPlaybackRate: 1,
  globalDetune: 0,
  synthBusRate: 1,
  tempoMultiplier: 1,
  updateAllPlaybackRates: 0,
  splitCalls: 0,
  mptTempo: 1,
  mptPitch: 1,
}));

vi.mock('@engine/libopenmpt/LibopenmptEngine', () => ({
  LibopenmptEngine: {
    hasInstance: () => true,
    getInstance: () => ({
      setTempoFactor: (f: number) => { engineState.mptTempo = f; },
      setPitchFactor: (f: number) => { engineState.mptPitch = f; },
    }),
  },
}));

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => ({
    setGlobalPlaybackRate: (r: number) => { engineState.globalPlaybackRate = r; },
    getGlobalPlaybackRate: () => engineState.globalPlaybackRate,
    setGlobalDetune: (c: number) => { engineState.globalDetune = c; },
    setSynthBusPitchRate: (r: number) => { engineState.synthBusRate = r; },
    setBPM: () => {},
    releaseAll: () => {},
    getWasmInstance: () => null,
  }),
}));

vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => ({
    setTempoMultiplier: (m: number) => { engineState.tempoMultiplier = m; },
    updateAllPlaybackRates: () => { engineState.updateAllPlaybackRates++; },
    getC64SIDEngine: () => null,
  }),
}));

vi.mock('@engine/dj/computeKeyLockShift', async (importActual) => {
  const actual = await importActual<typeof import('@engine/dj/computeKeyLockShift')>();
  return {
    ...actual,
    computeTempoPitchSplit: (s: number, k: boolean) => {
      engineState.splitCalls++;
      return actual.computeTempoPitchSplit(s, k);
    },
  };
});

import { DJPitchSlider } from '@components/transport/DJPitchSlider';
import { useTransportStore } from '@stores/useTransportStore';

const pointer = (clientY: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: 0, clientY });

/** Drag the fader from its rest position to the top (+16 st, clamped). */
function dragToTop(container: HTMLElement): void {
  const surface = container.querySelector('.cursor-ns-resize') as HTMLElement;
  fireEvent.pointerDown(surface, pointer(500));
  fireEvent.pointerMove(surface, pointer(0));
  fireEvent.pointerUp(surface, pointer(0));
}

beforeEach(() => {
  cleanup();
  Object.assign(engineState, {
    globalPlaybackRate: 1, globalDetune: 0, synthBusRate: 1, tempoMultiplier: 1,
    updateAllPlaybackRates: 0, splitCalls: 0, mptTempo: 1, mptPitch: 1,
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value() {} });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value() {} });
  // A 200 px track: 500 -> 0 is far more than the full range, so the fader pins at +16.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 200; } });
  useTransportStore.setState({ globalPitch: 0, trackerKeyLock: false, bpm: 140 });
});

describe('tracker pitch slider Key Lock', () => {
  it('Key Lock on: the slider moves tempo, sample rate and synth detune stay at the song key', async () => {
    const { container } = render(<DJPitchSlider />);

    fireEvent.click(screen.getByRole('button', { name: 'Key Lock' }));
    expect(useTransportStore.getState().trackerKeyLock).toBe(true);

    dragToTop(container);

    const tempo16 = Math.pow(2, 16 / 12);
    expect(useTransportStore.getState().globalPitch).toBe(16);
    expect(engineState.splitCalls).toBeGreaterThan(0);              // the shared decision ran
    expect(engineState.tempoMultiplier).toBeCloseTo(tempo16, 6);     // tempo follows the slider
    expect(engineState.globalPlaybackRate).toBe(1);                  // samples stay in key
    expect(engineState.globalDetune).toBe(0);                        // synths stay in key
    expect(engineState.synthBusRate).toBe(1);                        // WASM/native bus stays in key
    expect(engineState.updateAllPlaybackRates).toBeGreaterThan(0);   // playing samples were re-rated
    expect(useTransportStore.getState().bpm).toBe(140);              // the song's own BPM is kept
    // LibOpenMPT-rendered songs split natively: tempo factor follows, pitch factor stays 1
    await vi.waitFor(() => expect(engineState.mptTempo).toBeCloseTo(tempo16, 6), { timeout: 10_000 });
    expect(engineState.mptPitch).toBe(1);
  });

  it('Key Lock off: the slider is a varispeed, pitch follows the tempo', async () => {
    const { container } = render(<DJPitchSlider />);
    dragToTop(container);

    const tempo16 = Math.pow(2, 16 / 12);
    expect(engineState.tempoMultiplier).toBeCloseTo(tempo16, 6);
    expect(engineState.globalPlaybackRate).toBeCloseTo(tempo16, 6);
    expect(engineState.globalDetune).toBe(1600);
    expect(engineState.synthBusRate).toBeCloseTo(tempo16, 6);
    await vi.waitFor(() => expect(engineState.mptPitch).toBeCloseTo(tempo16, 6), { timeout: 10_000 });
    expect(engineState.mptTempo).toBeCloseTo(tempo16, 6);
  });

  it('turning Key Lock on while the slider is up returns the pitch to the song key at once', () => {
    const { container } = render(<DJPitchSlider />);
    dragToTop(container);
    expect(engineState.globalPlaybackRate).not.toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Key Lock' }));

    expect(engineState.globalPlaybackRate).toBe(1);
    expect(engineState.globalDetune).toBe(0);
    expect(engineState.tempoMultiplier).toBeCloseTo(Math.pow(2, 16 / 12), 6);
  });
});
