/**
 * PITCH-SLIDER-ALL-FORMATS (owner 2026-10-15, aces_high.ahx): move the tracker pitch slider, stop, press Play, and the
 * song started at its own speed.
 *
 * Play reloads the song into the replayer every time (usePatternPlayback -> TrackerReplayer.loadSong) and only then
 * starts the whole-song engine. loadSong wrote 0 to the stored slider, so the engine registered with the slider at 0.
 * This drives that order with the REAL TrackerReplayer.loadSong and PatternScheduler; the audio graph is a fake.
 */
import { describe, it, expect, vi } from 'vitest';

const engineState = vi.hoisted(() => ({ synthBusRate: 1 }));

vi.mock('tone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tone')>();
  class Node { connect() { return this; } disconnect() { return this; } dispose() { return this; } gain = { value: 1, setValueAtTime() {}, rampTo() {} }; }
  return {
    ...actual,
    Gain: Node,
    Panner: Node,
    Player: Node,
    ToneAudioNode: Node,
    getTransport: () => ({ bpm: { value: 125 }, loop: false, cancel() {}, stop() {}, position: 0 }),
    getContext: () => ({ rawContext: {}, lookAhead: 0 }),
    setContext: () => {},
    now: () => 0,
  };
});

vi.mock('@engine/StereoSeparationNode', () => ({
  StereoSeparationNode: class { inputTone = { connect() {} }; outputTone = { connect() {}, disconnect() {} }; dispose() {} },
}));

vi.mock('@engine/ToneEngine', () => ({
  getToneEngine: () => new Proxy({
    setSynthBusPitchRate: (r: number) => { engineState.synthBusRate = r; },
    masterInput: { connect() {} },
  } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : () => undefined),
  }),
}));

import { getTrackerReplayer, type TrackerSong } from '@engine/TrackerReplayer';
import { installPitchStateSync } from '@engine/PatternScheduler';
import { useTransportStore } from '@stores/useTransportStore';
import { WASM_ENGINES, type WASMSingletonEngine } from '@engine/replayer/wasmEngineRegistry';
import { registerPitchEngine, unregisterPitchEngine } from '@engine/replayer/nativeEnginePitch';

installPitchStateSync();

const song = {
  name: 'aces_high', format: 'AHX', patterns: [{ id: 'p0', name: '', length: 64, channels: [] }],
  instruments: [], songPositions: [0], songLength: 1, restartPosition: 0, numChannels: 4, initialSpeed: 6, initialBPM: 125,
} as unknown as TrackerSong;

describe('the pitch slider survives Play', () => {
  it('slider moved, stop, Play: the song reloads and the Hively engine starts at the slider speed', async () => {
    const hively = { sliderRate: 1, calls: 0 };
    const instance = { setSliderRate: (f: number) => { hively.sliderRate = f; hively.calls++; }, setTempoScale: () => {} } as unknown as WASMSingletonEngine;

    useTransportStore.getState().setGlobalPitch(12);

    // Play: usePatternPlayback reloads the song, then startNativeEngines registers the engine.
    getTrackerReplayer().loadSong(song);
    await new Promise((r) => setTimeout(r, 0));
    registerPitchEngine(WASM_ENGINES.find((d) => d.key === 'Hively')!, instance);

    expect(useTransportStore.getState().globalPitch).toBe(12);   // the slider is the performer's
    expect(hively.calls).toBeGreaterThan(0);                      // the engine was driven (sentinel)
    expect(hively.sliderRate).toBeCloseTo(2, 6);                  // +12 st: twice the speed
    expect(getTrackerReplayer().getTempoMultiplier()).toBeCloseTo(2, 6);
    expect(engineState.synthBusRate).toBe(1);
    unregisterPitchEngine('Hively');
  });
});
