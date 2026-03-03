/**
 * Pure helper functions for instrument effects-chain operations.
 * Called by useInstrumentStore — the store remains the single Zustand store.
 */

import type { EffectConfig } from '@typedefs/instrument';
import { getDefaultEffectParameters } from '@engine/InstrumentFactory';

/** Generate a unique effect ID. */
function generateEffectId(): string {
  return `effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/** Create a new Tone.js-category effect config (legacy path). */
export function createEffect(effectType: EffectConfig['type']): EffectConfig {
  return {
    id: generateEffectId(),
    category: 'tonejs',
    type: effectType,
    enabled: true,
    wet: 50,
    parameters: getDefaultEffectParameters(effectType),
  };
}

/** Create an effect config from a full (minus id) descriptor. */
export function createEffectFromConfig(
  effect: Omit<EffectConfig, 'id'>,
): EffectConfig {
  return {
    ...effect,
    id: generateEffectId(),
    parameters: { ...getDefaultEffectParameters(effect.type), ...effect.parameters },
  };
}

/** Return a new effects array with the given effect removed. Returns null if not found. */
export function removeEffectFromList(
  effects: EffectConfig[],
  effectId: string,
): EffectConfig[] | null {
  const index = effects.findIndex((eff) => eff.id === effectId);
  if (index === -1) return null;
  const result = [...effects];
  result.splice(index, 1);
  return result;
}

/** Return a new effects array with items reordered. */
export function reorderEffectsList(
  effects: EffectConfig[],
  fromIndex: number,
  toIndex: number,
): EffectConfig[] {
  const result = [...effects];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Apply updates to an effect, back-filling defaults when parameters are sparse.
 * Returns the merged effect (new object).
 */
export function applyEffectUpdates(
  effect: EffectConfig,
  updates: Partial<EffectConfig>,
): EffectConfig {
  const base = { ...effect };

  // Back-fill defaults for sparse parameter maps
  if (
    updates.parameters &&
    Object.keys(base.parameters).length < Object.keys(getDefaultEffectParameters(base.type)).length
  ) {
    base.parameters = { ...getDefaultEffectParameters(base.type), ...base.parameters };
  }

  return { ...base, ...updates } as EffectConfig;
}
