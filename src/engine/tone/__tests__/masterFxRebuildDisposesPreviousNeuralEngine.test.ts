/**
 * Two overlapping Master FX slot rebuilds leaked a GuitarML worklet each.
 *
 * ChannelRoutedEffectsManager.rebuild() is teardown + async effect creation +
 * slot assignment. Two concurrent calls both tore down before either stored
 * its slots; the first call's neural effect was overwritten and never disposed
 * (console showed "[GuitarMLEngine] Initialized" 3 times for ONE Neural effect,
 * 3 worklets alive on the audio thread). Rebuilds must run one at a time.
 */
import { describe, it, expect, vi } from 'vitest';

const counts = vi.hoisted(() => ({ constructed: 0, disposed: 0 }));

vi.mock('tone', () => ({
  Gain: class { connect() {} disconnect() {} dispose() {} },
  Signal: class {},
  ToneAudioNode: class {},
}));
vi.mock('../../factories/EffectFactory', () => ({
  createEffect: async () => {
    counts.constructed++;
    await new Promise((r) => setTimeout(r, 20)); // worklet module load
    return { input: {}, output: {}, dispose: () => { counts.disposed++; } };
  },
}));
vi.mock('../connectAudio', () => ({ connectAudio: vi.fn() }));
vi.mock('../../dub/PerChannelDubFx', () => ({ PerChannelDubFx: class {} }));
vi.mock('@stores/storeAccess', () => ({ getMixerStoreRefOrNull: () => null, getTrackerStoreRef: () => null }));
vi.mock('@stores/useDubStore', () => ({ useDubStore: { getState: () => ({}), subscribe: () => () => {} } }));
vi.mock('@utils/audio-context', () => ({ getNativeAudioNode: () => null }));

import { ChannelRoutedEffectsManager } from '../ChannelRoutedEffects';
import type { EffectConfig } from '@typedefs/instrument';

const gainNode = { gain: { value: 1 }, connect: () => {}, disconnect: () => {} };
const engine = {
  isAvailable: () => true,
  getWorkletNode: () => ({ connect: () => {}, disconnect: () => {} }),
  supportsIsolationSlots: () => true,
  getAudioContext: () => ({ createGain: () => ({ ...gainNode, gain: { value: 1 } }) }),
  addIsolation: () => {},
  removeIsolation: () => {},
};
const neural = { id: 'n1', type: 'Neural', enabled: true, wet: 100, parameters: {} } as unknown as EffectConfig;

describe('master FX rebuild disposes the previous neural engine', () => {
  it('leaves one live neural effect after two overlapping rebuilds', async () => {
    const mgr = new ChannelRoutedEffectsManager({} as never);
    mgr.setStripRouter(() => {});
    const routed = () => new Map<number, EffectConfig[]>([[3, [neural]]]);
    await Promise.all([
      mgr.rebuild(new Map(), engine as never, routed()),
      mgr.rebuild(new Map(), engine as never, routed()),
    ]);
    expect(counts.constructed).toBe(2);
    expect(counts.constructed - counts.disposed).toBe(1);
  });
});
