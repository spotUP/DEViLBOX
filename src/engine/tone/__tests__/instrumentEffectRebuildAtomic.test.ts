/**
 * Adding an effect used to disconnect the instrument and dispose the old chain
 * BEFORE creating the new effect nodes: a failed create left it silent, and two
 * quick rebuilds leaked a connected chain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const live = { chains: 0 };

vi.mock('tone', () => {
  class Gain {
    constructor() { live.chains++; }
    connect() { return this; }
    disconnect() { return this; }
    dispose() { live.chains--; return this; }
  }
  return { Gain, ToneAudioNode: class {}, getContext: () => ({ rawContext: { createAnalyser: () => ({}) } }) };
});
vi.mock('../../InstrumentFactory', () => ({ InstrumentFactory: { createEffect: vi.fn() } }));
vi.mock('../../InstrumentAnalyser', () => ({ InstrumentAnalyser: class {} }));
vi.mock('../../ChannelFilterManager', () => ({
  getChannelFilterManager: () => ({ getInput: () => ({}), getOutput: () => ({}) }),
}));
vi.mock('../connectAudio', () => ({ connectAudio: vi.fn() }));

import { InstrumentFactory } from '../../InstrumentFactory';
import { buildInstrumentEffectChain, type InstrumentEffectsContext } from '../InstrumentEffectsChain';

const KEY = 3 << 16;
const fx = (id: string) => [{ id, type: 'Reverb', enabled: true, wet: 50, parameters: {} }] as never;
const makeFx = () => ({ connect() {}, disconnect() {}, dispose() { live.chains--; } });

function makeCtx() {
  return {
    instrumentEffectChains: new Map(),
    instrumentEffectNodes: new Map(),
    instrumentAnalysers: new Map(),
    instruments: new Map(),
    instrumentOutputOverrides: new Map(),
    connectNativeSynth: vi.fn(),
    getInstrumentOutputDestination: () => ({}),
    channelFromKey: () => -1,
  } as unknown as InstrumentEffectsContext;
}

describe('atomic instrument effect rebuild', () => {
  beforeEach(() => {
    live.chains = 0;
    vi.mocked(InstrumentFactory.createEffect).mockReset();
  });

  it('a failed effect create keeps the old chain connected and registered', async () => {
    const ctx = makeCtx();
    const inst = { connect: vi.fn(), disconnect: vi.fn() };
    vi.mocked(InstrumentFactory.createEffect).mockImplementation(async () => makeFx() as never);
    await buildInstrumentEffectChain(ctx, KEY, fx('a'), inst as never);
    const old = ctx.instrumentEffectChains.get(KEY);
    inst.disconnect.mockClear();

    vi.mocked(InstrumentFactory.createEffect).mockRejectedValue(new Error('no model'));
    await buildInstrumentEffectChain(ctx, KEY, fx('b'), inst as never);

    expect(ctx.instrumentEffectChains.get(KEY)).toBe(old);
    expect(inst.disconnect).not.toHaveBeenCalled();
    expect(ctx.instrumentEffectNodes.size).toBe(1);
  });

  it('two concurrent rebuilds leave exactly one chain and disconnect only the old input edge', async () => {
    const ctx = makeCtx();
    const inst = { connect: vi.fn(), disconnect: vi.fn() };
    vi.mocked(InstrumentFactory.createEffect).mockImplementation(async () => {
      await Promise.resolve();
      live.chains++;
      return makeFx() as never;
    });
    await Promise.all([
      buildInstrumentEffectChain(ctx, KEY, fx('a'), inst as never),
      buildInstrumentEffectChain(ctx, KEY, fx('b'), inst as never),
    ]);

    expect(ctx.instrumentEffectChains.size).toBe(1);
    expect(ctx.instrumentEffectNodes.size).toBe(1);
    // output gain + one effect remain alive; the first chain was disposed
    expect(live.chains).toBe(2);
    for (const call of inst.disconnect.mock.calls) expect(call.length).toBe(1);
  });
});
