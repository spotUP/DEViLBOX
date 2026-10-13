/**
 * Which player recognises these bytes, asked of nuade itself (plan D7: the router decides the engine from the file).
 *
 * The import route needs the answer on the main thread, where only the settings store and the file are at hand, so
 * Nuade.wasm is loaded here once, on first use, and only when a format's choice is 'nuade' and its extension matches.
 * Tests inject the Node loader (NuadeHeadless) with `setNuadeProbe`.
 */
import { loadNuadeModuleFromPublic, probeWith, type NuadeModule } from './nuadeModule';

/** 0 supported, 1 unsupported, 2 unsure, -1 no such player. */
export type NuadeProbe = (playerId: string, bytes: Uint8Array, fileName: string) => Promise<number>;

let module: Promise<NuadeModule> | null = null;

let probe: NuadeProbe = async (playerId, bytes, fileName) => {
  module ??= loadNuadeModuleFromPublic();
  return probeWith(await module, playerId, bytes, fileName);
};

export function nuadeProbe(): NuadeProbe { return probe; }

/** Replace the probe (tests); returns the previous one. */
export function setNuadeProbe(next: NuadeProbe): NuadeProbe {
  const previous = probe;
  probe = next;
  return previous;
}
