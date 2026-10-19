/**
 * Regression for "it sounds broken at the highest pitch like it plays inside a
 * tube": the synth bus used to run through a varispeed resampler worklet that
 * zero-filled half of every block at rate 2 (a 375 Hz buzz) and overran at
 * rates below 1. The synth bus now runs through a time-preserving Signalsmith
 * pitch shifter (DeckKeyLock), bypassed at pitch 0, and every channel strip
 * delays its sample voices by the shifter's latency so channels stay in sync.
 *
 * Three checks:
 *  1. Reachability: ToneEngine.setSynthBusPitchRate drives the bus shifter and
 *     every lane shifter with the right semitones, and mirrors the shifter's
 *     latency into every strip's voice delay (0 again at pitch 0).
 *  2. pitchRateToShift maps a playback rate to a shift the insert can take.
 *  3. The shifter as DeckKeyLock configures it renders a continuous signal:
 *     no silent render quantum after its latency, and a 440 Hz tone comes out
 *     at 880 Hz (+12) and 220 Hz (-12).
 */
import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { PROJECT_ROOT } from '../../../tools/uade-audit/uadeRenderCore';
import { loadWorklet, settle, streamThrough, RENDER_QUANTUM } from '../../../tools/keylock/workletHost';
import { SR } from '../../../tools/keylock/stretchMetrics';
import { pitchRateToShift } from '../dj/computeKeyLockShift';
import { STRETCH_CONFIG, TONALITY_HZ } from '../dj/DeckKeyLock';

const { FakeGain, FakeShift, nativeOf } = vi.hoisted(() => {
  class Param { value: number; constructor(v: number) { this.value = v; } cancelScheduledValues() { /* fake */ } }
  class FakeGain {
    gain: Param;
    connections: unknown[] = [];
    constructor(v = 1) { this.gain = new Param(v); }
    connect(n: unknown) { this.connections.push(n); return n; }
    disconnect() { this.connections = []; }
    dispose() { /* fake */ }
  }
  class FakeShift {
    input = new FakeGain();
    output = new FakeGain();
    active = false;
    semitones = 0;
    onLatencyChange: (() => void) | null = null;
    setActive(active: boolean) { this.active = active; }
    setPitchSemiTones(semitones: number) { this.semitones = semitones; }
    latencySec(): number { return this.active ? 0.1 : 0; }
    dispose() { /* fake */ }
  }
  const nativeOf = (n: unknown) => n;
  return { FakeGain, FakeShift, nativeOf };
});

vi.mock('tone', async (importOriginal) => ({ ...(await importOriginal<typeof import('tone')>()), Gain: FakeGain }));
vi.mock('@utils/audio-context', async (importOriginal) => ({ ...(await importOriginal<typeof import('@utils/audio-context')>()), getNativeAudioNode: nativeOf }));
vi.mock('../dj/DeckKeyLock', async (importOriginal) => ({ ...(await importOriginal<typeof import('../dj/DeckKeyLock')>()), DeckKeyLock: FakeShift }));
vi.mock('@/engine/InstrumentFactory', () => ({ InstrumentFactory: { createInstrument: vi.fn(), createEffect: vi.fn() } }));
vi.mock('@/engine/InstrumentAnalyser', () => ({ InstrumentAnalyser: class {} }));
vi.mock('@/engine/ChannelFilterManager', () => ({ getChannelFilterManager: () => ({ getInput: () => new FakeGain(), getOutput: () => new FakeGain() }) }));

import { ToneEngine } from '../ToneEngine';

