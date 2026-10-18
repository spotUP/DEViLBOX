/**
 * Reachability: a standalone native synth (TB303 here) triggered on a tracker
 * channel gets its own instance for that channel, and that instance plays into
 * the channel strip through the channel's synth lane, so channel volume, pan,
 * mute and channel effects reach it. Before this, every native synth shared one
 * instance keyed to channel -1 that played straight into the synthBus, which is
 * why mute and solo did nothing in an all-synth song.
 *
 * The real ToneEngine code runs: triggerNote -> getInstrument (key selection)
 * -> InstrumentFactory -> buildInstrumentEffectChain -> connectNativeSynth ->
 * connectChainOutput -> getInstrumentOutputDestination -> getChannelSynthLane
 * -> triggerAttack. The engine is a prototype instance over fake state; only
 * the audio context plumbing (safe time, per-voice nodes, channel strips, the
 * resampler worklet) is replaced.
 */
import { describe, it, expect, vi } from 'vitest';
import type { InstrumentConfig } from '@typedefs/instrument';

const { FakeGain, FakeAudioNode, nativeOf, factory } = vi.hoisted(() => {
  const sharedContext = { state: 'running' };
  class Param {
    value: number;
    constructor(v: number) { this.value = v; }
    cancelScheduledValues() { /* fake */ }
  }
  class FakeAudioNode {
    connections: unknown[] = [];
    context = sharedContext;
    numberOfOutputs = 1;
    gain = new Param(1);
    connect(n: unknown) { this.connections.push(n); return n; }
    disconnect(n?: unknown) { this.connections = n ? this.connections.filter((c) => c !== n) : []; }
  }
  class FakeGain {
    gain: Param;
    native = new FakeAudioNode();
    connections: unknown[] = [];
    constructor(v = 1) { this.gain = new Param(v); }
    connect(n: unknown) { this.connections.push(n); this.native.connect((n as { native?: FakeAudioNode }).native ?? n); return n; }
    disconnect(n?: unknown) { this.connections = n ? this.connections.filter((c) => c !== n) : []; }
    dispose() { /* fake */ }
  }
  const nativeOf = (n: unknown) => (n as { native?: FakeAudioNode })?.native ?? ((n as FakeAudioNode)?.connect ? n : null);
  const factory = { createInstrument: vi.fn(), createEffect: vi.fn() };
  return { FakeGain, FakeAudioNode, nativeOf, factory };
});

vi.mock('tone', async (importOriginal) => {
  const orig = await importOriginal<typeof import('tone')>();
  return { ...orig, Gain: FakeGain };
});
vi.mock('@utils/audio-context', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@utils/audio-context')>();
  return { ...orig, getNativeAudioNode: nativeOf };
});
vi.mock('@/engine/InstrumentFactory', () => ({ InstrumentFactory: factory }));
vi.mock('@/engine/InstrumentAnalyser', () => ({ InstrumentAnalyser: class {} }));
vi.mock('@/engine/ChannelFilterManager', () => {
  const slots = new Map<number, { input: InstanceType<typeof FakeGain>; output: InstanceType<typeof FakeGain> }>();
  const slot = (id: number) => {
    let s = slots.get(id);
    if (!s) { s = { input: new FakeGain(), output: new FakeGain() }; s.input.connect(s.output); slots.set(id, s); }
    return s;
  };
  return {
    getChannelFilterManager: () => ({
      getInput: (id: number) => slot(id).input,
      getOutput: (id: number) => slot(id).output,
    }),
  };
});

import { ToneEngine } from '../ToneEngine';

type FakeGainNode = InstanceType<typeof FakeGain>;

const key = (id: number, ch: number) => (id << 16) | (ch & 0xFFFF);
const SHARED = 0xFFFF;

function fakeInstrument() {
  const output = new FakeAudioNode();
  return { output, triggerAttack: vi.fn(), triggerRelease: vi.fn(), dispose: vi.fn() };
}

