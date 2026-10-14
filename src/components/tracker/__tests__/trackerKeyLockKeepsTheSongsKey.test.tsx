/**
 * TRACKER-KEY-LOCK: the tracker view's pitch slider got the DJ deck's Key Lock.
 * With Key Lock on, the slider changes tempo only; pitch stays at the song's key.
 *
 * One reachability test through the real entry points: the slider component
 * (and the MCP set_global_pitch tool) -> the transport store ->
 * installPitchStateSync -> PatternScheduler.applyPitchState -> the engines,
 * including a whole-song WASM engine through its registry capability
 * (PITCH-SLIDER-ALL-FORMATS: Hively, AHX/HVL).
 * The engines are recording fakes; the tempo/pitch decision is the real shared
 * computeTempoPitchSplit(), wrapped so the test can prove it ran.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { installPitchStateSync } from '@engine/PatternScheduler';
import { setGlobalPitch as mcpSetGlobalPitch } from '@/bridge/handlers/writeHandlers';
import { WASM_ENGINES, type WASMSingletonEngine } from '@engine/replayer/wasmEngineRegistry';
import { registerPitchEngine, unregisterPitchEngine } from '@engine/replayer/nativeEnginePitch';

installPitchStateSync();

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

describe('the pitch slider reaches every engine through one path (PITCH-SLIDER-ALL-FORMATS)', () => {
  /** A playing Hively engine, as NativeEngineRouting registers it: records what the registry capability calls. */
  const hively = { sliderRate: 1, tempoScale: 1, calls: 0 };
  const hivelyInstance = {
    setSliderRate: (f: number) => { hively.sliderRate = f; hively.calls++; },
    setTempoScale: (f: number) => { hively.tempoScale = f; hively.calls++; },
  } as unknown as WASMSingletonEngine;

  beforeEach(() => {
    Object.assign(hively, { sliderRate: 1, tempoScale: 1, calls: 0 });
    registerPitchEngine(WASM_ENGINES.find((d) => d.key === 'Hively')!, hivelyInstance);
  });
  afterEach(() => unregisterPitchEngine('Hively'));

  it('MCP set_global_pitch moves the sound, not only the stored value', () => {
    mcpSetGlobalPitch({ pitch: 12 });
    expect(engineState.splitCalls).toBeGreaterThan(0);
    expect(engineState.tempoMultiplier).toBeCloseTo(2, 6);
    expect(engineState.globalPlaybackRate).toBeCloseTo(2, 6);
    mcpSetGlobalPitch({ pitch: 0 });
    expect(engineState.tempoMultiplier).toBe(1);
  });

  it('an AHX song on the Hively engine: varispeed with Key Lock off, tempo only with it on, bus resampler held at 1', () => {
    const { container } = render(<DJPitchSlider />);
    dragToTop(container);
    const tempo16 = Math.pow(2, 16 / 12);
    expect(hively.calls).toBeGreaterThan(0);                 // the engine was driven (sentinel)
    expect(hively.sliderRate).toBeCloseTo(tempo16, 6);       // Key Lock off: tape transport
    expect(hively.tempoScale).toBeCloseTo(1, 6);
    expect(engineState.synthBusRate).toBe(1);                // not shifted a second time on the synth bus

    fireEvent.click(screen.getByRole('button', { name: 'Key Lock' }));
    expect(hively.sliderRate).toBeCloseTo(1, 6);             // Key Lock on: the song's key
    expect(hively.tempoScale).toBeCloseTo(tempo16, 6);       // tempo follows the slider
    expect(engineState.synthBusRate).toBe(1);
  });

  it('an engine that starts with the slider moved starts at the slider speed', () => {
    unregisterPitchEngine('Hively');
    useTransportStore.getState().setGlobalPitch(12);
    Object.assign(hively, { sliderRate: 1, tempoScale: 1, calls: 0 });
    registerPitchEngine(WASM_ENGINES.find((d) => d.key === 'Hively')!, hivelyInstance);
    expect(hively.sliderRate).toBeCloseTo(2, 6);
    expect(engineState.synthBusRate).toBe(1);
    unregisterPitchEngine('Hively');
    expect(engineState.synthBusRate).toBeCloseTo(2, 6);      // the resampler takes the pitch back
  });
});
