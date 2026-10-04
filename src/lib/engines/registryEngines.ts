/**
 * The native engines the registry knows, resolved once, for whoever needs
 * every engine and not a hand-written list of some.
 *
 * `WASM_ENGINES` (NativeEngineRouting.ts) is the one list of native engines.
 * Two modules kept their own list beside it and both went stale the same way:
 * the mixer's mute registrations missed six engines (F25), and masterDrop
 * took four engines down and let every other one play dry through a Drop
 * (F30). Both now resolve from the descriptors through here.
 *
 * Pure over the descriptor shape; a descriptor whose resolver fails (an
 * engine whose bundle is missing in this build) is skipped, never fatal.
 */

/** Descriptor shape this module reads - the registry's, narrowed. */
export interface RegistryDescriptorLike {
  key: string;
  staticRef?: unknown;
  dynamicResolver?: () => Promise<unknown>;
}

/** What a resolved engine class may answer. */
export interface RegistryEngineClass {
  hasInstance?: () => boolean;
  getInstance?: () => unknown;
  prototype?: Record<string, unknown>;
}

export interface ResolvedEngineClass {
  key: string;
  Engine: RegistryEngineClass;
}

/** Every descriptor's class, in registry order; failed resolvers skipped. */
export async function resolveRegistryEngineClasses(descriptors: readonly RegistryDescriptorLike[]): Promise<ResolvedEngineClass[]> {
  const out: ResolvedEngineClass[] = [];
  for (const d of descriptors) {
    let Engine: unknown = d.staticRef ?? null;
    if (!Engine && d.dynamicResolver) {
      try { Engine = await d.dynamicResolver(); } catch { continue; }
    }
    if (Engine) out.push({ key: d.key, Engine: Engine as RegistryEngineClass });
  }
  return out;
}

export interface LiveEngineOutput {
  key: string;
  output: GainNode;
}

/**
 * The `output` GainNode of every registry engine that is alive right now
 * (`hasInstance()` true and the instance carries an `output` with a `gain`).
 * Singletons only; an engine never instantiated has no audio path to touch.
 */
export async function liveRegistryEngineOutputs(descriptors: readonly RegistryDescriptorLike[]): Promise<LiveEngineOutput[]> {
  const out: LiveEngineOutput[] = [];
  for (const { key, Engine } of await resolveRegistryEngineClasses(descriptors)) {
    try {
      if (typeof Engine.hasInstance !== 'function' || !Engine.hasInstance()) continue;
      const inst = Engine.getInstance?.() as { output?: GainNode } | undefined;
      if (inst?.output?.gain) out.push({ key, output: inst.output });
    } catch { /* an engine that cannot answer has no output to drop */ }
  }
  return out;
}
