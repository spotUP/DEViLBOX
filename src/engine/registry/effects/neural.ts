/**
 * Neural effect registration — lazy loaded
 *
 * GuitarML / neural amp modeling effects. These use a single "Neural" effect type
 * that wraps NeuralEffectWrapper with a model index from GUITARML_MODEL_REGISTRY.
 */

import type { EffectConfig } from '@typedefs/instrument';
import type { EffectDescriptor } from '../EffectDescriptor';
import { EffectRegistry } from '../EffectRegistry';

/** Map GuitarML model characteristics to sensible default parameters (0-100 scale) */
function getModelDefaults(gain: string, tone: string): Record<string, number> {
  const driveMap: Record<string, number> = { low: 30, medium: 50, high: 65, extreme: 75 };
  const drive = driveMap[gain] ?? 50;
  const treble = tone === 'bright' ? 60 : tone === 'dark' ? 40 : 50;
  const bass   = tone === 'dark'   ? 60 : tone === 'bright' ? 40 : 50;
  return { drive, level: 70, treble, bass };
}

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
    // Apply model-characteristic defaults first so each model has its own starting tone
    const modelInfo = GUITARML_MODEL_REGISTRY.find(m => m.index === c.neuralModelIndex);
    if (modelInfo) {
      const defaults = getModelDefaults(modelInfo.characteristics.gain, modelInfo.characteristics.tone);
      Object.entries(defaults).forEach(([key, value]) => wrapper.setParameter(key, value));
    }
    // Stored user params override the characteristic defaults
    Object.entries(c.parameters).forEach(([key, value]) => {
      wrapper.setParameter(key, value as number);
    });
    return wrapper;
  },
  getDefaultParameters: () => ({}),
};

EffectRegistry.register(neuralEffect);
