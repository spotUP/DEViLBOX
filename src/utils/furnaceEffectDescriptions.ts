/**
 * Furnace chip effect help, from Furnace's own sysDef.cpp handler descriptions
 * (furnaceEffectTable.gen.ts). Kept out of ft2EffectDescriptions.ts, which must stay a leaf
 * module for the API server build.
 */
import { FURNACE_EFFECT_TEXT } from '../engine/furnace-dispatch/furnaceEffectTable.gen';
import { STAND_INS, SYNTH_TO_DISPATCH } from '../engine/furnace-dispatch/synthPlatforms';
import type { EffectDescription } from './ft2EffectDescriptions';

/**
 * Furnace's own help text for a chip's effects (EffectHandler.description in sysDef.cpp, via
 * furnaceEffectTable.gen.ts). Lanes are Furnace's effect, post-note and pre-note handler maps.
 */
export function getFurnaceSystemEffects(systemId: number): EffectDescription[] {
  const lanes = FURNACE_EFFECT_TEXT[systemId];
  if (!lanes) return [];
  return [lanes.effect, lanes.post, lanes.pre].flatMap((lane) =>
    Object.keys(lane)
      .map(Number)
      .sort((a, b) => a - b)
      .map((code) => {
        const text = lane[code];
        const sep = text.indexOf(': ');
        return {
          command: sep > 0 ? text.slice(0, sep) : text,
          name: sep > 0 ? text.slice(sep + 2) : text,
          description: text,
          parameters: '',
          tick: 'both' as const,
          category: 'misc' as const,
        };
      }),
  );
}

/** Furnace chip effect list for a synth type; empty when the synth is not a Furnace chip. */
export function getAllFurnaceEffects(synthType?: string): EffectDescription[] {
  const systemId = synthType ? SYNTH_TO_DISPATCH[synthType] : undefined;
  if (systemId === undefined) return [];
  // Compound systems (Genesis, Arcade) have no handlers of their own; their FM part plays the instrument.
  const own = FURNACE_EFFECT_TEXT[systemId] ? systemId : STAND_INS[systemId]?.find((id) => FURNACE_EFFECT_TEXT[id]);
  return own === undefined ? [] : getFurnaceSystemEffects(own);
}

/** Get Furnace platform-specific effect description (first lane that defines the code wins) */
export function getFurnaceEffectDescription(effectCode: number, synthType?: string): EffectDescription | null {
  const prefix = effectCode.toString(16).toUpperCase().padStart(2, '0');
  return getAllFurnaceEffects(synthType).find((e) => e.command.toUpperCase().startsWith(prefix)) ?? null;
}

/** Check if a synth type has platform-specific effects */
export function hasFurnaceEffects(synthType: string): boolean {
  return getAllFurnaceEffects(synthType).length > 0;
}