describe('synth bus pitch shift keeps the signal continuous', () => {
  it('setSynthBusPitchRate drives the bus and lane shifters, the strips\' voice delays and the native-input delay', () => {
    const synthBusPitchShift = new FakeShift();
    const laneShift = new FakeShift();
    const strip = (ch: number) => [ch, { input: new FakeGain(), voiceDelay: { delayTime: { value: 0 } }, join: new FakeGain(), channel: new FakeGain(), meter: new FakeGain() }] as const;
    const channelOutputs = new Map([strip(0), strip(1), strip(2)]);
    const engine = Object.assign(Object.create(ToneEngine.prototype), {
      synthBus: new FakeGain(),
      synthBusPitchShift,
      channelSynthLanes: new Map([[2, { gain: new FakeGain(), shift: laneShift }]]),
      nativeVoiceDelay: { delayTime: { value: 0 } },
      _synthPitchRate: 1,
    }) as ToneEngine;
    const nativeDelay = () => (engine as unknown as { nativeVoiceDelay: { delayTime: { value: number } } }).nativeVoiceDelay.delayTime.value;
    Object.defineProperty(engine, '_channelCtx', { value: { channelOutputs } });
    const delays = () => [...channelOutputs.values()].map((s) => s.voiceDelay.delayTime.value);

    engine.setSynthBusPitchRate(2);
    expect(synthBusPitchShift.active).toBe(true);
    expect(synthBusPitchShift.semitones).toBeCloseTo(12, 6);
    expect(laneShift.active).toBe(true);
    expect(laneShift.semitones).toBeCloseTo(12, 6);
    expect(delays()).toEqual([0.1, 0.1, 0.1]);
    // Native engines (libopenmpt, direct-routed WASM replayers) enter at
    // nativeInput and wait out the same latency, or hybrid synths land late.
    expect(nativeDelay()).toBe(0.1);

    engine.setSynthBusPitchRate(1);
    expect(synthBusPitchShift.active).toBe(false);
    expect(laneShift.active).toBe(false);
    expect(delays()).toEqual([0, 0, 0]);
    expect(nativeDelay()).toBe(0);

    // The shifter reports its latency only once loaded; the constructor wires its
    // onLatencyChange to this re-apply, so a late report still reaches every strip.
    engine.setSynthBusPitchRate(0.5);
    synthBusPitchShift.latencySec = () => 0.25;
    (engine as unknown as { applyPitchShiftLatency(): void }).applyPitchShiftLatency();
    expect(delays()).toEqual([0.25, 0.25, 0.25]);
    expect(nativeDelay()).toBe(0.25);
  });

  it('pitchRateToShift maps playback rate to semitones, inactive at rate 1 and on bad input', () => {
    expect(pitchRateToShift(2)).toEqual({ active: true, semitones: 12 });
    expect(pitchRateToShift(0.5)).toEqual({ active: true, semitones: -12 });
    expect(pitchRateToShift(1)).toEqual({ active: false, semitones: 0 });
    expect(pitchRateToShift(0)).toEqual({ active: false, semitones: 0 });
    expect(pitchRateToShift(Number.NaN)).toEqual({ active: false, semitones: 0 });
  });

  const WORKLET_FILES = ['idleWhenBypassed.js', 'SignalsmithStretch.mjs'].map((f) => join(PROJECT_ROOT, 'public/signalsmith-stretch', f));

  async function shiftTone(semis: number): Promise<{ out: Float32Array; latencySec: number }> {
    const seconds = 2;
    const tone = Float32Array.from({ length: SR * seconds }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR));
    const host = loadWorklet(WORKLET_FILES, SR);
    const proc = host.create('signalsmith-stretch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    for (let i = 0; i < 200 && !proc.port.received.some((m) => Array.isArray(m) && m[0] === 'ready'); i++) await settle(10);
    proc.port.send([1, 'configure', { ...STRETCH_CONFIG }]);
    proc.port.send([2, 'schedule', { active: true, semitones: semis, tonalityHz: TONALITY_HZ }]);
    proc.port.send([3, 'latency']);
    const latency = proc.port.received.find((m) => Array.isArray(m) && m[0] === 3) as [number, number];
    const out = streamThrough(host, proc, tone, tone);
    return { out: out.left, latencySec: latency[1] };
  }

  /** Zero-crossing frequency estimate over [from, to). */
  const hz = (x: Float32Array, from: number, to: number) => {
    let crossings = 0;
    for (let i = from + 1; i < to; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) crossings++;
    return (crossings / 2) / ((to - from) / SR);
  };

  it.each([[12, 880], [-12, 220]])('renders a 440 Hz tone at %i semitones without silent quanta, at %i Hz', async (semis, expectedHz) => {
    const { out, latencySec } = await shiftTone(semis);
    const start = Math.ceil((latencySec + 0.2) * SR / RENDER_QUANTUM) * RENDER_QUANTUM;
    const end = out.length - RENDER_QUANTUM;
    expect(latencySec).toBeGreaterThan(0);

    // No render quantum goes silent: the old varispeed left half of every block at zero.
    let silentQuanta = 0;
    for (let q = start; q + RENDER_QUANTUM <= end; q += RENDER_QUANTUM) {
      let peak = 0;
      for (let i = q; i < q + RENDER_QUANTUM; i++) peak = Math.max(peak, Math.abs(out[i]));
      if (peak < 0.05) silentQuanta++;
    }
    expect(silentQuanta).toBe(0);

    expect(hz(out, start, end)).toBeGreaterThan(expectedHz * 0.97);
    expect(hz(out, start, end)).toBeLessThan(expectedHz * 1.03);
  });
});
