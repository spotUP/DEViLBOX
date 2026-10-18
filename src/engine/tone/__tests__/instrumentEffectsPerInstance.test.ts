/**
 * One instrument may own several live instances: the shared one and one per
 * tracker channel. Every instrument-wide operation (effect rebuild, effect
 * parameter edit, ROM load) has to reach all of them, not only the first.
 */
import { describe, it, expect, vi } from 'vitest';

const nodes = { created: 0, disposed: 0 };

vi.mock('tone', async (importOriginal) => {
  class Gain {
    constructor() { nodes.created++; }
    connect() { return this; }
    disconnect() { return this; }
    dispose() { nodes.disposed++; return this; }
  }
  return { ...(await importOriginal<typeof import('tone')>()), Gain };
});
vi.mock('../../InstrumentFactory', () => ({
  InstrumentFactory: {
    createEffect: vi.fn(async () => {
      nodes.created++;
      return { connect() {}, disconnect() {}, dispose() { nodes.disposed++; } };
    }),
  },
}));
vi.mock('../../InstrumentAnalyser', () => ({ InstrumentAnalyser: class {} }));
vi.mock('../../ChannelFilterManager', () => ({
  getChannelFilterManager: () => ({ getInput: () => ({}), getOutput: () => ({}) }),
}));
vi.mock('../connectAudio', () => ({ connectAudio: vi.fn() }));

import { rebuildInstrumentEffects, instrumentEffectNodeKey, type InstrumentEffectsContext } from '../InstrumentEffectsChain';
import { updateInstrumentEffectParams } from '../MasterEffectsChain';
import { loadSynthROM, type SynthUpdateContext } from '../SynthParameterUpdates';

const key = (id: number, channel: number) => (id << 16) | (channel & 0xFFFF);

function makeNativeSynth() {
  return { name: 'n', output: { connect() {}, disconnect: vi.fn(), numberOfOutputs: 1 }, dispose() {}, triggerAttack() {}, triggerRelease() {} };
}

function makeCtx(instruments: Map<number, unknown>): InstrumentEffectsContext {
  return {
    instrumentEffectChains: new Map(),
    instrumentEffectNodes: new Map(),
    instrumentAnalysers: new Map(),
    instruments,
    instrumentOutputOverrides: new Map(),
    connectNativeSynth: vi.fn(),
    getInstrumentOutputDestination: () => ({}),
    channelFromKey: (k: number) => { const c = k & 0xFFFF; return c === 0xFFFF ? -1 : c; },
    getInstrumentKey: key,
  } as unknown as InstrumentEffectsContext;
}

const fx = [{ id: 'fx1', type: 'Reverb', enabled: true, wet: 50, parameters: {} }];

describe('instrument-wide operations reach every per-channel instance', () => {
  it('rebuildInstrumentEffects builds one chain per live instance of the instrument', async () => {
    const shared = makeNativeSynth();
    const ch0 = makeNativeSynth();
    const ch3 = makeNativeSynth();
    const other = makeNativeSynth();
    const instruments = new Map<number, unknown>([
      [key(5, -1), shared], [key(5, 0), ch0], [key(5, 3), ch3], [key(6, 0), other],
    ]);
    const ctx = makeCtx(instruments);

    await rebuildInstrumentEffects(ctx, 5, fx as never);

    expect([...ctx.instrumentEffectChains.keys()].sort()).toEqual([key(5, -1), key(5, 0), key(5, 3)].sort());
    expect(ctx.instrumentEffectNodes.has(instrumentEffectNodeKey(key(5, 0), 'fx1'))).toBe(true);
    expect(ctx.instrumentEffectNodes.has(instrumentEffectNodeKey(key(5, 3), 'fx1'))).toBe(true);
    expect(ctx.instrumentEffectNodes.size).toBe(3);
    expect(other.output.disconnect).not.toHaveBeenCalled();
  });

  it('updateInstrumentEffectParams edits the same effect id in every chain', async () => {
    const instruments = new Map<number, unknown>([[key(5, -1), makeNativeSynth()], [key(5, 2), makeNativeSynth()]]);
    const ctx = makeCtx(instruments);
    await rebuildInstrumentEffects(ctx, 5, fx as never);

    const applied: unknown[] = [];
    const applyDiff = vi.fn((node: unknown) => { applied.push(node); });
    updateInstrumentEffectParams(ctx.instrumentEffectNodes, applyDiff as never, 'fx1', { ...fx[0], parameters: { decay: 2 } } as never);

    expect(applied).toHaveLength(2);
    expect(new Set(applied).size).toBe(2);
  });

  it('loadSynthROM hands the ROM to every instance of the instrument', () => {
    const rom = (): { loadROM: ReturnType<typeof vi.fn> } => ({ loadROM: vi.fn() });
    const a = rom(); const b = rom(); const other = rom();
    const ctx = {
      instruments: new Map<number, unknown>([[key(7, -1), a], [key(7, 1), b], [key(8, -1), other]]),
      instrumentIdFromKey: (k: number) => k >> 16,
    } as unknown as SynthUpdateContext;
    const data = new Uint8Array([1, 2, 3]);

    loadSynthROM(ctx, 7, 'MAMEYM2608', 0, data);

    expect(a.loadROM).toHaveBeenCalledTimes(1);
    expect(b.loadROM).toHaveBeenCalledTimes(1);
    expect(other.loadROM).not.toHaveBeenCalled();
  });
});
