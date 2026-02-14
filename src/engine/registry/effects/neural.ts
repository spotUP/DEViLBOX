/**
 * Neural effect registration — lazy loaded
 *
 * GuitarML / neural amp modeling effects. These use a single "Neural" effect type
 * that wraps NeuralEffectWrapper with a model index from GUITARML_MODEL_REGISTRY.
 */

import type { EffectConfig } from '@typedefs/instrument';
import type { EffectDescriptor } from '../EffectDescriptor';
import { EffectRegistry } from '../EffectRegistry';

const neuralEffect: EffectDescriptor = {
  id: 'Neural', name: 'Neural Amp Model', category: 'neural', group: 'Distortion',
  description: 'AI-modeled guitar amp and pedal tones',
  loadMode: 'lazy',
  create: async (c: EffectConfig) => {
    const { NeuralEffectWrapper } = await import('@engine/effects/NeuralEffectWrapper');
    if (c.neuralModelIndex === undefined) {
      throw new Error('Neural effect requires neuralModelIndex');
    }
    const wrapper = new NeuralEffectWrapper({
      modelIndex: c.neuralModelIndex,
      wet: c.wet / 100,
    });
    await wrapper.loadModel();
    Object.entries(c.parameters).forEach(([key, value]) => {
      wrapper.setParameter(key, value as number);
    });
    return wrapper;
  },
  getDefaultParameters: () => ({}),
};

EffectRegistry.register(neuralEffect);
