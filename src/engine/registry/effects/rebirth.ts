/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * ReBirth effect registrations: distortion, delay, compressor and pattern controlled filter.
 * Parameters are the original normalised 0..1 knobs.
 */
import type { EffectConfig } from '@typedefs/instrument';
import { EffectRegistry } from '../EffectRegistry';
import { paramNumber } from './paramNumber';

const knobs = (c: EffectConfig, defaults: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, d] of Object.entries(defaults)) out[k] = paramNumber(c.parameters[k], d);
  return out;
};

const DIST = { amount: 0.4, shape: 0.55 };
const DELAY = { steps: 2 / 31, feedback: 0.45, pan: 0.5, triplet: 0 };
const COMP = { amount: 0.3, threshold: 0.5 };
const PCF = { freq: 0.45, reso: 0.5, amount: 0.6, decay: 0.4, wave: 0, mode: 1 };

EffectRegistry.register({
  id: 'ReRebirthDistortion', name: 're-rebirth Distortion', category: 'wasm', group: 'Distortion', loadMode: 'eager',
  create: async (c: EffectConfig) => {
    const { RebirthDistortion } = await import('@engine/rebirtheffects/rebirthEffects');
    return new RebirthDistortion({ ...knobs(c, DIST), wet: c.wet / 100 });
  },
  getDefaultParameters: () => ({ ...DIST }),
});

EffectRegistry.register({
  id: 'ReRebirthDelay', name: 're-rebirth Delay', category: 'wasm', group: 'Delay', loadMode: 'eager',
  create: async (c: EffectConfig) => {
    const { RebirthDelay } = await import('@engine/rebirtheffects/rebirthEffects');
    return new RebirthDelay({ ...knobs(c, DELAY), wet: c.wet / 100 });
  },
  getDefaultParameters: () => ({ ...DELAY }),
});

EffectRegistry.register({
  id: 'ReRebirthCompressor', name: 're-rebirth Compressor', category: 'wasm', group: 'Dynamics', loadMode: 'eager',
  create: async (c: EffectConfig) => {
    const { RebirthCompressor } = await import('@engine/rebirtheffects/rebirthEffects');
    const node = new RebirthCompressor({ ...knobs(c, COMP), wet: c.wet / 100 });
    await node.ready;
    return node;
  },
  getDefaultParameters: () => ({ ...COMP }),
});

EffectRegistry.register({
  id: 'ReRebirthPatternFilter', name: 're-rebirth Pattern Filter', category: 'wasm', group: 'Filter', loadMode: 'eager',
  create: async (c: EffectConfig) => {
    const { RebirthPatternFilter } = await import('@engine/rebirtheffects/rebirthEffects');
    return new RebirthPatternFilter({ ...knobs(c, PCF), wet: c.wet / 100 });
  },
  getDefaultParameters: () => ({ ...PCF }),
});
