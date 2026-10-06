/**
 * Loading a song disposed each instrument's effect chain but left the bridge
 * Gain undisposed and every effect registered in instrumentEffectNodes, which
 * holds its node strongly: "Gain tone.js" grew by ~10 alive per song load.
 */
import { describe, it, expect, vi } from 'vitest';

const nodes = { created: 0, disposed: 0 };

vi.mock('tone', () => {
  class Gain {
    constructor() { nodes.created++; }
    connect() { return this; }
    disconnect() { return this; }
    dispose() { nodes.disposed++; return this; }
  }
  return { Gain };
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

import { buildInstrumentEffectChain, disposeInstrumentEffectChain, type InstrumentEffectsContext } from '../InstrumentEffectsChain';

describe('instrument effect chains', () => {
  it('disposing a song of native-synth chains leaves no Tone node or registry entry behind', async () => {
    const ctx = {
      instrumentEffectChains: new Map(),
      instrumentEffectNodes: new Map(),
      instrumentAnalysers: new Map(),
      instruments: new Map(),
      connectNativeSynth: vi.fn(),
      getInstrumentOutputDestination: () => ({}),
    } as unknown as InstrumentEffectsContext;
    const nativeSynth = { name: 'n', output: { connect() {}, disconnect() {}, numberOfOutputs: 1 }, dispose() {}, triggerAttack() {}, triggerRelease() {} };
    const fx = [{ id: 'fx1', type: 'Reverb', enabled: true, wet: 50, parameters: {} }];

    for (let i = 0; i < 10; i++) {
      await buildInstrumentEffectChain(ctx, (i + 1) << 16, fx as never, nativeSynth as never);
    }
    for (let i = 0; i < 10; i++) disposeInstrumentEffectChain(ctx, (i + 1) << 16);

    expect(nodes.created).toBeGreaterThan(0);
    expect(nodes.disposed).toBe(nodes.created);
    expect(ctx.instrumentEffectNodes.size).toBe(0);
  });
});
