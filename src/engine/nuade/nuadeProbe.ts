/**
 * Which player recognises these bytes, asked of nuade itself (plan D7: the router decides the engine from the file).
 *
 * The import route needs the answer on the main thread, where only the settings store and the file are at hand, so
 * Nuade.wasm is loaded here once, on first use, and only when a format's choice is 'nuade' and its extension matches.
 * Tests inject the Node loader (NuadeHeadless) with `setNuadeProbe`.
 */
import { probeWith, type NuadeModule } from './nuadeModule';

/** 0 supported, 1 unsupported, 2 unsure, -1 no such player. */
export type NuadeProbe = (playerId: string, bytes: Uint8Array, fileName: string) => Promise<number>;

let module: Promise<NuadeModule> | null = null;

async function loadMainThreadModule(): Promise<NuadeModule> {
  const base = import.meta.env.BASE_URL || '/';
  const [js, wasm] = await Promise.all([
    fetch(`${base}nuade/Nuade.js`).then((r) => { if (!r.ok) throw new Error(`Nuade.js: HTTP ${r.status}`); return r.text(); }),
    fetch(`${base}nuade/Nuade.wasm`).then((r) => { if (!r.ok) throw new Error(`Nuade.wasm: HTTP ${r.status}`); return r.arrayBuffer(); }),
  ]);
  const factory = new Function(`${js}\nreturn createNuade;`)() as (cfg: object) => Promise<NuadeModule>;
  return factory({ wasmBinary: wasm });
}

let probe: NuadeProbe = async (playerId, bytes, fileName) => {
  module ??= loadMainThreadModule();
  return probeWith(await module, playerId, bytes, fileName);
};

export function nuadeProbe(): NuadeProbe { return probe; }

/** Replace the probe (tests); returns the previous one. */
export function setNuadeProbe(next: NuadeProbe): NuadeProbe {
  const previous = probe;
  probe = next;
  return previous;
}
