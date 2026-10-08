import type { EffectConfig } from '@typedefs/instrument';

/**
 * What the master chain is built from: the list structure (id, enabled, type,
 * channel routing) and the preset make-up gain, which MasterEffectsChain puts
 * into the chain at build time. Parameter and wet changes are not part of it
 * (they are applied to the live nodes). The make-up must be: restoring a saved
 * chain over an identical one changes only the make-up, and a key without it
 * never rebuilt, so the chain played without the gain it was calibrated with.
 */
export function masterChainKey(effects: readonly EffectConfig[], makeUpDb: number): string {
  return `${makeUpDb}#` + effects.map(e => `${e.id}:${e.enabled}:${e.type}:${(e.selectedChannels || []).join(',')}:${e.channelRole ?? ''}`).join('|');
}
