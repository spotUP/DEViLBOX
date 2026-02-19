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
    const { GUITARML_MODEL_REGISTRY } = await import('@/constants/guitarMLRegistry');
    if (c.neuralModelIndex === undefined) {
      throw new Error('Neural effect requires neuralModelIndex');
    }
    const wrapper = new NeuralEffectWrapper({
      modelIndex: c.neuralModelIndex,
      wet: c.wet / 100,
    });
    await wrapper.loadModel();
    // Apply stored user params (which include characteristic defaults when first added)
    Object.entries(c.parameters).forEach(([key, value]) => {
      wrapper.setParameter(key, value as number);
    });
    // Fallback: if params were not seeded (edge case), apply characteristic defaults
    if (Object.keys(c.parameters).length === 0) {
      const { getModelCharacteristicDefaults } = await import('@/constants/guitarMLRegistry');
      const modelInfo = GUITARML_MODEL_REGISTRY.find(m => m.index === c.neuralModelIndex);
      if (modelInfo) {
        const defaults = getModelCharacteristicDefaults(modelInfo.characteristics.gain, modelInfo.characteristics.tone);
        Object.entries(defaults).forEach(([key, value]) => wrapper.setParameter(key, value));
      }
    }
    return wrapper;
  },
  getDefaultParameters: () => ({}),
};

EffectRegistry.register(neuralEffect);