function fakeResampler() {
  const node = {
    connections: [] as unknown[],
    messages: [] as { type: string; rate?: number }[],
    port: { postMessage(m: { type: string; rate?: number }) { node.messages.push(m); } },
    connect(n: unknown) { node.connections.push(n); },
    disconnect() { node.connections = []; },
  };
  return node;
}

/** Depth-first: does `from` reach `to` over fake connections (Tone or native)? */
function reaches(from: unknown, to: unknown, seen = new Set<unknown>()): boolean {
  if (from === to) return true;
  if (!from || seen.has(from)) return false;
  seen.add(from);
  const node = from as { connections?: unknown[]; native?: unknown };
  for (const next of node.connections ?? []) if (reaches(next, to, seen)) return true;
  return node.native ? reaches(node.native, to, seen) : false;
}

/** A ToneEngine over fake state: real prototype methods, fake audio plumbing. */
function makeEngine() {
  const strips = new Map<number, FakeGainNode>();
  const resamplers: ReturnType<typeof fakeResampler>[] = [];
  const state = {
    instruments: new Map(),
    instrumentSynthTypes: new Map(),
    instrumentEffectChains: new Map(),
    instrumentEffectNodes: new Map(),
    instrumentAnalysers: new Map(),
    instrumentOutputOverrides: new Map(),
    pendingEffectChains: new Map(),
    channelSynthLanes: new Map(),
    activeVoices: new Map(),
    channelMaxVoices: new Map(),
    channelLastNote: new Map(),
    bridgeSlots: new Map(),
    kontaktChannelNotes: new Map(),
    masterInput: new FakeGain(),
    synthBus: new FakeGain(),
    amigaPeriodSong: false,
    globalDetuneCents: 0,
    globalPlaybackRate: 1,
    currentPerformanceQuality: 'high',
    _sunvoxOutputConnected: false,
    _nativeContext: undefined,
    _synthPitchRate: 1,
    _manualSynthGainDb: 0,
    _manualSampleGainDb: 0,
    autoGainSynthCorr: 0,
    autoGainSampleCorr: 0,
    // Plumbing that needs a live audio context, replaced:
    getSafeTime: () => 0,
    stopVoice: () => { /* no voices to stop */ },
    createVoice: (_ch: number, instrument: unknown, note: string) => ({ instrument, note, nodes: { gain: new FakeGain() }, fadeoutStep: 0 }),
    getChannelOutput: (ch: number) => {
      let s = strips.get(ch);
      if (!s) { s = new FakeGain(); strips.set(ch, s); }
      return s;
    },
    ensurePitchResamplerModule: () => Promise.resolve(),
    createPitchResamplerNode: () => { const r = fakeResampler(); resamplers.push(r); return r; },
  };
  const engine = Object.assign(Object.create(ToneEngine.prototype), state) as ToneEngine;
  return { engine, state, strips, resamplers };
}

