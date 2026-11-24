/** Single place that turns a picker entry into a new effect config (master, instrument, synth editor). */
import type { EffectConfig, AudioEffectType as EffectType } from '@typedefs/instrument';
import type { AvailableEffect } from '@constants/unifiedEffects';
import { GUITARML_MODEL_REGISTRY, getModelCharacteristicDefaults } from '@constants/guitarMLRegistry';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';

export function buildEffectConfigFromAvailable(
  availableEffect: AvailableEffect,
  wet = 100,
): Omit<EffectConfig, 'id'> {
  const type = (availableEffect.type as EffectType) || 'Distortion';
  const params: Record<string, number | string> = { ...getDefaultEffectParameters(type) };

  if (availableEffect.category === 'neural' && availableEffect.neuralModelIndex !== undefined) {
    const model = GUITARML_MODEL_REGISTRY[availableEffect.neuralModelIndex];
    if (model?.parameters) {
      Object.entries(model.parameters).forEach(([key, param]) => {
        if (param) params[key] = param.default;
      });
      // Model-characteristic values so each amp starts with its own drive/tone, not a uniform 50
      Object.assign(params, getModelCharacteristicDefaults(model.characteristics.gain, model.characteristics.tone));
    }
  }

  return {
    category: availableEffect.category,
    type,
    enabled: true,
    wet,
    parameters: params,
    neuralModelIndex: availableEffect.neuralModelIndex,
    neuralModelName: availableEffect.category === 'neural' ? availableEffect.label : undefined,
  };
}
