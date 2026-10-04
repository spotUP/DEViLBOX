/**
 * A Drop takes every registry engine's output down, not four.
 *
 * masterDrop collected its dry gains from a hand list of four engines
 * (Libopenmpt, Hively, UADE, Furnace). Fred, TFMX/Hippel, Sonix, SunTronic
 * and every other native engine kept playing dry through a Drop (ledger
 * F30, found 2026-10-04 while fixing F28). The registry is the list now.
 */
import { describe, it, expect, vi } from 'vitest';
import { liveRegistryEngineOutputs, resolveRegistryEngineClasses } from '@/lib/engines/registryEngines';

function fakeEngine(alive: boolean, gainValue = 0.8) {
  const output = { gain: { value: gainValue } } as unknown as GainNode;
  const inst = { output };
  return { Engine: { hasInstance: () => alive, getInstance: () => inst }, output };
}

describe('registry engine resolution', () => {
  it('resolves static and dynamic descriptors and skips a failing resolver', async () => {
    const A = fakeEngine(true).Engine;
    const B = fakeEngine(true).Engine;
    const classes = await resolveRegistryEngineClasses([
      { key: 'A', staticRef: A },
      { key: 'B', dynamicResolver: async () => B },
      { key: 'Broken', dynamicResolver: async () => { throw new Error('no bundle'); } },
    ]);
    expect(classes.map((c) => c.key)).toEqual(['A', 'B']);
  });

  it('lists the outputs of the engines alive right now and nothing else', async () => {
    const fred = fakeEngine(true, 0.9);
    const tfmx = fakeEngine(true, 0.5);
    const idle = fakeEngine(false);
    const live = await liveRegistryEngineOutputs([
      { key: 'FredReplayer2', staticRef: fred.Engine },
      { key: 'Hippel', dynamicResolver: async () => tfmx.Engine },
      { key: 'Sonix', staticRef: idle.Engine },
      { key: 'NoOutput', staticRef: { hasInstance: () => true, getInstance: () => ({}) } },
    ]);
    expect(live.map((l) => l.key)).toEqual(['FredReplayer2', 'Hippel']);
    expect(live[0].output).toBe(fred.output);
  });
});

describe('masterDrop', () => {
  it("takes every registry engine's output down, not four", async () => {
    const fred = fakeEngine(true, 0.9);
    vi.doMock('@/engine/replayer/NativeEngineRouting', () => ({ WASM_ENGINES: [{ key: 'FredReplayer2', staticRef: fred.Engine }] }));
    vi.doMock('@/engine/ToneEngine', () => ({ getToneEngine: () => { throw new Error('no tone engine in this test'); } }));
    vi.doMock('@/engine/libopenmpt/LibopenmptEngine', () => ({ LibopenmptEngine: { hasInstance: () => false } }));
    vi.doMock('@/engine/furnace-dispatch/FurnaceDispatchEngine', () => ({ FurnaceDispatchEngine: { hasInstance: () => false } }));
    const { collectDryGains } = await import('@/engine/dub/moves/masterDrop');
    const gains = await collectDryGains();
    expect(gains.map((g) => g.param)).toContain(fred.output.gain);
    expect(gains.find((g) => g.param === fred.output.gain)?.prev).toBe(0.9);
  });
});