const tb303 = (id: number): InstrumentConfig => ({ id, name: 'acid', synthType: 'TB303', effects: [] } as unknown as InstrumentConfig);
const fcSynth = (id: number): InstrumentConfig => ({ id, name: 'fc', synthType: 'FCSynth', effects: [] } as unknown as InstrumentConfig);

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('per-channel native synth routing (TB303 on tracker channel 3)', () => {
  it('builds a channel-3 instance that plays through lane 3 into strip 3 and fires the note', async () => {
    factory.createInstrument.mockReset();
    const instruments: ReturnType<typeof fakeInstrument>[] = [];
    factory.createInstrument.mockImplementation(() => { const i = fakeInstrument(); instruments.push(i); return i; });
    const { engine, state, strips } = makeEngine();

    engine.triggerNote(7, 'C4', 0, 0, 1, tb303(7), false, false, 3);
    await state.pendingEffectChains.get(key(7, 3));
    await flush();

    // Sentinel: the note reached the instance.
    expect(instruments).toHaveLength(1);
    expect(instruments[0].triggerAttack).toHaveBeenCalledTimes(1);
    expect(instruments[0].triggerAttack.mock.calls[0][0]).toBe('C4');

    // Keyed per channel, not the shared -1 instance.
    expect(state.instruments.has(key(7, 3))).toBe(true);
    expect(state.instruments.has(key(7, SHARED))).toBe(false);

    // instance.output -> chain output -> lane 3 gain -> strip 3; never synthBus or masterInput.
    const chain = state.instrumentEffectChains.get(key(7, 3)) as { output: FakeGainNode };
    expect(chain).toBeDefined();
    expect(reaches(instruments[0].output, chain.output.native)).toBe(true);
    const lane = state.channelSynthLanes.get(3) as { gain: FakeGainNode; resampler: ReturnType<typeof fakeResampler> | null };
    expect(lane).toBeDefined();
    expect(chain.output.connections).toContain(lane.gain);
    expect(reaches(instruments[0].output, strips.get(3)!.native)).toBe(true);
    expect(reaches(instruments[0].output, state.synthBus.native)).toBe(false);
    expect(reaches(instruments[0].output, state.masterInput.native)).toBe(false);

    // A second note on the same channel reuses the instance.
    engine.triggerNote(7, 'D4', 0, 0, 1, tb303(7), false, false, 3);
    expect(instruments).toHaveLength(1);
    expect(instruments[0].triggerAttack).toHaveBeenCalledTimes(2);

    // Another channel gets its own instance and lane.
    engine.triggerNote(7, 'E4', 0, 0, 1, tb303(7), false, false, 5);
    await state.pendingEffectChains.get(key(7, 5));
    expect(instruments).toHaveLength(2);
    expect(state.instruments.has(key(7, 5))).toBe(true);
    expect(reaches(instruments[1].output, strips.get(5)!.native)).toBe(true);
    expect(reaches(instruments[1].output, strips.get(3)!.native)).toBe(false);
  });

  it('lane follows the synth bus gain and the DJ pitch rate', async () => {
    factory.createInstrument.mockReset();
    factory.createInstrument.mockImplementation(fakeInstrument);
    const { engine, state, resamplers } = makeEngine();

    engine.triggerNote(7, 'C4', 0, 0, 1, tb303(7), false, false, 3);
    await state.pendingEffectChains.get(key(7, 3));
    await flush();
    const lane = state.channelSynthLanes.get(3) as { gain: FakeGainNode; resampler: ReturnType<typeof fakeResampler> | null };

    engine.setSynthBusGain(-6);
    expect(state.synthBus.gain.value).toBeCloseTo(Math.pow(10, -6 / 20), 6);
    expect(lane.gain.gain.value).toBeCloseTo(Math.pow(10, -6 / 20), 6);

    expect(resamplers).toHaveLength(1);
    expect(lane.resampler).toBe(resamplers[0]);
    engine.setSynthBusPitchRate(0.5);
    expect(resamplers[0].messages).toContainEqual({ type: 'set-rate', rate: 0.5 });
  });

  it('keeps pooled chip synths and live-voice channels on the shared instance into synthBus', async () => {
    factory.createInstrument.mockReset();
    const instruments: ReturnType<typeof fakeInstrument>[] = [];
    factory.createInstrument.mockImplementation(() => { const i = fakeInstrument(); instruments.push(i); return i; });
    const { engine, state } = makeEngine();

    // FCSynth plays whole songs from one pooled instance (Phase 1 decision: keep shared).
    engine.triggerNote(8, 'C4', 0, 0, 1, fcSynth(8), false, false, 3);
    await state.pendingEffectChains.get(key(8, SHARED));
    expect(state.instruments.has(key(8, SHARED))).toBe(true);
    expect(state.instruments.has(key(8, 3))).toBe(false);
    expect(reaches(instruments[0].output, state.synthBus.native)).toBe(true);

    // Live voice channel (>= 100) is not a tracker channel: shared instance, synthBus.
    engine.triggerNote(7, 'C4', 0, 0, 1, tb303(7), false, false, 100);
    await state.pendingEffectChains.get(key(7, SHARED));
    expect(state.instruments.has(key(7, SHARED))).toBe(true);
    expect(state.instruments.has(key(7, 100))).toBe(false);
    expect(reaches(instruments[1].output, state.synthBus.native)).toBe(true);
    expect(state.channelSynthLanes.size).toBe(0);
  });
});
