/**
 * A sidechain compressor routed to a channel keys on its source channel.
 *
 * ChannelRoutedEffects.rebuild built channel-routed effects without the
 * sidechain wiring the master chain does, so a SidechainCompressor routed to
 * a channel ignored its source and keyed on the channel it sat on - reported
 * as "the channel buttons kill the effect" (2026-09-29).
 */
import { describe, it, expect, vi } from 'vitest';
import * as Tone from 'tone';

const wireMasterSidechain = vi.fn(async () => {});
vi.mock('../MasterEffectsChain', () => ({ wireMasterSidechain }));
const scNode = { getSidechainInput: () => ({}), input: {}, output: {}, connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn() };
vi.mock('../../factories/EffectFactory', () => ({ createEffect: vi.fn(async () => scNode) }));
vi.mock('../connectAudio', () => ({ connectAudio: vi.fn() }));

import { ChannelRoutedEffectsManager } from '../ChannelRoutedEffects';

describe('channel-routed sidechain effects', () => {
  it('wire their source channel once the slots are assigned', async () => {
    const mgr = new ChannelRoutedEffectsManager({} as unknown as Tone.Gain);
    const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    const engine = {
      isAvailable: () => true,
      getWorkletNode: () => ({ connect: vi.fn(), disconnect: vi.fn(), port: { postMessage: vi.fn() } }),
      getAudioContext: () => ({ createGain: () => gain }),
      addIsolation: vi.fn(), removeIsolation: vi.fn(),
    };
    const cfg = { id: 'sc', category: 'tonejs', type: 'SidechainCompressor', enabled: true, wet: 100, parameters: { sidechainSource: 2 } };
    await mgr.rebuild(new Map([[0, [cfg as never]]]), engine as never);
    expect(wireMasterSidechain).toHaveBeenCalledWith(scNode, 2);
  });
});
