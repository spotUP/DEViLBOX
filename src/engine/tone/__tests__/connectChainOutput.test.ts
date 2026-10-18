/**
 * Where an instrument effect chain's output goes.
 *
 * A per-channel native synth instance (key channel >= 0) feeds its channel
 * lane directly; the shared native instance keeps the global native-synth
 * filter slot before the synth bus. An open instrument analyser sits in
 * series for Tone.js instruments and as a parallel tap for native ones, so a
 * native instrument is never summed twice at its destination.
 */
import { describe, it, expect, vi } from 'vitest';

const { Gain, filterSlots, connectAudio } = vi.hoisted(() => {
  class Gain {
    connections: unknown[] = [];
    connect(n: unknown) { this.connections.push(n); }
    disconnect(n?: unknown) { this.connections = n ? this.connections.filter((c) => c !== n) : []; }
  }
  const filterSlots = new Map<number, { input: Gain; output: Gain }>();
  const connectAudio = vi.fn((src: unknown, dst: unknown) => (src as Gain).connect(dst));
  return { Gain, filterSlots, connectAudio };
});
vi.mock('tone', () => ({ Gain, ToneAudioNode: class {} }));
vi.mock('../connectAudio', () => ({ connectAudio }));
vi.mock('../../ChannelFilterManager', () => ({
  getChannelFilterManager: () => ({
    getInput: (i: number) => slot(i).input,
    getOutput: (i: number) => slot(i).output,
  }),
}));
vi.mock('../../InstrumentFactory', () => ({ InstrumentFactory: {} }));
vi.mock('../../InstrumentAnalyser', () => ({ InstrumentAnalyser: class {} }));

function slot(i: number) {
  let s = filterSlots.get(i);
  if (!s) { s = { input: new Gain(), output: new Gain() }; filterSlots.set(i, s); }
  return s;
}

import { connectChainOutput, type InstrumentEffectsContext } from '../InstrumentEffectsChain';

// Same composite key as ToneEngine.getInstrumentKey / channelFromKey.
const getInstrumentKey = (id: number, ch = -1) => (id << 16) | (ch & 0xffff);
const instrumentIdFromKey = (key: number) => key >>> 16;
const channelFromKey = (key: number) => ((key & 0xffff) === 0xffff ? -1 : key & 0xffff);

function ctx() {
  const masterInput = new Gain();
  const synthBus = new Gain();
  const lanes = new Map<number, InstanceType<typeof Gain>>();
  const laneFor = (ch: number) => { let l = lanes.get(ch); if (!l) { l = new Gain(); lanes.set(ch, l); } return l; };
  const c = {
    instrumentEffectChains: new Map(),
    instrumentEffectNodes: new Map(),
    instrumentAnalysers: new Map(),
    instrumentOutputOverrides: new Map(),
    instruments: new Map(),
    masterInput,
    synthBus,
    connectNativeSynth: vi.fn(),
    getInstrumentOutputDestination: vi.fn((_id: number, isNative: boolean, ch = -1) => {
      if (!isNative) return masterInput;
      return ch >= 0 ? laneFor(ch) : synthBus;
    }),
    getInstrumentKey,
    channelFromKey,
  } as unknown as InstrumentEffectsContext;
  return { c, masterInput, synthBus, lanes };
}

describe('connectChainOutput', () => {
  it('sends a per-channel native instance to its channel lane, skipping the native filter slot', () => {
    const { c, lanes } = ctx();
    const output = new Gain();
    connectChainOutput(c, getInstrumentKey(7, 3), output as never, true);
    expect(c.getInstrumentOutputDestination).toHaveBeenCalledWith(7, true, 3);
    expect(output.connections).toEqual([lanes.get(3)]);
    expect(filterSlots.has(1007)).toBe(false);
  });

  it('keeps the shared native instance on the native filter slot before the synth bus', () => {
    const { c, synthBus } = ctx();
    const output = new Gain();
    const key = getInstrumentKey(7);
    expect(instrumentIdFromKey(key)).toBe(7);
    connectChainOutput(c, key, output as never, true);
    expect(c.getInstrumentOutputDestination).toHaveBeenCalledWith(7, true, -1);
    expect(output.connections).toEqual([slot(1007).input]);
    expect(slot(1007).output.connections).toEqual([synthBus]);
  });

  it('puts an open analyser in series for a Tone.js instrument', () => {
    const { c, masterInput } = ctx();
    const analyser = { input: new Gain(), output: new Gain() };
    c.instrumentAnalysers.set(2, analyser as never);
    const output = new Gain();
    connectChainOutput(c, getInstrumentKey(2), output as never, false);
    expect(output.connections).toEqual([analyser.input]);
    expect(output.connections).not.toContain(masterInput);
  });

  it('taps an open analyser in parallel for a native instance, keeping the lane destination', () => {
    const { c, lanes } = ctx();
    const analyser = { input: new Gain(), output: new Gain() };
    c.instrumentAnalysers.set(9, analyser as never);
    const output = new Gain();
    connectChainOutput(c, getInstrumentKey(9, 1), output as never, true);
    expect(output.connections).toEqual([lanes.get(1), analyser.input]);
    expect(connectAudio).toHaveBeenCalledWith(output, analyser.input);
  });
});
