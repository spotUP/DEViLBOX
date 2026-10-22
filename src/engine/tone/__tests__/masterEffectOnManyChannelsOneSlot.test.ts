/**
 * A master effect aimed at many channels reaches all of them.
 *
 * Owner report: an Ambient Delay aimed at a subset of channels only worked on
 * four. Every channel took an isolation slot (a second libopenmpt module) and
 * the engine had four. Channels that share the same master effects now share
 * one slot, and the pool is 16.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as Tone from 'tone';

vi.mock('../../factories/EffectFactory', () => ({
  createEffect: vi.fn(async () => ({ input: {}, output: {}, connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn() })),
}));
vi.mock('../connectAudio', () => ({ connectAudio: vi.fn() }));

import { ChannelRoutedEffectsManager, planIsolationSlots } from '../ChannelRoutedEffects';
import { LibopenmptEngine } from '../../libopenmpt/LibopenmptEngine';

const fx = (id: string) => ({ id, category: 'tonejs', type: 'FeedbackDelay', enabled: true, wet: 50, parameters: {} }) as never;
const bits = (channels: number[]) => channels.reduce((m, c) => m | (1 << c), 0);

describe('isolation slot plan', () => {
  it('puts a master effect on six channels with no inserts in ONE slot with all six bits', () => {
    const master = fx('delay');
    const plan = planIsolationSlots(new Map(), new Map([0, 1, 2, 3, 4, 5].map(c => [c, [master]])));
    expect(plan).toHaveLength(1);
    expect(plan[0].channelMask).toBe(bits([0, 1, 2, 3, 4, 5]));
    expect(plan[0].routed).toEqual([master]);
  });

  it('gives five channels with distinct inserts five slots', () => {
    const plan = planIsolationSlots(new Map([0, 1, 2, 3, 4].map(c => [c, [fx(`ins${c}`)]])), new Map());
    expect(plan.map(p => p.channelMask)).toEqual([1, 2, 4, 8, 16]);
  });

  it('keeps a channel with an insert in its own slot next to the shared master slot', () => {
    const master = fx('delay');
    const plan = planIsolationSlots(
      new Map([[1, [fx('ins')]]]),
      new Map([0, 1, 2].map(c => [c, [master]])),
    );
    expect(plan.map(p => p.channelMask).sort()).toEqual([bits([0, 2]), bits([1])].sort());
    expect(plan.find(p => p.channelMask === bits([1]))!.inserts).toHaveLength(1);
  });

  it('keeps channels with different master effect lists apart and skips disabled ones', () => {
    const off = { ...(fx('off') as object), enabled: false } as never;
    const plan = planIsolationSlots(new Map(), new Map([[0, [fx('a')]], [1, [fx('b')]], [2, [off]]]));
    expect(plan.map(p => p.channelMask)).toEqual([1, 2]);
  });
});

describe('channel-routed rebuild with many channels', () => {
  it('a master effect on six channels reaches all six', async () => {
    const mgr = new ChannelRoutedEffectsManager({} as unknown as Tone.Gain);
    const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    const engine = {
      isAvailable: () => true,
      maxIsolationSlots: () => 16,
      getWorkletNode: () => ({ connect: vi.fn(), disconnect: vi.fn(), port: { postMessage: vi.fn() } }),
      getAudioContext: () => ({ createGain: () => gain }),
      addIsolation: vi.fn(), removeIsolation: vi.fn(),
    };
    const master = fx('delay');
    await mgr.rebuild(new Map(), engine as never, new Map([0, 1, 2, 3, 4, 5].map(c => [c, [master]])));
    expect(engine.addIsolation).toHaveBeenCalledTimes(1);
    expect(engine.addIsolation).toHaveBeenCalledWith(0, bits([0, 1, 2, 3, 4, 5]));
    for (const c of [0, 1, 2, 3, 4, 5]) expect(mgr.getSlotForChannel(c)).not.toBeNull();
  });

  it('five channels with their own inserts each get a slot past the old cap of four', async () => {
    const mgr = new ChannelRoutedEffectsManager({} as unknown as Tone.Gain);
    const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    const engine = {
      isAvailable: () => true,
      maxIsolationSlots: () => 16,
      getWorkletNode: () => ({ connect: vi.fn(), disconnect: vi.fn(), port: { postMessage: vi.fn() } }),
      getAudioContext: () => ({ createGain: () => gain }),
      addIsolation: vi.fn(), removeIsolation: vi.fn(),
    };
    await mgr.rebuild(new Map([0, 1, 2, 3, 4].map(c => [c, [fx(`ins${c}`)]])), engine as never);
    expect(engine.addIsolation).toHaveBeenCalledTimes(5);
    expect(engine.addIsolation).toHaveBeenLastCalledWith(4, 16);
  });
});

describe('isolation pool size', () => {
  it('is the same in the TypeScript engine and the worklet', () => {
    const worklet = readFileSync('public/chiptune3/chiptune3.worklet.js', 'utf8');
    const m = /^const MAX_ISOLATION_SLOTS = (\d+)/m.exec(worklet);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(LibopenmptEngine.MAX_ISOLATION_SLOTS);
    expect(worklet).toMatch(/^const DUB_OUTPUT_BASE = 1 \+ MAX_ISOLATION_SLOTS/m);
  });
});
