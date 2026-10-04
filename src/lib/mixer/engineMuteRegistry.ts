/**
 * Which native engines the mixer's mute / solo mask reaches.
 *
 * The mixer kept its own hand-written list of engine imports beside the
 * engine registry (`WASM_ENGINES` in NativeEngineRouting.ts). Every engine
 * added to the registry after that list was written - FredReplayerEngine,
 * OktalyzerEngine, DssEngine, SynthesisEngine, SoundFactory2Engine,
 * AsapEngine - implemented `setMuteMask` and never received a mask: solo and
 * mute did nothing on a Fred Editor song (measured 2026-10-03, RMS 0.083 →
 * 0.092 → 0.089 across all / solo ch0 / solo ch3).
 *
 * One source: the registry's descriptors. An engine class takes part in the
 * bitmask path when it has a singleton (`hasInstance`) and a `setMuteMask`,
 * and in the gain path when it has `setChannelGain`. Pure, so the rule is
 * testable without instantiating an engine.
 */

import { resolveRegistryEngineClasses, type RegistryDescriptorLike } from '@/lib/engines/registryEngines';

export interface MuteCapableClass {
  hasInstance?: () => boolean;
  getInstance?: () => unknown;
  prototype?: { setMuteMask?: unknown; setChannelGain?: unknown };
}

export interface MuteRegistration {
  /** Descriptor key, used as the registry name. */
  key: string;
  Engine: MuteCapableClass;
  /** The engine answers `setMuteMask(mask)`. */
  bitmask: boolean;
  /** The engine answers `setChannelGain(ch, gain)`. */
  gain: boolean;
}

/** The registration a resolved engine class earns, or null when it can mute nothing. */
export function muteRegistrationFor(key: string, Engine: MuteCapableClass | null | undefined): MuteRegistration | null {
  if (!Engine || typeof Engine.hasInstance !== 'function') return null;
  const bitmask = typeof Engine.prototype?.setMuteMask === 'function';
  const gain = typeof Engine.prototype?.setChannelGain === 'function';
  if (!bitmask && !gain) return null;
  return { key, Engine, bitmask, gain };
}

/** Descriptor shape this module reads - the registry's, narrowed. */
export type MuteDescriptorLike = RegistryDescriptorLike;

/**
 * Resolve every descriptor's class and keep the ones that can mute. A
 * resolver that fails (an engine whose bundle is missing in this build) is
 * skipped, the way the mixer's warm-up always skipped a failed import.
 */
export async function collectMuteRegistrations(descriptors: readonly MuteDescriptorLike[]): Promise<MuteRegistration[]> {
  const out: MuteRegistration[] = [];
  for (const { key, Engine } of await resolveRegistryEngineClasses(descriptors)) {
    const reg = muteRegistrationFor(key, Engine as MuteCapableClass);
    if (reg) out.push(reg);
  }
  return out;
}
